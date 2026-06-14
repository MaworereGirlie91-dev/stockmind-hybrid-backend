import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

import '../core/config/app_config.dart';
import '../core/location/location_utils.dart';
import '../core/network/sync_api_client.dart';
import '../core/sync/sync_state.dart';
import '../data/models/sync_models.dart';
import '../data/repositories/local_repository.dart';
import 'auth_service.dart';
import 'sync_service.dart';

class AppState extends ChangeNotifier {
  static const Duration _inventoryUndoWindow = Duration(seconds: 10);

  AppState._({
    required LocalRepository repository,
    required AuthService authService,
    required SyncService syncService,
  })  : _repository = repository,
        _authService = authService,
        _syncService = syncService;

  final LocalRepository _repository;
  final AuthService _authService;
  final SyncService _syncService;
  _InventoryAction? _inventoryUndoAction;
  DateTime? _inventoryUndoExpiresAt;
  Timer? _inventoryUndoTimer;

  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  Timer? _periodicSyncTimer;

  bool _online = false;
  bool _loading = true;
  String? _username;
  String? _token;
  SyncSnapshot _syncSnapshot = const SyncSnapshot(health: SyncHealth.pending);

  bool get loading => _loading;
  bool get isOnline => _online;
  bool get isLoggedIn => (_token?.trim().isNotEmpty ?? false);
  String? get username => _username;
  String? get token => _token;
  String get deviceId => _repository.deviceId;
  SyncSnapshot get syncSnapshot => _syncSnapshot;
  bool get canUndoInventoryAction {
    final expiresAt = _inventoryUndoExpiresAt;
    if (_inventoryUndoAction == null || expiresAt == null) {
      return false;
    }
    return DateTime.now().isBefore(expiresAt);
  }
  bool get canRedoInventoryAction => false;
  bool get canSync =>
      (_token?.trim().isNotEmpty ?? false) ||
      ((AppConfig.syncApiToken?.trim().isNotEmpty ?? false) &&
          (_username?.trim().isNotEmpty ?? false));

  static Future<AppState> bootstrap() async {
    final repository = await LocalRepository.create();
    final apiClient = SyncApiClient();
    final authService =
        AuthService(repository: repository, apiClient: apiClient);
    final syncService =
        SyncService(repository: repository, apiClient: apiClient);

    final state = AppState._(
      repository: repository,
      authService: authService,
      syncService: syncService,
    );

    await state._load();
    state._watchConnectivity();
    return state;
  }

  Future<void> _load() async {
    final session = await _authService.currentSession();
    if (session != null) {
      _username = session['username'] as String?;
      _token = session['token'] as String?;
    }

    final connectivity = await Connectivity().checkConnectivity();
    _online = connectivity.any((result) => result != ConnectivityResult.none);

    await refreshSyncIndicators();
    _loading = false;
    notifyListeners();
    _startPeriodicSyncLoop();

    if (_online && canSync) {
      unawaited(syncNow());
    }
  }

  void _watchConnectivity() {
    _connectivitySubscription =
        Connectivity().onConnectivityChanged.listen((results) {
      final nextOnline =
          results.any((result) => result != ConnectivityResult.none);
      if (_online == nextOnline) {
        return;
      }
      _online = nextOnline;
      notifyListeners();

      if (_online && canSync) {
        unawaited(syncNow());
      } else {
        unawaited(refreshSyncIndicators());
      }
    });
  }

  Future<void> disposeAsync() async {
    await _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
    _periodicSyncTimer?.cancel();
    _periodicSyncTimer = null;
  }

  Future<void> signIn(String username, String password) async {
    final session =
        await _authService.signIn(username: username, password: password);
    _username = session['username'] as String?;
    _token = session['token'] as String?;
    _startPeriodicSyncLoop();
    notifyListeners();

    await syncNow();
  }

  Future<void> signOut() async {
    await _authService.signOut();
    _username = null;
    _token = null;
    _clearInventoryUndo();
    await refreshSyncIndicators();
    notifyListeners();
  }

  void _startPeriodicSyncLoop() {
    _periodicSyncTimer?.cancel();
    _periodicSyncTimer = Timer.periodic(const Duration(seconds: 30), (_) async {
      if (!_online || !canSync) {
        return;
      }
      await syncNow();
    });
  }

  Future<void> requestPasswordReset({
    required String email,
    required String phone,
  }) {
    return _authService.requestPasswordReset(email: email, phone: phone);
  }

