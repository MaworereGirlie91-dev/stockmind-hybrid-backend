import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import '../core/network/sync_api_client.dart';
import '../core/sync/sync_state.dart';
import '../data/repositories/local_repository.dart';

class SyncService {
  SyncService({
    required LocalRepository repository,
    required SyncApiClient apiClient,
  })  : _repository = repository,
        _apiClient = apiClient;

  final LocalRepository _repository;
  final SyncApiClient _apiClient;

  bool _isSyncing = false;
  int _consecutiveFailures = 0;
  DateTime? _lastSuccessfulSync;

  bool get isSyncing => _isSyncing;

  Future<SyncSnapshot> syncNow({
    required bool online,
    String? bearerToken,
  }) async {
    final pendingBefore = await _repository.pendingCount();
    final conflictBefore = await _repository.conflictCount();

    if (!online) {
      return SyncSnapshot(
        health: SyncHealth.offline,
        pendingCount: pendingBefore,
        conflictCount: conflictBefore,
        lastSyncAt: _lastSuccessfulSync,
        message: 'Device offline. Local changes will sync later.',
      );
    }

    if (_isSyncing) {
      return SyncSnapshot(
        health: pendingBefore > 0 ? SyncHealth.pending : SyncHealth.synced,
        pendingCount: pendingBefore,
        conflictCount: conflictBefore,
        lastSyncAt: _lastSuccessfulSync,
        message: 'Sync already in progress.',
      );
    }

    _isSyncing = true;
    try {
      const maxPushBatchesPerRun = 12;
      String? firstPushFailure;

      for (var batch = 0; batch < maxPushBatchesPerRun; batch += 1) {
        final queueItems = await _repository.pendingQueue(limit: 300);
        if (queueItems.isEmpty) {
          break;
        }

        final operations = <Map<String, dynamic>>[];
        for (final item in queueItems) {
          final payload = jsonDecode(item.payloadJson) as Map<String, dynamic>;
          final hydratedPayload = await _hydratePayloadIds(
            tableName: item.tableName,
            payload: payload,
          );

          operations.add(<String, dynamic>{
            'operation_id': item.operationId,
            'table': item.tableName,
            'action': item.action,
            'local_id': item.localId,
            'remote_id': item.remoteId,
            'payload': hydratedPayload,
            'client_updated_at': item.clientUpdatedAt,
            'row_version': item.rowVersion,
          });
        }

        final pushResponse = await _apiClient.push(
          deviceId: _repository.deviceId,
          operations: operations,
          bearerToken: bearerToken,
        );

        final queueByOperationId = {
          for (final item in queueItems) item.operationId: item
        };

        var acknowledgedCount = 0;
        for (final ack
            in (pushResponse['acknowledged'] as List<dynamic>? ?? const [])) {
          if (ack is! Map<String, dynamic>) {
            continue;
          }
          final operationId = ack['operation_id'] as String?;
          if (operationId == null) {
            continue;
          }
          final queue = queueByOperationId[operationId];
          if (queue == null) {
            continue;
          }
          acknowledgedCount += 1;
          await _repository.markSynced(
            queue: queue,
            remoteId: (ack['remote_id'] as String?) ?? (queue.remoteId ?? ''),
            updatedAt: (ack['updated_at'] as String?) ??
                DateTime.now().toUtc().toIso8601String(),
            rowVersion:
                ((ack['row_version'] as num?) ?? queue.rowVersion).toInt(),
          );
        }

        var conflictCount = 0;
        for (final conflict
            in (pushResponse['conflicts'] as List<dynamic>? ?? const [])) {
          if (conflict is! Map<String, dynamic>) {
            continue;
          }
          final operationId = conflict['operation_id'] as String?;
          if (operationId == null) {
            continue;
          }
          final queue = queueByOperationId[operationId];
          if (queue == null) {
            continue;
          }
          conflictCount += 1;
          await _repository.markConflict(
            queue: queue,
            remoteId:
                (conflict['remote_id'] as String?) ?? (queue.remoteId ?? ''),
            serverUpdatedAt: (conflict['server_updated_at'] as String?) ??
                DateTime.now().toUtc().toIso8601String(),
            rowVersion:
                ((conflict['server_row_version'] as num?) ?? queue.rowVersion)
                    .toInt(),
          );
        }

        var failedCount = 0;
        for (final failed
            in (pushResponse['failed'] as List<dynamic>? ?? const [])) {
          if (failed is! Map<String, dynamic>) {
            continue;
          }
          final operationId = failed['operation_id'] as String?;
          if (operationId == null) {
            continue;
          }
          final queue = queueByOperationId[operationId];
          if (queue == null) {
            continue;
          }
          failedCount += 1;
          final errorMessage = (failed['error'] as String?) ?? 'Push failed';
          firstPushFailure ??= errorMessage;
          await _repository.markFailed(queue, errorMessage);
        }

        final touched = acknowledgedCount + conflictCount + failedCount;
        if (touched == 0) {
          firstPushFailure ??=
              'Push returned no actionable acknowledgements, conflicts, or failures.';
          break;
        }

        if (failedCount > 0 && acknowledgedCount == 0 && conflictCount == 0) {
          // Avoid retrying the same failed-only batch repeatedly in one run.
          break;
        }
      }

      final checkpoints = await _repository.checkpoints();
      final pullResponse = await _apiClient.pull(
        deviceId: _repository.deviceId,
        checkpoints: checkpoints,
        bearerToken: bearerToken,
      );

      final dynamicChanges =
          (pullResponse['changes'] as Map<String, dynamic>? ?? const {});
      final dynamicCheckpoints =
          (pullResponse['checkpoints'] as Map<String, dynamic>? ?? const {});

      await _repository.applyRemoteChanges(
        changes: dynamicChanges,
        checkpoints: dynamicCheckpoints,
      );

      _consecutiveFailures = 0;
      _lastSuccessfulSync = DateTime.now();

      final pendingAfter = await _repository.pendingCount();
      final conflictAfter = await _repository.conflictCount();

      final health = firstPushFailure != null
          ? SyncHealth.failed
          : conflictAfter > 0
              ? SyncHealth.conflict
              : pendingAfter > 0
                  ? SyncHealth.pending
                  : SyncHealth.synced;

      return SyncSnapshot(
        health: health,
        pendingCount: pendingAfter,
        conflictCount: conflictAfter,
        lastSyncAt: _lastSuccessfulSync,
        message: health == SyncHealth.failed
            ? (firstPushFailure ?? 'Some queued changes failed to sync.')
            : health == SyncHealth.synced
                ? 'All changes synced.'
                : health == SyncHealth.pending
                    ? 'Waiting to sync remaining changes.'
                    : 'Conflicts detected. Review required.',
      );
    } catch (error) {
      _consecutiveFailures += 1;
      final delaySeconds =
          math.min(30, math.pow(2, _consecutiveFailures).toInt());
      await Future<void>.delayed(Duration(seconds: delaySeconds));

      final pendingAfter = await _repository.pendingCount();
      final conflictAfter = await _repository.conflictCount();

      return SyncSnapshot(
        health: SyncHealth.failed,
        pendingCount: pendingAfter,
        conflictCount: conflictAfter,
        lastSyncAt: _lastSuccessfulSync,
        message: error is Exception ? error.toString() : 'Sync failed.',
      );
    } finally {
      _isSyncing = false;
    }
  }

