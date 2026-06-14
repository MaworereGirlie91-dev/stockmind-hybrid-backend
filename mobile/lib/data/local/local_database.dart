import 'dart:async';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

class LocalDatabase {
  LocalDatabase._();

  static final LocalDatabase instance = LocalDatabase._();

  static const String _dbName = 'stockmind_mobile.db';
  static const int _dbVersion = 4;

  Database? _db;

  Future<Database> get database async {
    if (_db != null) {
      return _db!;
    }

    final dir = await getApplicationDocumentsDirectory();
    final path = p.join(dir.path, _dbName);

    _db = await openDatabase(
      path,
      version: _dbVersion,
      onCreate: (db, version) async {
        await _createSchema(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await db.execute(
              'ALTER TABLE auth_session ADD COLUMN password_hash TEXT');
          await db.execute(
              'ALTER TABLE auth_session ADD COLUMN password_salt TEXT');
        }
        if (oldVersion < 3) {
          await db.execute('''
            CREATE TABLE IF NOT EXISTS book_boxes_local (
              local_id TEXT PRIMARY KEY,
              remote_id TEXT,
              book_local_id TEXT NOT NULL,
              book_remote_id TEXT,
              epc_tag TEXT NOT NULL,
              quantity INTEGER NOT NULL,
              location TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              deleted_at TEXT,
              sync_status TEXT NOT NULL,
              last_synced_at TEXT,
              device_id TEXT NOT NULL,
              row_version INTEGER NOT NULL DEFAULT 1,
              FOREIGN KEY (book_local_id) REFERENCES books_master_local(local_id)
            )
          ''');
          await db.execute(
              'CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_remote_id ON book_boxes_local(remote_id)');
          await db.execute(
              'CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_epc_tag ON book_boxes_local(epc_tag)');
          await db.execute(
              'CREATE INDEX IF NOT EXISTS idx_boxes_updated_at ON book_boxes_local(updated_at)');
          await db.execute(
              'CREATE INDEX IF NOT EXISTS idx_boxes_sync_status ON book_boxes_local(sync_status)');

          final now =
              DateTime.fromMillisecondsSinceEpoch(0).toUtc().toIso8601String();
          await db.insert(
            'sync_state',
            {
              'table_name': 'book_boxes',
              'last_checkpoint': now,
              'updated_at': DateTime.now().toUtc().toIso8601String(),
            },
            conflictAlgorithm: ConflictAlgorithm.ignore,
          );
        }
        if (oldVersion < 4) {
          await db.execute(
              'ALTER TABLE book_copies_local ADD COLUMN location_type TEXT');
          await db.execute(
              'ALTER TABLE book_copies_local ADD COLUMN location_name TEXT');
          await db.execute(
              'ALTER TABLE book_boxes_local ADD COLUMN location_type TEXT');
          await db.execute(
              'ALTER TABLE book_boxes_local ADD COLUMN location_name TEXT');
          await db.execute('ALTER TABLE sales_local ADD COLUMN location_type TEXT');
          await db.execute('ALTER TABLE sales_local ADD COLUMN location_name TEXT');

          await db.execute('''
            UPDATE book_copies_local
            SET location_name = trim(location)
            WHERE coalesce(trim(location_name), '') = '' AND coalesce(trim(location), '') <> ''
          ''');
          await db.execute('''
            UPDATE book_copies_local
            SET location_type = 'warehouse',
                location_name = trim(substr(location, instr(location, ':') + 1))
            WHERE instr(location, ':') > 0 AND lower(trim(location)) LIKE 'warehouse:%'
          ''');
          await db.execute('''
            UPDATE book_copies_local
            SET location_type = 'stock_room',
                location_name = trim(substr(location, instr(location, ':') + 1))
            WHERE instr(location, ':') > 0 AND (
              lower(trim(location)) LIKE 'stock room:%' OR
              lower(trim(location)) LIKE 'stock_room:%'
            )
          ''');
          await db.execute('''
            UPDATE book_copies_local
            SET location_type = 'shelf',
                location_name = trim(substr(location, instr(location, ':') + 1))
            WHERE instr(location, ':') > 0 AND lower(trim(location)) LIKE 'shelf:%'
          ''');
          await db.execute('''
            UPDATE book_copies_local
            SET location_type = 'shelf'
            WHERE coalesce(trim(location_type), '') = '' AND coalesce(trim(location_name), '') <> ''
          ''');

          await db.execute('''
            UPDATE book_boxes_local
            SET location_name = trim(location)
            WHERE coalesce(trim(location_name), '') = '' AND coalesce(trim(location), '') <> ''
          ''');
          await db.execute('''
            UPDATE book_boxes_local
            SET location_type = 'warehouse',
                location_name = trim(substr(location, instr(location, ':') + 1))
            WHERE instr(location, ':') > 0 AND lower(trim(location)) LIKE 'warehouse:%'
          ''');
          await db.execute('''
            UPDATE book_boxes_local
            SET location_type = 'stock_room',
                location_name = trim(substr(location, instr(location, ':') + 1))
            WHERE instr(location, ':') > 0 AND (
              lower(trim(location)) LIKE 'stock room:%' OR
              lower(trim(location)) LIKE 'stock_room:%'
            )
          ''');
          await db.execute('''
            UPDATE book_boxes_local
            SET location_type = 'shelf',
                location_name = trim(substr(location, instr(location, ':') + 1))
            WHERE instr(location, ':') > 0 AND lower(trim(location)) LIKE 'shelf:%'
          ''');
          await db.execute('''
            UPDATE book_boxes_local
            SET location_type = 'shelf'
            WHERE coalesce(trim(location_type), '') = '' AND coalesce(trim(location_name), '') <> ''
          ''');

          await db.execute('''
            UPDATE sales_local
            SET location_name = trim(location)
            WHERE coalesce(trim(location_name), '') = '' AND coalesce(trim(location), '') <> ''
          ''');
          await db.execute('''
            UPDATE sales_local
            SET location_type = 'warehouse',
                location_name = trim(substr(location, instr(location, ':') + 1))
            WHERE instr(location, ':') > 0 AND lower(trim(location)) LIKE 'warehouse:%'
          ''');
          await db.execute('''
            UPDATE sales_local
            SET location_type = 'stock_room',
                location_name = trim(substr(location, instr(location, ':') + 1))
            WHERE instr(location, ':') > 0 AND (
              lower(trim(location)) LIKE 'stock room:%' OR
              lower(trim(location)) LIKE 'stock_room:%'
            )
          ''');
          await db.execute('''
            UPDATE sales_local
            SET location_type = 'shelf',
                location_name = trim(substr(location, instr(location, ':') + 1))
            WHERE instr(location, ':') > 0 AND lower(trim(location)) LIKE 'shelf:%'
          ''');
          await db.execute('''
            UPDATE sales_local
            SET location_type = 'shelf'
            WHERE coalesce(trim(location_type), '') = '' AND coalesce(trim(location_name), '') <> ''
          ''');
        }
      },
      onOpen: (db) async {
        await db.execute('PRAGMA foreign_keys = ON');
      },
    );

    return _db!;
  }