  Future<void> refreshSyncIndicators() async {
    final pending = await _repository.pendingCount();
    final conflicts = await _repository.conflictCount();
    final failedQueue = await _repository.failedQueueCount();
    final latestError = await _repository.latestQueueError();

    final health = !_online
        ? SyncHealth.offline
        : conflicts > 0
            ? SyncHealth.conflict
            : failedQueue > 0
                ? SyncHealth.failed
            : pending > 0
                ? SyncHealth.pending
                : SyncHealth.synced;

    _syncSnapshot = SyncSnapshot(
      health: health,
      pendingCount: pending,
      conflictCount: conflicts,
      lastSyncAt: _syncSnapshot.lastSyncAt,
      message: health == SyncHealth.failed
          ? (latestError ?? _syncSnapshot.message)
          : _syncSnapshot.message,
    );
    notifyListeners();
  }

  Future<void> syncNow() async {
    if (!canSync) {
      await refreshSyncIndicators();
      return;
    }

    _syncSnapshot = _syncSnapshot.copyWith(
      health: _online ? SyncHealth.pending : SyncHealth.offline,
      message: _online ? 'Syncing changes...' : 'Offline mode active.',
    );
    notifyListeners();

    final snapshot = await _syncService.syncNow(
      online: _online,
      bearerToken: _token,
    );

    _syncSnapshot = snapshot;
    notifyListeners();
  }

  Future<List<InventoryRow>> inventory({String search = ''}) {
    return _repository.listInventory(search: search);
  }

  Future<List<BoxInventoryRow>> boxInventory({String search = ''}) {
    return _repository.listBoxInventory(search: search);
  }

  Future<List<LocationSummaryRow>> locationSummary() {
    return _repository.locationSummary();
  }

  Future<List<InventoryRow>> inStockCopies() {
    return _repository.listInStockCopies();
  }

  Future<List<SaleLocal>> sales({int limit = 500}) {
    return _repository.listSales(limit: limit);
  }

  Future<Map<String, num>> summary() {
    return _repository.summary();
  }

  Future<void> _runPostMutationSync() async {
    await refreshSyncIndicators();
    if (_online && canSync) {
      await syncNow();
    } else {
      notifyListeners();
    }
  }

  void _pushInventoryAction(_InventoryAction action) {
    _inventoryUndoTimer?.cancel();
    _inventoryUndoAction = action;
    _inventoryUndoExpiresAt = DateTime.now().add(_inventoryUndoWindow);
    _inventoryUndoTimer = Timer(_inventoryUndoWindow, () {
      _inventoryUndoAction = null;
      _inventoryUndoExpiresAt = null;
      notifyListeners();
    });
    notifyListeners();
  }

  void _clearInventoryUndo() {
    _inventoryUndoTimer?.cancel();
    _inventoryUndoTimer = null;
    _inventoryUndoAction = null;
    _inventoryUndoExpiresAt = null;
  }

  Future<void> addSingleCopy({
    required String epcTag,
    required String title,
    String? isbn,
    String? category,
    String? location,
    String? locationType,
    String? locationName,
  }) async {
    await _repository.createSingleCopy(
      epcTag: epcTag,
      title: title,
      isbn: isbn,
      category: category,
      location: location,
      locationType: locationType,
      locationName: locationName,
    );

    await _runPostMutationSync();
  }

  Future<BulkCreateResult> addBulkCopies({
    required String title,
    String? isbn,
    String? category,
    String? location,
    String? locationType,
    String? locationName,
    required List<String> epcTags,
  }) async {
    final result = await _repository.createBulkCopies(
      title: title,
      isbn: isbn,
      category: category,
      location: location,
      locationType: locationType,
      locationName: locationName,
      epcTags: epcTags,
    );

    await _runPostMutationSync();
    return result;
  }

  Future<void> addBoxTag({
    required String epcTag,
    required String title,
    required int quantity,
    String? isbn,
    String? category,
    String? location,
    String? locationType,
    String? locationName,
  }) async {
    await _repository.createBoxTag(
      epcTag: epcTag,
      title: title,
      quantity: quantity,
      isbn: isbn,
      category: category,
      location: location,
      locationType: locationType,
      locationName: locationName,
    );

    await _runPostMutationSync();
  }

  Future<void> clearAllBoxTags() async {
    await _repository.clearAllBoxTags();
    await _runPostMutationSync();
  }

  Future<void> completeSale({
    required String bookLocalId,
    required int quantity,
    String? notes,
  }) async {
    await _repository.recordSaleByBook(
      bookLocalId: bookLocalId,
      quantity: quantity,
      notes: notes,
    );

    await _runPostMutationSync();
  }

  Future<void> completeSaleByEpcTags({
    required List<String> epcTags,
    String? notes,
  }) async {
    await _repository.recordSaleByEpcTags(
      epcTags: epcTags,
      notes: notes,
    );

    await _runPostMutationSync();
  }