  Future<Map<String, dynamic>> _hydratePayloadIds({
    required String tableName,
    required Map<String, dynamic> payload,
  }) async {
    final hydrated = Map<String, dynamic>.from(payload);

    if (tableName == 'book_copies' ||
        tableName == 'book_boxes' ||
        tableName == 'sales') {
      final hasBookId =
          (hydrated['book_id'] as String?)?.trim().isNotEmpty ?? false;
      final bookLocalId = hydrated['book_local_id'] as String?;
      if (!hasBookId && bookLocalId != null && bookLocalId.trim().isNotEmpty) {
        final remoteBookId = await _repository.remoteBookIdByLocal(bookLocalId);
        if (remoteBookId != null) {
          hydrated['book_id'] = remoteBookId;
        }
      }
    }

    if (tableName == 'sales') {
      final hasCopyId =
          (hydrated['copy_id'] as String?)?.trim().isNotEmpty ?? false;
      final copyLocalId = hydrated['copy_local_id'] as String?;
      if (!hasCopyId && copyLocalId != null && copyLocalId.trim().isNotEmpty) {
        final remoteCopyId = await _repository.remoteCopyIdByLocal(copyLocalId);
        if (remoteCopyId != null) {
          hydrated['copy_id'] = remoteCopyId;
        }
      }
    }

    return hydrated;
  }
}