  Future<void> _createSchema(Database db) async {
    await db.execute('''
      CREATE TABLE books_master_local (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        title TEXT NOT NULL,
        isbn TEXT,
        category TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL,
        last_synced_at TEXT,
        device_id TEXT NOT NULL,
        row_version INTEGER NOT NULL DEFAULT 1
      )
    ''');

    await db.execute(
        'CREATE UNIQUE INDEX idx_books_remote_id ON books_master_local(remote_id)');
    await db.execute(
        'CREATE INDEX idx_books_updated_at ON books_master_local(updated_at)');
    await db.execute(
        'CREATE INDEX idx_books_sync_status ON books_master_local(sync_status)');

    await db.execute('''
      CREATE TABLE book_copies_local (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        book_local_id TEXT NOT NULL,
        book_remote_id TEXT,
        epc_tag TEXT NOT NULL,
        location TEXT,
        location_type TEXT,
        location_name TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL,
        last_synced_at TEXT,
        device_id TEXT NOT NULL,
        row_version INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (book_local_id) REFERENCES books_master_local(local_id)
      )
    ''');

    await db.execute(
        'CREATE UNIQUE INDEX idx_copies_remote_id ON book_copies_local(remote_id)');
    await db.execute(
        'CREATE UNIQUE INDEX idx_copies_epc_tag ON book_copies_local(epc_tag)');
    await db.execute(
        'CREATE INDEX idx_copies_updated_at ON book_copies_local(updated_at)');
    await db.execute(
        'CREATE INDEX idx_copies_sync_status ON book_copies_local(sync_status)');

    await db.execute('''
      CREATE TABLE book_boxes_local (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        book_local_id TEXT NOT NULL,
        book_remote_id TEXT,
        epc_tag TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        location TEXT,
        location_type TEXT,
        location_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL,
        last_synced_at TEXT,
        device_id TEXT NOT NULL,
        row_version INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (book_local_id) REFERENCES books_master_local(local_id)
      )
    ''');

    await db.execute(
        'CREATE UNIQUE INDEX idx_boxes_remote_id ON book_boxes_local(remote_id)');
    await db.execute(
        'CREATE UNIQUE INDEX idx_boxes_epc_tag ON book_boxes_local(epc_tag)');
    await db.execute(
        'CREATE INDEX idx_boxes_updated_at ON book_boxes_local(updated_at)');
    await db.execute(
        'CREATE INDEX idx_boxes_sync_status ON book_boxes_local(sync_status)');

    await db.execute('''
      CREATE TABLE sales_local (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        copy_local_id TEXT,
        copy_remote_id TEXT,
        book_local_id TEXT,
        book_remote_id TEXT,
        epc_tag TEXT NOT NULL,
        title TEXT NOT NULL,
        isbn TEXT,
        category TEXT,
        location TEXT,
        location_type TEXT,
        location_name TEXT,
        price_paid REAL NOT NULL,
        notes TEXT,
        sold_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL,
        last_synced_at TEXT,
        device_id TEXT NOT NULL,
        row_version INTEGER NOT NULL DEFAULT 1
      )
    ''');

    await db.execute(
        'CREATE UNIQUE INDEX idx_sales_remote_id ON sales_local(remote_id)');
    await db.execute(
        'CREATE INDEX idx_sales_updated_at ON sales_local(updated_at)');
    await db.execute(
        'CREATE INDEX idx_sales_sync_status ON sales_local(sync_status)');

    await db.execute('''
      CREATE TABLE sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        local_id TEXT NOT NULL,
        remote_id TEXT,
        payload_json TEXT NOT NULL,
        client_updated_at TEXT NOT NULL,
        row_version INTEGER NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL
      )
    ''');

    await db.execute(
        'CREATE UNIQUE INDEX idx_sync_queue_operation_id ON sync_queue(operation_id)');
    await db.execute(
        'CREATE INDEX idx_sync_queue_created_at ON sync_queue(created_at)');

    await db.execute('''
      CREATE TABLE sync_state (
        table_name TEXT PRIMARY KEY,
        last_checkpoint TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE auth_session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL,
        token TEXT,
        role TEXT,
        device_id TEXT,
        expires_at TEXT,
        password_hash TEXT,
        password_salt TEXT
      )
    ''');

    final now =
        DateTime.fromMillisecondsSinceEpoch(0).toUtc().toIso8601String();
    for (final table in const ['books_master', 'book_copies', 'book_boxes', 'sales']) {
      await db.insert('sync_state', {
        'table_name': table,
        'last_checkpoint': now,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      });
    }
  }