  Future<void> updateCopyLocation({
    required String copyLocalId,
    String? location,
    String? locationType,
    String? locationName,
  }) async {
    final snapshot = await _repository.readCopySnapshot(copyLocalId);
    if (snapshot == null) {
      throw StateError('Copy not found.');
    }

    final normalizedCurrent = (snapshot.location ?? '').trim();
    final normalizedCurrentType = normalizeLocationType(snapshot.locationType);
    final normalizedCurrentName = (snapshot.locationName ?? '').trim();
    final normalizedNext = parseLocation(
      location: location,
      locationType: locationType,
      locationName: locationName,
    );

    final normalizedNextValue = (normalizedNext.location ?? '').trim();
    final normalizedNextType = normalizeLocationType(normalizedNext.locationType);
    final normalizedNextName = (normalizedNext.locationName ?? '').trim();

    if (normalizedCurrent == normalizedNextValue &&
        normalizedCurrentType == normalizedNextType &&
        normalizedCurrentName == normalizedNextName) {
      return;
    }

    await _repository.updateCopyLocation(
      copyLocalId: copyLocalId,
      location: normalizedNextValue.isEmpty ? null : normalizedNextValue,
      locationType: normalizedNextType,
      locationName: normalizedNextName.isEmpty ? null : normalizedNextName,
    );

    _pushInventoryAction(
      _InventoryAction(
        label: normalizedNextValue.isEmpty
            ? 'clear location'
            : 'update location',
        undo: () => _repository.updateCopyLocation(
          copyLocalId: copyLocalId,
          location: normalizedCurrent.isEmpty ? null : normalizedCurrent,
          locationType: normalizedCurrentType,
          locationName:
              normalizedCurrentName.isEmpty ? null : normalizedCurrentName,
        ),
      ),
    );

    await _runPostMutationSync();
  }

  Future<void> deleteCopy(String copyLocalId) async {
    final snapshot = await _repository.readCopySnapshot(copyLocalId);
    if (snapshot == null) {
      return;
    }
    final saleSnapshots =
        await _repository.readSaleSnapshotsForCopies(<String>[copyLocalId]);

    await _repository.deleteSalesForCopies(<String>[copyLocalId]);
    await _repository.deleteCopy(copyLocalId);

    _pushInventoryAction(
      _InventoryAction(
        label: 'delete copy',
        undo: () async {
          await _repository.restoreCopyFromSnapshot(snapshot);
          await _repository.restoreSalesFromSnapshots(saleSnapshots);
        },
      ),
    );

    await _runPostMutationSync();
  }

  Future<void> deleteCopies(List<String> copyLocalIds) async {
    final normalizedIds = copyLocalIds
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toSet()
        .toList();
    if (normalizedIds.isEmpty) {
      return;
    }

    final snapshots = <CopySnapshot>[];
    for (final copyLocalId in normalizedIds) {
      final snapshot = await _repository.readCopySnapshot(copyLocalId);
      if (snapshot != null) {
        snapshots.add(snapshot);
      }
    }

    if (snapshots.isEmpty) {
      return;
    }
    final saleSnapshots = await _repository.readSaleSnapshotsForCopies(
      snapshots.map((snapshot) => snapshot.localId).toList(),
    );

    await _repository.deleteSalesForCopies(
      snapshots.map((snapshot) => snapshot.localId).toList(),
    );
    for (final snapshot in snapshots) {
      await _repository.deleteCopy(snapshot.localId);
    }

    _pushInventoryAction(
      _InventoryAction(
        label: snapshots.length == 1 ? 'delete copy' : 'delete copies',
        undo: () async {
          for (final snapshot in snapshots.reversed) {
            await _repository.restoreCopyFromSnapshot(snapshot);
          }
          await _repository.restoreSalesFromSnapshots(saleSnapshots);
        },
      ),
    );

    await _runPostMutationSync();
  }

  Future<void> finalizeStockCount({
    required Set<String> scannedEpcs,
    required String locationFilter,
  }) async {
    await _repository.applyStockCountResults(
      scannedEpcs: scannedEpcs,
      locationFilter: locationFilter,
    );

    await _runPostMutationSync();
  }

  Future<String?> undoInventoryAction() async {
    if (!canUndoInventoryAction || _inventoryUndoAction == null) {
      return null;
    }

    final action = _inventoryUndoAction!;
    _clearInventoryUndo();
    try {
      await action.undo();
      await _runPostMutationSync();
      notifyListeners();
      return action.label;
    } catch (_) {
      rethrow;
    }
  }

  Future<String?> redoInventoryAction() async {
    return null;
  }

  @override
  void dispose() {
    _inventoryUndoTimer?.cancel();
    unawaited(disposeAsync());
    super.dispose();
  }
}

class _InventoryAction {
  const _InventoryAction({
    required this.label,
    required this.undo,
  });

  final String label;
  final Future<void> Function() undo;
}
