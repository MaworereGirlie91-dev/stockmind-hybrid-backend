import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

import '../../core/location/location_utils.dart';
import '../local/local_database.dart';
import '../models/sync_models.dart';

class BulkCreateResult {
  const BulkCreateResult({
    required this.requestedCount,
    required this.addedTags,
    required this.duplicateTags,
    required this.failed,
  });

  final int requestedCount;
  final List<String> addedTags;
  final List<String> duplicateTags;
  final Map<String, String> failed;

  int get addedCount => addedTags.length;
  bool get hasIssues => duplicateTags.isNotEmpty || failed.isNotEmpty;
}

class CopySnapshot {
  const CopySnapshot({
    required this.localId,
    required this.remoteId,
    required this.bookLocalId,
    required this.bookRemoteId,
    required this.epcTag,
    required this.location,
    required this.locationType,
    required this.locationName,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.deletedAt,
    required this.rowVersion,
  });

  final String localId;
  final String? remoteId;
  final String bookLocalId;
  final String? bookRemoteId;
  final String epcTag;
  final String? location;
  final String? locationType;
  final String? locationName;
  final String status;
  final String createdAt;
  final String updatedAt;
  final String? deletedAt;
  final int rowVersion;
}

class SaleSnapshot {
  const SaleSnapshot({
    required this.localId,
    required this.remoteId,
    required this.copyLocalId,
    required this.copyRemoteId,
    required this.bookLocalId,
    required this.bookRemoteId,
    required this.epcTag,
    required this.title,
    required this.isbn,
    required this.category,
    required this.location,
    required this.locationType,
    required this.locationName,
    required this.pricePaid,
    required this.notes,
    required this.soldAt,
    required this.updatedAt,
    required this.deletedAt,
    required this.rowVersion,
  });

  final String localId;
  final String? remoteId;
  final String? copyLocalId;
  final String? copyRemoteId;
  final String? bookLocalId;
  final String? bookRemoteId;
  final String epcTag;
  final String title;
  final String? isbn;
  final String? category;
  final String? location;
  final String? locationType;
  final String? locationName;
  final double pricePaid;
  final String? notes;
  final String soldAt;
  final String updatedAt;
  final String? deletedAt;
  final int rowVersion;
}

class LocalRepository {
  LocalRepository._({required this.deviceId});

  static const _deviceKey = 'stockmind_device_id';
  static final _uuid = Uuid();

  final LocalDatabase _database = LocalDatabase.instance;
  final String deviceId;