  Future<List<Map<String, Object?>>> query(
    String table, {
    bool? distinct,
    List<String>? columns,
    String? where,
    List<Object?>? whereArgs,
    String? groupBy,
    String? having,
    String? orderBy,
    int? limit,
    int? offset,
  }) async {
    final db = await database;
    return db.query(
      table,
      distinct: distinct,
      columns: columns,
      where: where,
      whereArgs: whereArgs,
      groupBy: groupBy,
      having: having,
      orderBy: orderBy,
      limit: limit,
      offset: offset,
    );
  }

  Future<int> insert(
    String table,
    Map<String, Object?> values, {
    ConflictAlgorithm conflictAlgorithm = ConflictAlgorithm.abort,
  }) async {
    final db = await database;
    return db.insert(table, values, conflictAlgorithm: conflictAlgorithm);
  }

  Future<int> update(
    String table,
    Map<String, Object?> values, {
    String? where,
    List<Object?>? whereArgs,
    ConflictAlgorithm conflictAlgorithm = ConflictAlgorithm.abort,
  }) async {
    final db = await database;
    return db.update(
      table,
      values,
      where: where,
      whereArgs: whereArgs,
      conflictAlgorithm: conflictAlgorithm,
    );
  }

  Future<int> delete(
    String table, {
    String? where,
    List<Object?>? whereArgs,
  }) async {
    final db = await database;
    return db.delete(table, where: where, whereArgs: whereArgs);
  }

  Future<T> transaction<T>(Future<T> Function(Transaction txn) action) async {
    final db = await database;
    return db.transaction(action);
  }

  Future<void> close() async {
    final db = _db;
    if (db != null) {
      await db.close();
      _db = null;
    }
  }
}