  static Future<LocalRepository> create() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_deviceKey);
    final deviceId = existing ?? _uuid.v4();
    if (existing == null) {
      await prefs.setString(_deviceKey, deviceId);
    }
    return LocalRepository._(deviceId: deviceId);
  }

  String _now() => DateTime.now().toUtc().toIso8601String();

  _LocationPayload _resolveLocationPayload({
    String? location,
    String? locationType,
    String? locationName,
  }) {
    final parsed = parseLocation(
      location: location,
      locationType: locationType,
      locationName: locationName,
    );
    return _LocationPayload(
      location: parsed.location,
      locationType: parsed.locationType,
      locationName: parsed.locationName,
    );
  }

  Future<Map<String, dynamic>?> readAuthSession() async {
    final rows = await _database.query('auth_session',
        where: 'id = ?', whereArgs: [1], limit: 1);
    if (rows.isEmpty) {
      return null;
    }
    return rows.first.cast<String, dynamic>();
  }

  Future<void> saveAuthSession({
    required String username,
    required String token,
    required String role,
    required String expiresAt,
    String? passwordHash,
    String? passwordSalt,
  }) async {
    await _database.insert(
      'auth_session',
      {
        'id': 1,
        'username': username,
        'token': token,
        'role': role,
        'device_id': deviceId,
        'expires_at': expiresAt,
        'password_hash': passwordHash,
        'password_salt': passwordSalt,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> clearAuthSession() async {
    await _database.update(
      'auth_session',
      {
        'token': null,
        'role': null,
        'expires_at': null,
      },
      where: 'id = ?',
      whereArgs: [1],
    );
  }

  Future<List<InventoryRow>> listInventory({String search = ''}) async {
    final db = await _database.database;
    final query = search.trim().toLowerCase();

    final rows = await db.rawQuery(
      '''
      SELECT
        c.local_id AS copy_local_id,
        c.remote_id AS copy_remote_id,
        c.book_local_id AS book_local_id,
        c.book_remote_id AS book_remote_id,
        c.epc_tag,
        c.location,
        c.location_type,
        c.location_name,
        c.status,
        c.created_at AS date_added,
        c.updated_at,
        c.sync_status,
        b.title,
        b.isbn,
        b.category
      FROM book_copies_local c
      LEFT JOIN books_master_local b ON b.local_id = c.book_local_id
      WHERE c.deleted_at IS NULL
      ORDER BY c.updated_at DESC
      ''',
    );

    final mapped = rows
        .map(
          (row) => InventoryRow(
            copyLocalId: row['copy_local_id'] as String,
            copyRemoteId: row['copy_remote_id'] as String?,
            bookLocalId: row['book_local_id'] as String,
            bookRemoteId: row['book_remote_id'] as String?,
            epcTag: row['epc_tag'] as String,
            title: (row['title'] as String?) ?? 'Unknown',
            isbn: row['isbn'] as String?,
            category: row['category'] as String?,
            location: row['location'] as String?,
            locationType: row['location_type'] as String?,
            locationName: row['location_name'] as String?,
            status: row['status'] as String,
            dateAdded: row['date_added'] as String,
            updatedAt: row['updated_at'] as String,
            syncStatus: syncStatusFromDb(
                (row['sync_status'] as String?) ?? SyncStatus.pending.name),
          ),
        )
        .toList();

    if (query.isEmpty) {
      return mapped;
    }

    return mapped
        .where(
          (item) =>
              item.title.toLowerCase().contains(query) ||
              item.epcTag.toLowerCase().contains(query) ||
              (item.isbn?.toLowerCase().contains(query) ?? false) ||
              (item.category?.toLowerCase().contains(query) ?? false) ||
              (item.locationType?.toLowerCase().contains(query) ?? false) ||
              (item.locationName?.toLowerCase().contains(query) ?? false) ||
              (item.location?.toLowerCase().contains(query) ?? false),
        )
        .toList();
  }

  Future<List<BoxInventoryRow>> listBoxInventory({String search = ''}) async {
    final db = await _database.database;
    final query = search.trim().toLowerCase();

    final rows = await db.rawQuery(
      '''
      SELECT
        x.local_id AS box_local_id,
        x.remote_id AS box_remote_id,
        x.book_local_id AS book_local_id,
        x.book_remote_id AS book_remote_id,
        x.epc_tag,
        x.quantity,
        x.location,
        x.location_type,
        x.location_name,
        x.created_at AS date_added,
        x.updated_at,
        x.sync_status,
        b.title,
        b.isbn,
        b.category
      FROM book_boxes_local x
      LEFT JOIN books_master_local b ON b.local_id = x.book_local_id
      WHERE x.deleted_at IS NULL
      ORDER BY x.updated_at DESC
      ''',
    );

    final mapped = rows
        .map(
          (row) => BoxInventoryRow(
            boxLocalId: row['box_local_id'] as String,
            boxRemoteId: row['box_remote_id'] as String?,
            bookLocalId: row['book_local_id'] as String,
            bookRemoteId: row['book_remote_id'] as String?,
            epcTag: row['epc_tag'] as String,
            quantity: ((row['quantity'] as num?) ?? 1).toInt(),
            title: (row['title'] as String?) ?? 'Unknown',
            isbn: row['isbn'] as String?,
            category: row['category'] as String?,
            location: row['location'] as String?,
            locationType: row['location_type'] as String?,
            locationName: row['location_name'] as String?,
            dateAdded: row['date_added'] as String,
            updatedAt: row['updated_at'] as String,
            syncStatus: syncStatusFromDb(
                (row['sync_status'] as String?) ?? SyncStatus.pending.name),
          ),
        )
        .toList();

    if (query.isEmpty) {
      return mapped;
    }

    return mapped
        .where(
          (item) =>
              item.title.toLowerCase().contains(query) ||
              item.epcTag.toLowerCase().contains(query) ||
              (item.isbn?.toLowerCase().contains(query) ?? false) ||
              (item.category?.toLowerCase().contains(query) ?? false) ||
              (item.locationType?.toLowerCase().contains(query) ?? false) ||
              (item.locationName?.toLowerCase().contains(query) ?? false) ||
              (item.location?.toLowerCase().contains(query) ?? false),
        )
        .toList();
  }

  Future<List<InventoryRow>> listInStockCopies() async {
    final inventory = await listInventory();
    return inventory.where((item) => item.status == 'in_stock').toList();
  }

  Future<List<SaleLocal>> listSales({int limit = 500}) async {
    final rows = await _database.query(
      'sales_local',
      where: 'deleted_at IS NULL',
      orderBy: 'sold_at DESC',
      limit: limit,
    );

    return rows
        .map(
          (row) => SaleLocal(
            localId: row['local_id'] as String,
            remoteId: row['remote_id'] as String?,
            copyLocalId: (row['copy_local_id'] as String?) ?? '',
            copyRemoteId: row['copy_remote_id'] as String?,
            bookLocalId: (row['book_local_id'] as String?) ?? '',
            bookRemoteId: row['book_remote_id'] as String?,
            epcTag: row['epc_tag'] as String,
            title: row['title'] as String,
            isbn: row['isbn'] as String?,
            category: row['category'] as String?,
            location: row['location'] as String?,
            locationType: row['location_type'] as String?,
            locationName: row['location_name'] as String?,
            pricePaid: ((row['price_paid'] as num?) ?? 0).toDouble(),
            notes: row['notes'] as String?,
            soldAt: row['sold_at'] as String,
            updatedAt: row['updated_at'] as String,
            deletedAt: row['deleted_at'] as String?,
            syncStatus: syncStatusFromDb(
                (row['sync_status'] as String?) ?? SyncStatus.pending.name),
            lastSyncedAt: row['last_synced_at'] as String?,
            deviceId: row['device_id'] as String,
            rowVersion: ((row['row_version'] as num?) ?? 1).toInt(),
          ),
        )
        .toList();
  }

  Future<Map<String, num>> summary() async {
    final inventory = await listInventory();
    final boxes = await listBoxInventory();
    final sales = await listSales(limit: 2000);

    final totalCopies = inventory.length;
    final totalBoxes = boxes.length;
    final booksInBoxes =
        boxes.fold<int>(0, (sum, item) => sum + item.quantity);
    final booksOutsideBoxes = totalCopies;
    final totalBooks = booksOutsideBoxes + booksInBoxes;
    final inStock = inventory.where((item) => item.status == 'in_stock').length;
    final checkedOut =
        inventory.where((item) => item.status == 'checked_out').length;
    final lost = inventory.where((item) => item.status == 'lost').length;
    final totalSales = sales.length;
    final totalRevenue =
        sales.fold<double>(0, (sum, item) => sum + item.pricePaid);

    return {
      'total_copies': totalCopies,
      'total_boxes': totalBoxes,
      'books_in_boxes': booksInBoxes,
      'books_outside_boxes': booksOutsideBoxes,
      'total_books': totalBooks,
      'in_stock': inStock,
      'checked_out': checkedOut,
      'lost': lost,
      'total_books_lost': lost,
      'total_sales': totalSales,
      'total_revenue': totalRevenue,
    };
  }

  Future<List<LocationSummaryRow>> locationSummary() async {
    final inventory = await listInventory();
    final boxes = await listBoxInventory();

    final bucket = <String, int>{};
    final labels = <String, String>{};
    final names = <String, String>{};
    final types = <String, String>{};

    void push({
      required String? location,
      required String? locationType,
      required String? locationName,
      required int books,
    }) {
      if (books <= 0) {
        return;
      }
      final parsed = parseLocation(
        location: location,
        locationType: locationType,
        locationName: locationName,
      );
      final effectiveName = (parsed.locationName ?? '').trim();
      if (effectiveName.isEmpty) {
        return;
      }
      final effectiveType = normalizeLocationType(parsed.locationType) ?? kLocationTypeShelf;
      final key = '$effectiveType::$effectiveName'.toLowerCase();
      bucket[key] = (bucket[key] ?? 0) + books;
      labels[key] = parsed.location ?? '${locationTypeLabel(effectiveType)}: $effectiveName';
      names[key] = effectiveName;
      types[key] = effectiveType;
    }

    for (final row in inventory) {
      push(
        location: row.location,
        locationType: row.locationType,
        locationName: row.locationName,
        books: 1,
      );
    }
    for (final row in boxes) {
      push(
        location: row.location,
        locationType: row.locationType,
        locationName: row.locationName,
        books: row.quantity,
      );
    }

    final result = bucket.entries
        .map(
          (entry) => LocationSummaryRow(
            locationType: types[entry.key] ?? kLocationTypeShelf,
            locationName: names[entry.key] ?? '',
            locationDisplay: labels[entry.key] ?? '',
            totalBooks: entry.value,
          ),
        )
        .toList()
      ..sort((a, b) {
        final byType = locationTypeLabel(a.locationType)
            .toLowerCase()
            .compareTo(locationTypeLabel(b.locationType).toLowerCase());
        if (byType != 0) {
          return byType;
        }
        return a.locationName.toLowerCase().compareTo(b.locationName.toLowerCase());
      });

    return result;
  }

  Future<void> createSingleCopy({
    required String epcTag,
    required String title,
    String? isbn,
    String? category,
    String? location,
    String? locationType,
    String? locationName,
  }) async {
    final normalizedEpc = epcTag.trim().toUpperCase();
    if (normalizedEpc.isEmpty || title.trim().isEmpty) {
      throw ArgumentError('EPC and title are required.');
    }

    try {
      await _database.transaction((txn) async {
        final now = _now();

        final duplicate = await txn.query(
          'book_copies_local',
          columns: ['local_id', 'status'],
          where: 'epc_tag = ? AND deleted_at IS NULL',
          whereArgs: [normalizedEpc],
          limit: 1,
        );
        if (duplicate.isNotEmpty) {
          final status = (duplicate.first['status'] as String?) ?? '';
          if (status == 'checked_out') {
            throw Exception(
              'This EPC tag is already sold and is not available for active stock scanning.',
            );
          }
          throw Exception('This EPC tag already exists in inventory.');
        }

        final duplicateBox = await txn.query(
          'book_boxes_local',
          columns: ['local_id'],
          where: 'epc_tag = ? AND deleted_at IS NULL',
          whereArgs: [normalizedEpc],
          limit: 1,
        );
        if (duplicateBox.isNotEmpty) {
          throw Exception('This EPC tag already exists as a tagged box.');
        }

        final staleDeleted = await txn.query(
          'book_copies_local',
          columns: ['local_id'],
          where: 'epc_tag = ? AND deleted_at IS NOT NULL',
          whereArgs: [normalizedEpc],
          limit: 1,
        );
        if (staleDeleted.isNotEmpty) {
          final staleLocalId = staleDeleted.first['local_id'] as String?;
          if (staleLocalId != null && staleLocalId.trim().isNotEmpty) {
            await txn.update(
              'book_copies_local',
              {
                'epc_tag': '__DELETED__$staleLocalId',
              },
              where: 'local_id = ?',
              whereArgs: [staleLocalId],
            );
          }
        }

        final staleDeletedBox = await txn.query(
          'book_boxes_local',
          columns: ['local_id'],
          where: 'epc_tag = ? AND deleted_at IS NOT NULL',
          whereArgs: [normalizedEpc],
          limit: 1,
        );
        if (staleDeletedBox.isNotEmpty) {
          final staleLocalId = staleDeletedBox.first['local_id'] as String?;
          if (staleLocalId != null && staleLocalId.trim().isNotEmpty) {
            await txn.update(
              'book_boxes_local',
              {
                'epc_tag': '__DELETED__$staleLocalId',
              },
              where: 'local_id = ?',
              whereArgs: [staleLocalId],
            );
          }
        }

        final existingBook = await txn.query(
          'books_master_local',
          where:
              "title = ? AND coalesce(isbn, '') = coalesce(?, '') AND deleted_at IS NULL",
          whereArgs: [title.trim(), isbn?.trim()],
          limit: 1,
        );

        late final String bookLocalId;
        late final String? bookRemoteId;

        if (existingBook.isEmpty) {
          bookLocalId = _uuid.v4();
          bookRemoteId = null;
          await txn.insert('books_master_local', {
            'local_id': bookLocalId,
            'remote_id': null,
            'title': title.trim(),
            'isbn': isbn?.trim(),
            'category': category?.trim(),
            'created_at': now,
            'updated_at': now,
            'deleted_at': null,
            'sync_status': SyncStatus.pending.name,
            'last_synced_at': null,
            'device_id': deviceId,
            'row_version': 1,
          });

          await _enqueue(
            txn,
            tableName: 'books_master',
            action: 'upsert',
            localId: bookLocalId,
            remoteId: null,
            payload: {
              'title': title.trim(),
              'isbn': isbn?.trim(),
              'category': category?.trim(),
              'created_at': now,
            },
            clientUpdatedAt: now,
            rowVersion: 1,
          );
        } else {
          final row = existingBook.first;
          bookLocalId = row['local_id'] as String;
          bookRemoteId = row['remote_id'] as String?;
        }

        final copyLocalId = _uuid.v4();
        final locationPayload = _resolveLocationPayload(
          location: location,
          locationType: locationType,
          locationName: locationName,
        );
        await txn.insert('book_copies_local', {
          'local_id': copyLocalId,
          'remote_id': null,
          'book_local_id': bookLocalId,
          'book_remote_id': bookRemoteId,
          'epc_tag': normalizedEpc,
          'location': locationPayload.location,
          'location_type': locationPayload.locationType,
          'location_name': locationPayload.locationName,
          'status': 'in_stock',
          'created_at': now,
          'updated_at': now,
          'deleted_at': null,
          'sync_status': SyncStatus.pending.name,
          'last_synced_at': null,
          'device_id': deviceId,
          'row_version': 1,
        });

        await _enqueue(
          txn,
          tableName: 'book_copies',
          action: 'upsert',
          localId: copyLocalId,
          remoteId: null,
          payload: {
            'book_id': bookRemoteId,
            'book_local_id': bookLocalId,
            'epc_tag': normalizedEpc,
            'location': locationPayload.location,
            'location_type': locationPayload.locationType,
            'location_name': locationPayload.locationName,
            'status': 'in_stock',
            'date_added': now,
          },
          clientUpdatedAt: now,
          rowVersion: 1,
        );
      });
    } on DatabaseException catch (error) {
      final lower = error.toString().toLowerCase();
      if (lower.contains('book_copies_local.epc_tag') ||
          lower.contains('idx_copies_epc_tag')) {
        throw Exception(
          'This EPC tag already exists in inventory. Delete the old record or use another EPC.',
        );
      }
      rethrow;
    }
  }

  Future<void> createBoxTag({
    required String epcTag,
    required String title,
    required int quantity,
    String? isbn,
    String? category,
    String? location,
    String? locationType,
    String? locationName,
  }) async {
    final normalizedEpc = epcTag.trim().toUpperCase();
    if (normalizedEpc.isEmpty || title.trim().isEmpty || quantity <= 0) {
      throw ArgumentError('Book title, quantity, and EPC are required.');
    }

    try {
      await _database.transaction((txn) async {
        final now = _now();

        final duplicateCopy = await txn.query(
          'book_copies_local',
          columns: ['local_id', 'status'],
          where: 'epc_tag = ? AND deleted_at IS NULL',
          whereArgs: [normalizedEpc],
          limit: 1,
        );
        if (duplicateCopy.isNotEmpty) {
          final status = (duplicateCopy.first['status'] as String?) ?? '';
          if (status == 'checked_out') {
            throw Exception(
              'This EPC tag is already sold and cannot be reused for a box tag.',
            );
          }
          throw Exception('This EPC tag already exists in inventory.');
        }

        final duplicateBox = await txn.query(
          'book_boxes_local',
          columns: ['local_id'],
          where: 'epc_tag = ? AND deleted_at IS NULL',
          whereArgs: [normalizedEpc],
          limit: 1,
        );
        if (duplicateBox.isNotEmpty) {
          throw Exception('This EPC tag already exists as a tagged box.');
        }

        final staleDeletedCopy = await txn.query(
          'book_copies_local',
          columns: ['local_id'],
          where: 'epc_tag = ? AND deleted_at IS NOT NULL',
          whereArgs: [normalizedEpc],
          limit: 1,
        );
        if (staleDeletedCopy.isNotEmpty) {
          final staleLocalId = staleDeletedCopy.first['local_id'] as String?;
          if (staleLocalId != null && staleLocalId.trim().isNotEmpty) {
            await txn.update(
              'book_copies_local',
              {
                'epc_tag': '__DELETED__$staleLocalId',
              },
              where: 'local_id = ?',
              whereArgs: [staleLocalId],
            );
          }
        }

        final staleDeletedBox = await txn.query(
          'book_boxes_local',
          columns: ['local_id'],
          where: 'epc_tag = ? AND deleted_at IS NOT NULL',
          whereArgs: [normalizedEpc],
          limit: 1,
        );
        if (staleDeletedBox.isNotEmpty) {
          final staleLocalId = staleDeletedBox.first['local_id'] as String?;
          if (staleLocalId != null && staleLocalId.trim().isNotEmpty) {
            await txn.update(
              'book_boxes_local',
              {
                'epc_tag': '__DELETED__$staleLocalId',
              },
              where: 'local_id = ?',
              whereArgs: [staleLocalId],
            );
          }
        }

        final existingBook = await txn.query(
          'books_master_local',
          where:
              "title = ? AND coalesce(isbn, '') = coalesce(?, '') AND deleted_at IS NULL",
          whereArgs: [title.trim(), isbn?.trim()],
          limit: 1,
        );

        late final String bookLocalId;
        late final String? bookRemoteId;

        if (existingBook.isEmpty) {
          bookLocalId = _uuid.v4();
          bookRemoteId = null;
          await txn.insert('books_master_local', {
            'local_id': bookLocalId,
            'remote_id': null,
            'title': title.trim(),
            'isbn': isbn?.trim(),
            'category': category?.trim(),
            'created_at': now,
            'updated_at': now,
            'deleted_at': null,
            'sync_status': SyncStatus.pending.name,
            'last_synced_at': null,
            'device_id': deviceId,
            'row_version': 1,
          });

          await _enqueue(
            txn,
            tableName: 'books_master',
            action: 'upsert',
            localId: bookLocalId,
            remoteId: null,
            payload: {
              'title': title.trim(),
              'isbn': isbn?.trim(),
              'category': category?.trim(),
              'created_at': now,
            },
            clientUpdatedAt: now,
            rowVersion: 1,
          );
        } else {
          final row = existingBook.first;
          bookLocalId = row['local_id'] as String;
          bookRemoteId = row['remote_id'] as String?;
        }

        final boxLocalId = _uuid.v4();
        final locationPayload = _resolveLocationPayload(
          location: location,
          locationType: locationType,
          locationName: locationName,
        );
        await txn.insert('book_boxes_local', {
          'local_id': boxLocalId,
          'remote_id': null,
          'book_local_id': bookLocalId,
          'book_remote_id': bookRemoteId,
          'epc_tag': normalizedEpc,
          'quantity': quantity,
          'location': locationPayload.location,
          'location_type': locationPayload.locationType,
          'location_name': locationPayload.locationName,
          'created_at': now,
          'updated_at': now,
          'deleted_at': null,
          'sync_status': SyncStatus.pending.name,
          'last_synced_at': null,
          'device_id': deviceId,
          'row_version': 1,
        });

        await _enqueue(
          txn,
          tableName: 'book_boxes',
          action: 'upsert',
          localId: boxLocalId,
          remoteId: null,
          payload: {
            'book_id': bookRemoteId,
            'book_local_id': bookLocalId,
            'epc_tag': normalizedEpc,
            'quantity': quantity,
            'location': locationPayload.location,
            'location_type': locationPayload.locationType,
            'location_name': locationPayload.locationName,
            'created_at': now,
          },
          clientUpdatedAt: now,
          rowVersion: 1,
        );
      });
    } on DatabaseException catch (error) {
      final lower = error.toString().toLowerCase();
      if (lower.contains('book_boxes_local.epc_tag') ||
          lower.contains('idx_boxes_epc_tag') ||
          lower.contains('book_copies_local.epc_tag') ||
          lower.contains('idx_copies_epc_tag')) {
        throw Exception(
          'This EPC tag already exists. Delete the old record or use another EPC.',
        );
      }
      rethrow;
    }
  }

  Future<void> clearAllBoxTags() async {
    try {
      await _database.transaction((txn) async {
        final now = _now();
        
        final boxes = await txn.query(
          'book_boxes_local',
          where: 'deleted_at IS NULL',
        );
        
        for (final box in boxes) {
          final boxLocalId = box['local_id'] as String;
          final boxRemoteId = box['remote_id'] as String?;
          
          await txn.update(
            'book_boxes_local',
            {
              'deleted_at': now,
              'updated_at': now,
              'sync_status': SyncStatus.pending.name,
            },
            where: 'local_id = ?',
            whereArgs: [boxLocalId],
          );
          
          if (boxRemoteId != null && boxRemoteId.trim().isNotEmpty) {
            await _enqueue(
              txn,
              tableName: 'book_boxes',
              action: 'delete',
              localId: boxLocalId,
              remoteId: boxRemoteId,
              payload: {},
              clientUpdatedAt: now,
              rowVersion: (box['row_version'] as int?) ?? 1,
            );
          }
        }
      });
    } on DatabaseException catch (error) {
      rethrow;
    }
  }

  Future<BulkCreateResult> createBulkCopies({
    required String title,
    String? isbn,
    String? category,
    String? location,
    String? locationType,
    String? locationName,
    required List<String> epcTags,
  }) async {
    final normalizedTags = <String>[];
    final seen = <String>{};
    final inputDuplicates = <String>{};

    for (final raw in epcTags) {
      final normalized = raw.trim().toUpperCase();
      if (normalized.isEmpty) {
        continue;
      }
      if (!seen.add(normalized)) {
        inputDuplicates.add(normalized);
        continue;
      }
      normalizedTags.add(normalized);
    }

    if (normalizedTags.isEmpty) {
      throw ArgumentError('At least one EPC tag is required.');
    }

    final addedTags = <String>[];
    final duplicateTags = <String>{...inputDuplicates};
    final failed = <String, String>{};

    for (final epc in normalizedTags) {
      try {
        await createSingleCopy(
          epcTag: epc,
          title: title,
          isbn: isbn,
          category: category,
          location: location,
          locationType: locationType,
          locationName: locationName,
        );
        addedTags.add(epc);
      } catch (error) {
        final message = error.toString().replaceFirst('Exception: ', '');
        final lowered = message.toLowerCase();
        if (lowered.contains('already') ||
            lowered.contains('duplicate') ||
            lowered.contains('unique')) {
          duplicateTags.add(epc);
        } else {
          failed[epc] = message;
        }
      }
    }

    final duplicateList = duplicateTags.toList()
      ..sort((a, b) => a.compareTo(b));

    return BulkCreateResult(
      requestedCount: normalizedTags.length,
      addedTags: addedTags,
      duplicateTags: duplicateList,
      failed: failed,
    );
  }

  Future<void> recordSale({
    required String copyLocalId,
    required double pricePaid,
    String? notes,
  }) async {
    if (pricePaid < 0) {
      throw ArgumentError('pricePaid cannot be negative.');
    }

    await _database.transaction((txn) async {
      final now = _now();

      final copyRows = await txn.query(
        'book_copies_local',
        where: 'local_id = ? AND deleted_at IS NULL',
        whereArgs: [copyLocalId],
        limit: 1,
      );
      if (copyRows.isEmpty) {
        throw StateError('Copy not found for sale.');
      }

      final copy = copyRows.first;
      if ((copy['status'] as String?) != 'in_stock') {
        throw StateError('Only in_stock copies can be sold.');
      }

      final bookLocalId = copy['book_local_id'] as String?;
      final bookRows = await txn.query(
        'books_master_local',
        where: 'local_id = ?',
        whereArgs: [bookLocalId],
        limit: 1,
      );
      if (bookRows.isEmpty) {
        throw StateError('Book not found for selected copy.');
      }
      final book = bookRows.first;

      final nextCopyVersion = ((copy['row_version'] as num?) ?? 1).toInt() + 1;
      await txn.update(
        'book_copies_local',
        {
          'status': 'checked_out',
          'updated_at': now,
          'sync_status': SyncStatus.pending.name,
          'device_id': deviceId,
          'row_version': nextCopyVersion,
        },
        where: 'local_id = ?',
        whereArgs: [copyLocalId],
      );

      await _enqueue(
        txn,
        tableName: 'book_copies',
        action: 'upsert',
        localId: copyLocalId,
        remoteId: copy['remote_id'] as String?,
        payload: {
          'book_id': copy['book_remote_id'],
          'book_local_id': copy['book_local_id'],
          'epc_tag': copy['epc_tag'],
          'location': copy['location'],
          'location_type': copy['location_type'],
          'location_name': copy['location_name'],
          'status': 'checked_out',
          'date_added': copy['created_at'],
        },
        clientUpdatedAt: now,
        rowVersion: nextCopyVersion,
      );

      final saleLocalId = _uuid.v4();
      await txn.insert('sales_local', {
        'local_id': saleLocalId,
        'remote_id': null,
        'copy_local_id': copyLocalId,
        'copy_remote_id': copy['remote_id'],
        'book_local_id': book['local_id'],
        'book_remote_id': book['remote_id'],
        'epc_tag': copy['epc_tag'],
        'title': book['title'],
        'isbn': book['isbn'],
        'category': book['category'],
        'location': copy['location'],
        'location_type': copy['location_type'],
        'location_name': copy['location_name'],
        'price_paid': pricePaid,
        'notes': notes?.trim(),
        'sold_at': now,
        'updated_at': now,
        'deleted_at': null,
        'sync_status': SyncStatus.pending.name,
        'last_synced_at': null,
        'device_id': deviceId,
        'row_version': 1,
      });

      await _enqueue(
        txn,
        tableName: 'sales',
        action: 'upsert',
        localId: saleLocalId,
        remoteId: null,
        payload: {
          'copy_id': copy['remote_id'],
          'copy_local_id': copyLocalId,
          'book_id': book['remote_id'],
          'book_local_id': book['local_id'],
          'epc_tag': copy['epc_tag'],
          'title': book['title'],
          'isbn': book['isbn'],
          'category': book['category'],
          'location': copy['location'],
          'location_type': copy['location_type'],
          'location_name': copy['location_name'],
          'price_paid': pricePaid,
          'notes': notes?.trim(),
          'sold_at': now,
        },
        clientUpdatedAt: now,
        rowVersion: 1,
      );
    });
  }

  Future<void> recordSaleByBook({
    required String bookLocalId,
    required int quantity,
    String? notes,
  }) async {
    if (quantity <= 0) {
      throw ArgumentError('quantity must be greater than zero.');
    }

    await _database.transaction((txn) async {
      final rows = await txn.query(
        'book_copies_local',
        where:
            "book_local_id = ? AND status = 'in_stock' AND deleted_at IS NULL",
        whereArgs: [bookLocalId],
        orderBy: 'updated_at ASC',
        limit: quantity,
      );

      if (rows.length < quantity) {
        throw StateError(
          'Only ${rows.length} in-stock copies are available for this book.',
        );
      }

      final now = _now();
      for (final row in rows) {
        final copyLocalId = row['local_id'] as String?;
        if (copyLocalId == null || copyLocalId.trim().isEmpty) {
          continue;
        }

        final copy = row;
        final copyBookLocalId = copy['book_local_id'] as String?;
        final bookRows = await txn.query(
          'books_master_local',
          where: 'local_id = ?',
          whereArgs: [copyBookLocalId],
          limit: 1,
        );
        if (bookRows.isEmpty) {
          continue;
        }
        final book = bookRows.first;

        final nextCopyVersion =
            ((copy['row_version'] as num?) ?? 1).toInt() + 1;
        await txn.update(
          'book_copies_local',
          {
            'status': 'checked_out',
            'updated_at': now,
            'sync_status': SyncStatus.pending.name,
            'device_id': deviceId,
            'row_version': nextCopyVersion,
          },
          where: 'local_id = ?',
          whereArgs: [copyLocalId],
        );

        await _enqueue(
          txn,
          tableName: 'book_copies',
          action: 'upsert',
          localId: copyLocalId,
          remoteId: copy['remote_id'] as String?,
          payload: {
            'book_id': copy['book_remote_id'],
            'book_local_id': copy['book_local_id'],
            'epc_tag': copy['epc_tag'],
            'location': copy['location'],
            'location_type': copy['location_type'],
            'location_name': copy['location_name'],
            'status': 'checked_out',
            'date_added': copy['created_at'],
          },
          clientUpdatedAt: now,
          rowVersion: nextCopyVersion,
        );

        final saleLocalId = _uuid.v4();
        await txn.insert('sales_local', {
          'local_id': saleLocalId,
          'remote_id': null,
          'copy_local_id': copyLocalId,
          'copy_remote_id': copy['remote_id'],
          'book_local_id': book['local_id'],
          'book_remote_id': book['remote_id'],
          'epc_tag': copy['epc_tag'],
          'title': book['title'],
          'isbn': book['isbn'],
          'category': book['category'],
          'location': copy['location'],
          'location_type': copy['location_type'],
          'location_name': copy['location_name'],
          'price_paid': 0,
          'notes': notes?.trim(),
          'sold_at': now,
          'updated_at': now,
          'deleted_at': null,
          'sync_status': SyncStatus.pending.name,
          'last_synced_at': null,
          'device_id': deviceId,
          'row_version': 1,
        });

        await _enqueue(
          txn,
          tableName: 'sales',
          action: 'upsert',
          localId: saleLocalId,
          remoteId: null,
          payload: {
            'copy_id': copy['remote_id'],
            'copy_local_id': copyLocalId,
            'book_id': book['remote_id'],
            'book_local_id': book['local_id'],
            'epc_tag': copy['epc_tag'],
            'title': book['title'],
            'isbn': book['isbn'],
            'category': book['category'],
            'location': copy['location'],
            'location_type': copy['location_type'],
            'location_name': copy['location_name'],
            'price_paid': 0,
            'notes': notes?.trim(),
            'sold_at': now,
          },
          clientUpdatedAt: now,
          rowVersion: 1,
        );
      }
    });
  }

  Future<void> recordSaleByEpcTags({
    required List<String> epcTags,
    String? notes,
  }) async {
    final normalizedTags = epcTags
        .map((item) => item.trim().toUpperCase())
        .where((item) => item.isNotEmpty)
        .toSet()
        .toList();

    if (normalizedTags.isEmpty) {
      throw ArgumentError('At least one EPC tag is required.');
    }

    await _database.transaction((txn) async {
      final placeholders = List.filled(normalizedTags.length, '?').join(',');
      final rows = await txn.query(
        'book_copies_local',
        where: 'UPPER(epc_tag) IN ($placeholders) AND deleted_at IS NULL',
        whereArgs: normalizedTags,
      );

      final byTag = <String, Map<String, Object?>>{};
      for (final row in rows) {
        final tag = (row['epc_tag'] as String? ?? '').trim().toUpperCase();
        if (tag.isNotEmpty) {
          byTag[tag] = row;
        }
      }

      final missing =
          normalizedTags.where((tag) => !byTag.containsKey(tag)).toList();
      if (missing.isNotEmpty) {
        throw StateError(
          'These EPC tags were not found in inventory: ${missing.join(', ')}',
        );
      }

      final unavailable = normalizedTags.where((tag) {
        final row = byTag[tag];
        return row == null || (row['status'] as String?) != 'in_stock';
      }).toList();
      if (unavailable.isNotEmpty) {
        throw StateError(
          'These EPC tags are not available for sale: ${unavailable.join(', ')}',
        );
      }

      final now = _now();
      for (final tag in normalizedTags) {
        final copy = byTag[tag]!;
        final copyLocalId = copy['local_id'] as String?;
        if (copyLocalId == null || copyLocalId.trim().isEmpty) {
          continue;
        }

        final copyBookLocalId = copy['book_local_id'] as String?;
        final bookRows = await txn.query(
          'books_master_local',
          where: 'local_id = ?',
          whereArgs: [copyBookLocalId],
          limit: 1,
        );
        if (bookRows.isEmpty) {
          throw StateError('Book not found for EPC tag $tag.');
        }
        final book = bookRows.first;

        final nextCopyVersion =
            ((copy['row_version'] as num?) ?? 1).toInt() + 1;
        await txn.update(
          'book_copies_local',
          {
            'status': 'checked_out',
            'updated_at': now,
            'sync_status': SyncStatus.pending.name,
            'device_id': deviceId,
            'row_version': nextCopyVersion,
          },
          where: 'local_id = ?',
          whereArgs: [copyLocalId],
        );

        await _enqueue(
          txn,
          tableName: 'book_copies',
          action: 'upsert',
          localId: copyLocalId,
          remoteId: copy['remote_id'] as String?,
          payload: {
            'book_id': copy['book_remote_id'],
            'book_local_id': copy['book_local_id'],
            'epc_tag': copy['epc_tag'],
            'location': copy['location'],
            'location_type': copy['location_type'],
            'location_name': copy['location_name'],
            'status': 'checked_out',
            'date_added': copy['created_at'],
          },
          clientUpdatedAt: now,
          rowVersion: nextCopyVersion,
        );

        final saleLocalId = _uuid.v4();
        await txn.insert('sales_local', {
          'local_id': saleLocalId,
          'remote_id': null,
          'copy_local_id': copyLocalId,
          'copy_remote_id': copy['remote_id'],
          'book_local_id': book['local_id'],
          'book_remote_id': book['remote_id'],
          'epc_tag': copy['epc_tag'],
          'title': book['title'],
          'isbn': book['isbn'],
          'category': book['category'],
          'location': copy['location'],
          'location_type': copy['location_type'],
          'location_name': copy['location_name'],
          'price_paid': 0,
          'notes': notes?.trim(),
          'sold_at': now,
          'updated_at': now,
          'deleted_at': null,
          'sync_status': SyncStatus.pending.name,
          'last_synced_at': null,
          'device_id': deviceId,
          'row_version': 1,
        });

        await _enqueue(
          txn,
          tableName: 'sales',
          action: 'upsert',
          localId: saleLocalId,
          remoteId: null,
          payload: {
            'copy_id': copy['remote_id'],
            'copy_local_id': copyLocalId,
            'book_id': book['remote_id'],
            'book_local_id': book['local_id'],
            'epc_tag': copy['epc_tag'],
            'title': book['title'],
            'isbn': book['isbn'],
            'category': book['category'],
            'location': copy['location'],
            'location_type': copy['location_type'],
            'location_name': copy['location_name'],
            'price_paid': 0,
            'notes': notes?.trim(),
            'sold_at': now,
          },
          clientUpdatedAt: now,
          rowVersion: 1,
        );
      }
    });
  }

  Future<void> deleteCopy(String copyLocalId) async {
    await _database.transaction((txn) async {
      final now = _now();
      final rows = await txn.query(
        'book_copies_local',
        where: 'local_id = ? AND deleted_at IS NULL',
        whereArgs: [copyLocalId],
        limit: 1,
      );
      if (rows.isEmpty) {
        return;
      }

      final row = rows.first;
      final nextVersion = ((row['row_version'] as num?) ?? 1).toInt() + 1;

      await txn.update(
        'book_copies_local',
        {
          'epc_tag': '__DELETED__$copyLocalId',
          'deleted_at': now,
          'updated_at': now,
          'sync_status': SyncStatus.pending.name,
          'row_version': nextVersion,
          'device_id': deviceId,
        },
        where: 'local_id = ?',
        whereArgs: [copyLocalId],
      );

      await _enqueue(
        txn,
        tableName: 'book_copies',
        action: 'delete',
        localId: copyLocalId,
        remoteId: row['remote_id'] as String?,
        payload: const {},
        clientUpdatedAt: now,
        rowVersion: nextVersion,
      );
    });
  }

  Future<List<SaleSnapshot>> readSaleSnapshotsForCopies(
    List<String> copyLocalIds,
  ) async {
    final normalizedIds = copyLocalIds
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toSet()
        .toList();
    if (normalizedIds.isEmpty) {
      return const <SaleSnapshot>[];
    }

    final placeholders = List.filled(normalizedIds.length, '?').join(',');
    final rows = await _database.query(
      'sales_local',
      where: 'copy_local_id IN ($placeholders) AND deleted_at IS NULL',
      whereArgs: normalizedIds,
      orderBy: 'sold_at DESC',
    );

    return rows
        .map(
          (row) => SaleSnapshot(
            localId: row['local_id'] as String,
            remoteId: row['remote_id'] as String?,
            copyLocalId: row['copy_local_id'] as String?,
            copyRemoteId: row['copy_remote_id'] as String?,
            bookLocalId: row['book_local_id'] as String?,
            bookRemoteId: row['book_remote_id'] as String?,
            epcTag: (row['epc_tag'] as String? ?? '').trim().toUpperCase(),
            title: (row['title'] as String?) ?? 'Unknown',
            isbn: row['isbn'] as String?,
            category: row['category'] as String?,
            location: row['location'] as String?,
            locationType: row['location_type'] as String?,
            locationName: row['location_name'] as String?,
            pricePaid: ((row['price_paid'] as num?) ?? 0).toDouble(),
            notes: row['notes'] as String?,
            soldAt: (row['sold_at'] as String?) ?? _now(),
            updatedAt: (row['updated_at'] as String?) ?? _now(),
            deletedAt: row['deleted_at'] as String?,
            rowVersion: ((row['row_version'] as num?) ?? 1).toInt(),
          ),
        )
        .toList();
  }

  Future<void> deleteSalesForCopies(List<String> copyLocalIds) async {
    final normalizedIds = copyLocalIds
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toSet()
        .toList();
    if (normalizedIds.isEmpty) {
      return;
    }

    await _database.transaction((txn) async {
      final now = _now();
      final placeholders = List.filled(normalizedIds.length, '?').join(',');
      final rows = await txn.query(
        'sales_local',
        where: 'copy_local_id IN ($placeholders) AND deleted_at IS NULL',
        whereArgs: normalizedIds,
      );

      for (final row in rows) {
        final saleLocalId = row['local_id'] as String?;
        if (saleLocalId == null || saleLocalId.trim().isEmpty) {
          continue;
        }
        final nextVersion = ((row['row_version'] as num?) ?? 1).toInt() + 1;

        await txn.update(
          'sales_local',
          {
            'deleted_at': now,
            'updated_at': now,
            'sync_status': SyncStatus.pending.name,
            'last_synced_at': null,
            'device_id': deviceId,
            'row_version': nextVersion,
          },
          where: 'local_id = ?',
          whereArgs: [saleLocalId],
        );

        await _enqueue(
          txn,
          tableName: 'sales',
          action: 'delete',
          localId: saleLocalId,
          remoteId: row['remote_id'] as String?,
          payload: const {},
          clientUpdatedAt: now,
          rowVersion: nextVersion,
        );
      }
    });
  }

  Future<CopySnapshot?> readCopySnapshot(
    String copyLocalId, {
    bool includeDeleted = false,
  }) async {
    final rows = await _database.query(
      'book_copies_local',
      where: includeDeleted
          ? 'local_id = ?'
          : 'local_id = ? AND deleted_at IS NULL',
      whereArgs: [copyLocalId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }

    final row = rows.first;
    return CopySnapshot(
      localId: row['local_id'] as String,
      remoteId: row['remote_id'] as String?,
      bookLocalId: row['book_local_id'] as String,
      bookRemoteId: row['book_remote_id'] as String?,
      epcTag: (row['epc_tag'] as String? ?? '').trim().toUpperCase(),
      location: (row['location'] as String?)?.trim(),
      locationType: (row['location_type'] as String?)?.trim(),
      locationName: (row['location_name'] as String?)?.trim(),
      status: (row['status'] as String?) ?? 'in_stock',
      createdAt: (row['created_at'] as String?) ?? _now(),
      updatedAt: (row['updated_at'] as String?) ?? _now(),
      deletedAt: row['deleted_at'] as String?,
      rowVersion: ((row['row_version'] as num?) ?? 1).toInt(),
    );
  }

  Future<void> updateCopyLocation({
    required String copyLocalId,
    String? location,
    String? locationType,
    String? locationName,
  }) async {
    await _database.transaction((txn) async {
      final now = _now();
      final rows = await txn.query(
        'book_copies_local',
        where: 'local_id = ? AND deleted_at IS NULL',
        whereArgs: [copyLocalId],
        limit: 1,
      );
      if (rows.isEmpty) {
        throw StateError('Copy not found for location update.');
      }

      final row = rows.first;
      final nextVersion = ((row['row_version'] as num?) ?? 1).toInt() + 1;
      final locationPayload = _resolveLocationPayload(
        location: location,
        locationType: locationType,
        locationName: locationName,
      );

      await txn.update(
        'book_copies_local',
        {
          'location': locationPayload.location,
          'location_type': locationPayload.locationType,
          'location_name': locationPayload.locationName,
          'updated_at': now,
          'sync_status': SyncStatus.pending.name,
          'device_id': deviceId,
          'row_version': nextVersion,
        },
        where: 'local_id = ?',
        whereArgs: [copyLocalId],
      );

      await _enqueue(
        txn,
        tableName: 'book_copies',
        action: 'upsert',
        localId: copyLocalId,
        remoteId: row['remote_id'] as String?,
        payload: {
          'book_id': row['book_remote_id'],
          'book_local_id': row['book_local_id'],
          'epc_tag': row['epc_tag'],
          'location': locationPayload.location,
          'location_type': locationPayload.locationType,
          'location_name': locationPayload.locationName,
          'status': row['status'],
          'date_added': row['created_at'],
        },
        clientUpdatedAt: now,
        rowVersion: nextVersion,
      );
    });
  }

  Future<void> applyStockCountResults({
    required Set<String> scannedEpcs,
    required String locationFilter,
  }) async {
    final normalizedScanned = scannedEpcs
        .map((item) => item.trim().toUpperCase())
        .where((item) => item.isNotEmpty)
        .toSet();

    await _database.transaction((txn) async {
      final now = _now();
      final noLocationFilter = locationFilter.trim().toLowerCase() == 'no location';
      final scopedRows = await txn.query(
        'book_copies_local',
        where: locationFilter == 'all'
            ? "deleted_at IS NULL AND status <> 'checked_out'"
            : noLocationFilter
                ? "deleted_at IS NULL AND status <> 'checked_out' AND location IS NULL"
                : "deleted_at IS NULL AND status <> 'checked_out' AND location = ?",
        whereArgs: locationFilter == 'all'
            ? null
            : noLocationFilter
                ? null
                : [locationFilter],
      );

      for (final row in scopedRows) {
        final epcTag = ((row['epc_tag'] as String?) ?? '').trim().toUpperCase();
        if (epcTag.isEmpty) {
          continue;
        }

        final nextStatus =
            normalizedScanned.contains(epcTag) ? 'in_stock' : 'lost';
        final currentStatus = (row['status'] as String?) ?? 'in_stock';
        if (currentStatus == nextStatus) {
          continue;
        }

        final copyLocalId = row['local_id'] as String?;
        if (copyLocalId == null || copyLocalId.trim().isEmpty) {
          continue;
        }

        final nextVersion = ((row['row_version'] as num?) ?? 1).toInt() + 1;
        await txn.update(
          'book_copies_local',
          {
            'status': nextStatus,
            'updated_at': now,
            'sync_status': SyncStatus.pending.name,
            'last_synced_at': null,
            'device_id': deviceId,
            'row_version': nextVersion,
          },
          where: 'local_id = ?',
          whereArgs: [copyLocalId],
        );

        await _enqueue(
          txn,
          tableName: 'book_copies',
          action: 'upsert',
          localId: copyLocalId,
          remoteId: row['remote_id'] as String?,
          payload: {
            'book_id': row['book_remote_id'],
            'book_local_id': row['book_local_id'],
            'epc_tag': epcTag,
            'location': row['location'],
            'location_type': row['location_type'],
            'location_name': row['location_name'],
            'status': nextStatus,
            'date_added': row['created_at'],
          },
          clientUpdatedAt: now,
          rowVersion: nextVersion,
        );
      }
    });
  }

  Future<void> restoreCopyFromSnapshot(CopySnapshot snapshot) async {
    final restoredEpc = snapshot.epcTag.trim().toUpperCase();
    if (restoredEpc.isEmpty) {
      throw StateError('Cannot restore copy without EPC tag.');
    }

    await _database.transaction((txn) async {
      final now = _now();
      final duplicate = await txn.query(
        'book_copies_local',
        columns: ['local_id'],
        where: 'UPPER(epc_tag) = ? AND deleted_at IS NULL AND local_id <> ?',
        whereArgs: [restoredEpc, snapshot.localId],
        limit: 1,
      );
      if (duplicate.isNotEmpty) {
        throw StateError(
          'Cannot undo because EPC $restoredEpc is already in use by another copy.',
        );
      }

      final existing = await txn.query(
        'book_copies_local',
        where: 'local_id = ?',
        whereArgs: [snapshot.localId],
        limit: 1,
      );
      final currentVersion = existing.isNotEmpty
          ? ((existing.first['row_version'] as num?) ?? snapshot.rowVersion)
              .toInt()
          : snapshot.rowVersion;
      final nextVersion = currentVersion + 1;

      final locationPayload = _resolveLocationPayload(
        location: snapshot.location,
        locationType: snapshot.locationType,
        locationName: snapshot.locationName,
      );

      if (existing.isEmpty) {
        await txn.insert(
          'book_copies_local',
          {
            'local_id': snapshot.localId,
            'remote_id': snapshot.remoteId,
            'book_local_id': snapshot.bookLocalId,
            'book_remote_id': snapshot.bookRemoteId,
            'epc_tag': restoredEpc,
            'location': locationPayload.location,
            'location_type': locationPayload.locationType,
            'location_name': locationPayload.locationName,
            'status': snapshot.status,
            'created_at': snapshot.createdAt,
            'updated_at': now,
            'deleted_at': null,
            'sync_status': SyncStatus.pending.name,
            'last_synced_at': null,
            'device_id': deviceId,
            'row_version': nextVersion,
          },
        );
      } else {
        await txn.update(
          'book_copies_local',
          {
            'remote_id': snapshot.remoteId,
            'book_local_id': snapshot.bookLocalId,
            'book_remote_id': snapshot.bookRemoteId,
            'epc_tag': restoredEpc,
            'location': locationPayload.location,
            'location_type': locationPayload.locationType,
            'location_name': locationPayload.locationName,
            'status': snapshot.status,
            'updated_at': now,
            'deleted_at': null,
            'sync_status': SyncStatus.pending.name,
            'last_synced_at': null,
            'device_id': deviceId,
            'row_version': nextVersion,
          },
          where: 'local_id = ?',
          whereArgs: [snapshot.localId],
        );
      }

      await _enqueue(
        txn,
        tableName: 'book_copies',
        action: 'upsert',
        localId: snapshot.localId,
        remoteId: snapshot.remoteId,
        payload: {
          'book_id': snapshot.bookRemoteId,
          'book_local_id': snapshot.bookLocalId,
          'epc_tag': restoredEpc,
          'location': locationPayload.location,
          'location_type': locationPayload.locationType,
          'location_name': locationPayload.locationName,
          'status': snapshot.status,
          'date_added': snapshot.createdAt,
        },
        clientUpdatedAt: now,
        rowVersion: nextVersion,
      );
    });
  }

  Future<void> restoreSalesFromSnapshots(List<SaleSnapshot> snapshots) async {
    if (snapshots.isEmpty) {
      return;
    }

    await _database.transaction((txn) async {
      final now = _now();
      for (final snapshot in snapshots) {
        final existing = await txn.query(
          'sales_local',
          where: 'local_id = ?',
          whereArgs: [snapshot.localId],
          limit: 1,
        );
        final currentVersion = existing.isNotEmpty
            ? ((existing.first['row_version'] as num?) ?? snapshot.rowVersion)
                .toInt()
            : snapshot.rowVersion;
        final nextVersion = currentVersion + 1;

        final payload = {
          'local_id': snapshot.localId,
          'remote_id': snapshot.remoteId,
          'copy_local_id': snapshot.copyLocalId,
          'copy_remote_id': snapshot.copyRemoteId,
          'book_local_id': snapshot.bookLocalId,
          'book_remote_id': snapshot.bookRemoteId,
          'epc_tag': snapshot.epcTag,
          'title': snapshot.title,
          'isbn': snapshot.isbn,
          'category': snapshot.category,
          'location': snapshot.location,
          'location_type': snapshot.locationType,
          'location_name': snapshot.locationName,
          'price_paid': snapshot.pricePaid,
          'notes': snapshot.notes,
          'sold_at': snapshot.soldAt,
          'updated_at': now,
          'deleted_at': null,
          'sync_status': SyncStatus.pending.name,
          'last_synced_at': null,
          'device_id': deviceId,
          'row_version': nextVersion,
        };

        if (existing.isEmpty) {
          await txn.insert('sales_local', payload);
        } else {
          await txn.update(
            'sales_local',
            payload,
            where: 'local_id = ?',
            whereArgs: [snapshot.localId],
          );
        }

        await _enqueue(
          txn,
          tableName: 'sales',
          action: 'upsert',
          localId: snapshot.localId,
          remoteId: snapshot.remoteId,
          payload: {
            'copy_id': snapshot.copyRemoteId,
            'copy_local_id': snapshot.copyLocalId,
            'book_id': snapshot.bookRemoteId,
            'book_local_id': snapshot.bookLocalId,
            'epc_tag': snapshot.epcTag,
            'title': snapshot.title,
            'isbn': snapshot.isbn,
            'category': snapshot.category,
            'location': snapshot.location,
            'location_type': snapshot.locationType,
            'location_name': snapshot.locationName,
            'price_paid': snapshot.pricePaid,
            'notes': snapshot.notes,
            'sold_at': snapshot.soldAt,
          },
          clientUpdatedAt: now,
          rowVersion: nextVersion,
        );
      }
    });
  }

  Future<List<SyncQueueItem>> pendingQueue({int limit = 200}) async {
    final rows = await _database.query(
      'sync_queue',
      orderBy: 'retry_count ASC, id ASC',
      limit: limit,
    );
    return rows
        .map(
          (row) => SyncQueueItem(
            id: ((row['id'] as num?) ?? 0).toInt(),
            operationId: row['operation_id'] as String,
            tableName: row['table_name'] as String,
            action: row['action'] as String,
            localId: row['local_id'] as String,
            remoteId: row['remote_id'] as String?,
            payloadJson: row['payload_json'] as String,
            clientUpdatedAt: row['client_updated_at'] as String,
            rowVersion: ((row['row_version'] as num?) ?? 1).toInt(),
            retryCount: ((row['retry_count'] as num?) ?? 0).toInt(),
            lastError: row['last_error'] as String?,
            createdAt: row['created_at'] as String,
          ),
        )
        .toList();
  }

  Future<int> pendingCount() async {
    final db = await _database.database;
    final rows = await db.rawQuery('SELECT COUNT(*) AS total FROM sync_queue');
    return ((rows.first['total'] as num?) ?? 0).toInt();
  }

  Future<int> failedQueueCount() async {
    final db = await _database.database;
    final rows = await db.rawQuery(
      'SELECT COUNT(*) AS total FROM sync_queue WHERE retry_count > 0 OR coalesce(last_error, \'\') <> \'\'',
    );
    return ((rows.first['total'] as num?) ?? 0).toInt();
  }

  Future<String?> latestQueueError() async {
    final rows = await _database.query(
      'sync_queue',
      columns: ['last_error'],
      where: 'retry_count > 0 OR coalesce(last_error, \'\') <> \'\'',
      orderBy: 'id DESC',
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    final message = (rows.first['last_error'] as String?)?.trim();
    if (message == null || message.isEmpty) {
      return null;
    }
    return message;
  }

  Future<int> conflictCount() async {
    final db = await _database.database;
    final books = await db.rawQuery(
        "SELECT COUNT(*) AS total FROM books_master_local WHERE sync_status = 'conflict' AND deleted_at IS NULL");
    final copies = await db.rawQuery(
        "SELECT COUNT(*) AS total FROM book_copies_local WHERE sync_status = 'conflict' AND deleted_at IS NULL");
    final boxes = await db.rawQuery(
        "SELECT COUNT(*) AS total FROM book_boxes_local WHERE sync_status = 'conflict' AND deleted_at IS NULL");
    final sales = await db.rawQuery(
        "SELECT COUNT(*) AS total FROM sales_local WHERE sync_status = 'conflict' AND deleted_at IS NULL");
    return ((books.first['total'] as num?) ?? 0).toInt() +
        ((copies.first['total'] as num?) ?? 0).toInt() +
        ((boxes.first['total'] as num?) ?? 0).toInt() +
        ((sales.first['total'] as num?) ?? 0).toInt();
  }

  Future<Map<String, String>> checkpoints() async {
    final rows = await _database.query('sync_state');
    final result = <String, String>{};
    for (final row in rows) {
      result[row['table_name'] as String] = row['last_checkpoint'] as String;
    }
    return result;
  }

  Future<String?> remoteBookIdByLocal(String localId) async {
    final rows = await _database.query(
      'books_master_local',
      columns: ['remote_id'],
      where: 'local_id = ?',
      whereArgs: [localId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    final remoteId = rows.first['remote_id'] as String?;
    if (remoteId == null || remoteId.trim().isEmpty) {
      return null;
    }
    return remoteId;
  }

  Future<String?> remoteCopyIdByLocal(String localId) async {
    final rows = await _database.query(
      'book_copies_local',
      columns: ['remote_id'],
      where: 'local_id = ?',
      whereArgs: [localId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    final remoteId = rows.first['remote_id'] as String?;
    if (remoteId == null || remoteId.trim().isEmpty) {
      return null;
    }
    return remoteId;
  }

  Future<void> updateCheckpoint(String tableName, String checkpoint) async {
    await _database.update(
      'sync_state',
      {
        'last_checkpoint': checkpoint,
        'updated_at': _now(),
      },
      where: 'table_name = ?',
      whereArgs: [tableName],
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> markSynced({
    required SyncQueueItem queue,
    required String remoteId,
    required String updatedAt,
    required int rowVersion,
  }) async {
    await _database.transaction((txn) async {
      final localTable = _localTable(queue.tableName);
      await txn.update(
        localTable,
        {
          'remote_id': remoteId,
          'updated_at': updatedAt,
          'sync_status': SyncStatus.synced.name,
          'last_synced_at': _now(),
          'row_version': rowVersion,
        },
        where: 'local_id = ?',
        whereArgs: [queue.localId],
      );

      await txn.delete('sync_queue',
          where: 'operation_id = ?', whereArgs: [queue.operationId]);
    });
  }

  Future<void> markConflict({
    required SyncQueueItem queue,
    required String remoteId,
    required String serverUpdatedAt,
    required int rowVersion,
  }) async {
    await _database.transaction((txn) async {
      final localTable = _localTable(queue.tableName);
      await txn.update(
        localTable,
        {
          'remote_id': remoteId,
          'updated_at': serverUpdatedAt,
          'sync_status': SyncStatus.conflict.name,
          'row_version': rowVersion,
        },
        where: 'local_id = ?',
        whereArgs: [queue.localId],
      );

      await txn.delete('sync_queue',
          where: 'operation_id = ?', whereArgs: [queue.operationId]);
    });
  }

  Future<void> markFailed(SyncQueueItem queue, String message) async {
    await _database.update(
      'sync_queue',
      {
        'retry_count': queue.retryCount + 1,
        'last_error': message,
      },
      where: 'id = ?',
      whereArgs: [queue.id],
    );

    final localTable = _localTable(queue.tableName);
    await _database.update(
      localTable,
      {
        'sync_status': SyncStatus.failed.name,
      },
      where: 'local_id = ?',
      whereArgs: [queue.localId],
    );
  }

  Future<void> applyRemoteChanges({
    required Map<String, dynamic> changes,
    required Map<String, dynamic> checkpoints,
  }) async {
    await _database.transaction((txn) async {
      final books = (changes['books_master'] as List<dynamic>? ?? const []);
      for (final row in books) {
        if (row is Map<String, dynamic>) {
          await _applyRemoteBook(txn, row);
        }
      }

      final copies = (changes['book_copies'] as List<dynamic>? ?? const []);
      for (final row in copies) {
        if (row is Map<String, dynamic>) {
          await _applyRemoteCopy(txn, row);
        }
      }

      final boxes = (changes['book_boxes'] as List<dynamic>? ?? const []);
      for (final row in boxes) {
        if (row is Map<String, dynamic>) {
          await _applyRemoteBox(txn, row);
        }
      }

      final sales = (changes['sales'] as List<dynamic>? ?? const []);
      for (final row in sales) {
        if (row is Map<String, dynamic>) {
          await _applyRemoteSale(txn, row);
        }
      }

      for (final entry in checkpoints.entries) {
        final tableName = entry.key;
        final checkpoint = entry.value;
        if (checkpoint is String) {
          await txn.update(
            'sync_state',
            {
              'last_checkpoint': checkpoint,
              'updated_at': _now(),
            },
            where: 'table_name = ?',
            whereArgs: [tableName],
          );
        }
      }
    });
  }

  Future<void> _enqueue(
    Transaction txn, {
    required String tableName,
    required String action,
    required String localId,
    required String? remoteId,
    required Map<String, dynamic> payload,
    required String clientUpdatedAt,
    required int rowVersion,
  }) async {
    await txn.insert('sync_queue', {
      'operation_id': _uuid.v4(),
      'table_name': tableName,
      'action': action,
      'local_id': localId,
      'remote_id': remoteId,
      'payload_json': jsonEncode(payload),
      'client_updated_at': clientUpdatedAt,
      'row_version': rowVersion,
      'retry_count': 0,
      'last_error': null,
      'created_at': clientUpdatedAt,
    });
  }

  String _localTable(String remoteTable) {
    switch (remoteTable) {
      case 'books_master':
        return 'books_master_local';
      case 'book_copies':
        return 'book_copies_local';
      case 'book_boxes':
        return 'book_boxes_local';
      case 'sales':
        return 'sales_local';
      default:
        throw ArgumentError('Unknown table $remoteTable');
    }
  }

  Future<void> _applyRemoteBook(
      Transaction txn, Map<String, dynamic> row) async {
    final remoteId = (row['id'] as String?) ?? '';
    if (remoteId.isEmpty) {
      return;
    }

    final existing = await txn.query(
      'books_master_local',
      where: 'remote_id = ?',
      whereArgs: [remoteId],
      limit: 1,
    );

    final localId =
        existing.isNotEmpty ? existing.first['local_id'] as String : _uuid.v4();

    await txn.insert(
      'books_master_local',
      {
        'local_id': localId,
        'remote_id': remoteId,
        'title': row['title'] ?? 'Unknown',
        'isbn': row['isbn'],
        'category': row['category'],
        'created_at': row['created_at'] ?? _now(),
        'updated_at': row['updated_at'] ?? _now(),
        'deleted_at': row['deleted_at'],
        'sync_status': SyncStatus.synced.name,
        'last_synced_at': _now(),
        'device_id': row['device_id'] ?? deviceId,
        'row_version': ((row['row_version'] as num?) ?? 1).toInt(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> _applyRemoteCopy(
      Transaction txn, Map<String, dynamic> row) async {
    final remoteId = (row['id'] as String?) ?? '';
    if (remoteId.isEmpty) {
      return;
    }

    final remoteBookId = (row['book_id'] as String?)?.trim();
    final normalizedEpc = ((row['epc_tag'] as String?) ?? '').trim().toUpperCase();
    final locationPayload = _resolveLocationPayload(
      location: row['location'] as String?,
      locationType: row['location_type'] as String?,
      locationName: row['location_name'] as String?,
    );

    Map<String, Object?>? existingRow;
    final existingByRemote = await txn.query(
      'book_copies_local',
      where: 'remote_id = ?',
      whereArgs: [remoteId],
      limit: 1,
    );
    if (existingByRemote.isNotEmpty) {
      existingRow = existingByRemote.first;
    } else if (normalizedEpc.isNotEmpty) {
      final existingByEpc = await txn.query(
        'book_copies_local',
        where: 'epc_tag = ?',
        whereArgs: [normalizedEpc],
        limit: 1,
      );
      if (existingByEpc.isNotEmpty) {
        existingRow = existingByEpc.first;
      }
    }

    final localId =
        existingRow != null ? existingRow['local_id'] as String : _uuid.v4();

    String bookLocalId =
        (existingRow?['book_local_id'] as String?)?.trim() ?? '';

    if (remoteBookId != null && remoteBookId.isNotEmpty) {
      final bookRows = await txn.query(
        'books_master_local',
        where: 'remote_id = ?',
        whereArgs: [remoteBookId],
        limit: 1,
      );
      if (bookRows.isNotEmpty) {
        bookLocalId = bookRows.first['local_id'] as String;
      } else {
        if (bookLocalId.isEmpty) {
          bookLocalId = _uuid.v4();
        }
        await txn.insert(
          'books_master_local',
          {
            'local_id': bookLocalId,
            'remote_id': remoteBookId,
            'title': 'Unknown (remote)',
            'isbn': null,
            'category': null,
            'created_at': _now(),
            'updated_at': _now(),
            'deleted_at': null,
            'sync_status': SyncStatus.synced.name,
            'last_synced_at': _now(),
            'device_id': row['device_id'] ?? deviceId,
            'row_version': 1,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
    } else {
      if (bookLocalId.isEmpty) {
        bookLocalId = _uuid.v4();
      }
      final placeholderBook = await txn.query(
        'books_master_local',
        where: 'local_id = ?',
        whereArgs: [bookLocalId],
        limit: 1,
      );
      if (placeholderBook.isEmpty) {
        await txn.insert(
          'books_master_local',
          {
            'local_id': bookLocalId,
            'remote_id': null,
            'title': 'Unknown (remote copy)',
            'isbn': null,
            'category': null,
            'created_at': _now(),
            'updated_at': _now(),
            'deleted_at': null,
            'sync_status': SyncStatus.synced.name,
            'last_synced_at': _now(),
            'device_id': row['device_id'] ?? deviceId,
            'row_version': 1,
          },
          conflictAlgorithm: ConflictAlgorithm.ignore,
        );
      }
    }

    await txn.insert(
      'book_copies_local',
      {
        'local_id': localId,
        'remote_id': remoteId,
        'book_local_id': bookLocalId,
        'book_remote_id': remoteBookId,
        'epc_tag': normalizedEpc,
        'location': locationPayload.location,
        'location_type': locationPayload.locationType,
        'location_name': locationPayload.locationName,
        'status': row['status'] ?? 'in_stock',
        'created_at': row['date_added'] ?? _now(),
        'updated_at': row['updated_at'] ?? _now(),
        'deleted_at': row['deleted_at'],
        'sync_status': SyncStatus.synced.name,
        'last_synced_at': _now(),
        'device_id': row['device_id'] ?? deviceId,
        'row_version': ((row['row_version'] as num?) ?? 1).toInt(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> _applyRemoteBox(
      Transaction txn, Map<String, dynamic> row) async {
    final remoteId = (row['id'] as String?) ?? '';
    if (remoteId.isEmpty) {
      return;
    }

    final remoteBookId = (row['book_id'] as String?)?.trim();
    final normalizedEpc = ((row['epc_tag'] as String?) ?? '').trim().toUpperCase();
    final locationPayload = _resolveLocationPayload(
      location: row['location'] as String?,
      locationType: row['location_type'] as String?,
      locationName: row['location_name'] as String?,
    );

    Map<String, Object?>? existingRow;
    final existingByRemote = await txn.query(
      'book_boxes_local',
      where: 'remote_id = ?',
      whereArgs: [remoteId],
      limit: 1,
    );
    if (existingByRemote.isNotEmpty) {
      existingRow = existingByRemote.first;
    } else if (normalizedEpc.isNotEmpty) {
      final existingByEpc = await txn.query(
        'book_boxes_local',
        where: 'epc_tag = ?',
        whereArgs: [normalizedEpc],
        limit: 1,
      );
      if (existingByEpc.isNotEmpty) {
        existingRow = existingByEpc.first;
      }
    }

    final localId =
        existingRow != null ? existingRow['local_id'] as String : _uuid.v4();

    String bookLocalId =
        (existingRow?['book_local_id'] as String?)?.trim() ?? '';

    if (remoteBookId != null && remoteBookId.isNotEmpty) {
      final bookRows = await txn.query(
        'books_master_local',
        where: 'remote_id = ?',
        whereArgs: [remoteBookId],
        limit: 1,
      );
      if (bookRows.isNotEmpty) {
        bookLocalId = bookRows.first['local_id'] as String;
      } else {
        if (bookLocalId.isEmpty) {
          bookLocalId = _uuid.v4();
        }
        await txn.insert(
          'books_master_local',
          {
            'local_id': bookLocalId,
            'remote_id': remoteBookId,
            'title': 'Unknown (remote box)',
            'isbn': null,
            'category': null,
            'created_at': _now(),
            'updated_at': _now(),
            'deleted_at': null,
            'sync_status': SyncStatus.synced.name,
            'last_synced_at': _now(),
            'device_id': row['device_id'] ?? deviceId,
            'row_version': 1,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
    } else {
      if (bookLocalId.isEmpty) {
        bookLocalId = _uuid.v4();
      }
      final placeholderBook = await txn.query(
        'books_master_local',
        where: 'local_id = ?',
        whereArgs: [bookLocalId],
        limit: 1,
      );
      if (placeholderBook.isEmpty) {
        await txn.insert(
          'books_master_local',
          {
            'local_id': bookLocalId,
            'remote_id': null,
            'title': 'Unknown (remote box)',
            'isbn': null,
            'category': null,
            'created_at': _now(),
            'updated_at': _now(),
            'deleted_at': null,
            'sync_status': SyncStatus.synced.name,
            'last_synced_at': _now(),
            'device_id': row['device_id'] ?? deviceId,
            'row_version': 1,
          },
          conflictAlgorithm: ConflictAlgorithm.ignore,
        );
      }
    }

    await txn.insert(
      'book_boxes_local',
      {
        'local_id': localId,
        'remote_id': remoteId,
        'book_local_id': bookLocalId,
        'book_remote_id': remoteBookId,
        'epc_tag': normalizedEpc,
        'quantity': ((row['quantity'] as num?) ?? 1).toInt(),
        'location': locationPayload.location,
        'location_type': locationPayload.locationType,
        'location_name': locationPayload.locationName,
        'created_at': row['created_at'] ?? _now(),
        'updated_at': row['updated_at'] ?? _now(),
        'deleted_at': row['deleted_at'],
        'sync_status': SyncStatus.synced.name,
        'last_synced_at': _now(),
        'device_id': row['device_id'] ?? deviceId,
        'row_version': ((row['row_version'] as num?) ?? 1).toInt(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> _applyRemoteSale(
      Transaction txn, Map<String, dynamic> row) async {
    final remoteId = (row['id'] as String?) ?? '';
    if (remoteId.isEmpty) {
      return;
    }

    final remoteBookId = row['book_id'] as String?;
    final remoteCopyId = row['copy_id'] as String?;
    final locationPayload = _resolveLocationPayload(
      location: row['location'] as String?,
      locationType: row['location_type'] as String?,
      locationName: row['location_name'] as String?,
    );

    String? bookLocalId;
    if (remoteBookId != null) {
      final bookRows = await txn.query(
        'books_master_local',
        where: 'remote_id = ?',
        whereArgs: [remoteBookId],
        limit: 1,
      );
      if (bookRows.isNotEmpty) {
        bookLocalId = bookRows.first['local_id'] as String;
      }
    }

    String? copyLocalId;
    if (remoteCopyId != null) {
      final copyRows = await txn.query(
        'book_copies_local',
        where: 'remote_id = ?',
        whereArgs: [remoteCopyId],
        limit: 1,
      );
      if (copyRows.isNotEmpty) {
        copyLocalId = copyRows.first['local_id'] as String;
      }
    }

    final existing = await txn.query(
      'sales_local',
      where: 'remote_id = ?',
      whereArgs: [remoteId],
      limit: 1,
    );

    final localId =
        existing.isNotEmpty ? existing.first['local_id'] as String : _uuid.v4();

    await txn.insert(
      'sales_local',
      {
        'local_id': localId,
        'remote_id': remoteId,
        'copy_local_id': copyLocalId,
        'copy_remote_id': remoteCopyId,
        'book_local_id': bookLocalId,
        'book_remote_id': remoteBookId,
        'epc_tag': row['epc_tag'] ?? '',
        'title': row['title'] ?? 'Unknown',
        'isbn': row['isbn'],
        'category': row['category'],
        'location': locationPayload.location,
        'location_type': locationPayload.locationType,
        'location_name': locationPayload.locationName,
        'price_paid': ((row['price_paid'] as num?) ?? 0).toDouble(),
        'notes': row['notes'],
        'sold_at': row['sold_at'] ?? _now(),
        'updated_at': row['updated_at'] ?? _now(),
        'deleted_at': row['deleted_at'],
        'sync_status': SyncStatus.synced.name,
        'last_synced_at': _now(),
        'device_id': row['device_id'] ?? deviceId,
        'row_version': ((row['row_version'] as num?) ?? 1).toInt(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}

class _LocationPayload {
  const _LocationPayload({
    required this.location,
    required this.locationType,
    required this.locationName,
  });

  final String? location;
  final String? locationType;
  final String? locationName;
}
