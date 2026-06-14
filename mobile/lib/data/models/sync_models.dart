enum SyncStatus {
  synced,
  pending,
  conflict,
  failed,
}

SyncStatus syncStatusFromDb(String value) {
  return SyncStatus.values.firstWhere(
    (item) => item.name == value,
    orElse: () => SyncStatus.pending,
  );
}

class BookMasterLocal {
  BookMasterLocal({
    required this.localId,
    required this.remoteId,
    required this.title,
    this.isbn,
    this.category,
    required this.createdAt,
    required this.updatedAt,
    this.deletedAt,
    required this.syncStatus,
    this.lastSyncedAt,
    required this.deviceId,
    required this.rowVersion,
  });

  final String localId;
  final String? remoteId;
  final String title;
  final String? isbn;
  final String? category;
  final String createdAt;
  final String updatedAt;
  final String? deletedAt;
  final SyncStatus syncStatus;
  final String? lastSyncedAt;
  final String deviceId;
  final int rowVersion;
}

class BookCopyLocal {
  BookCopyLocal({
    required this.localId,
    required this.remoteId,
    required this.bookLocalId,
    this.bookRemoteId,
    required this.epcTag,
    this.location,
    this.locationType,
    this.locationName,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.deletedAt,
    required this.syncStatus,
    this.lastSyncedAt,
    required this.deviceId,
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
  final SyncStatus syncStatus;
  final String? lastSyncedAt;
  final String deviceId;
  final int rowVersion;
}

class BookBoxLocal {
  BookBoxLocal({
    required this.localId,
    required this.remoteId,
    required this.bookLocalId,
    this.bookRemoteId,
    required this.epcTag,
    required this.quantity,
    this.location,
    this.locationType,
    this.locationName,
    required this.createdAt,
    required this.updatedAt,
    this.deletedAt,
    required this.syncStatus,
    this.lastSyncedAt,
    required this.deviceId,
    required this.rowVersion,
  });

  final String localId;
  final String? remoteId;
  final String bookLocalId;
  final String? bookRemoteId;
  final String epcTag;
  final int quantity;
  final String? location;
  final String? locationType;
  final String? locationName;
  final String createdAt;
  final String updatedAt;
  final String? deletedAt;
  final SyncStatus syncStatus;
  final String? lastSyncedAt;
  final String deviceId;
  final int rowVersion;
}

class SaleLocal {
  SaleLocal({
    required this.localId,
    required this.remoteId,
    required this.copyLocalId,
    this.copyRemoteId,
    required this.bookLocalId,
    this.bookRemoteId,
    required this.epcTag,
    required this.title,
    this.isbn,
    this.category,
    this.location,
    this.locationType,
    this.locationName,
    required this.pricePaid,
    this.notes,
    required this.soldAt,
    required this.updatedAt,
    this.deletedAt,
    required this.syncStatus,
    this.lastSyncedAt,
    required this.deviceId,
    required this.rowVersion,
  });

  final String localId;
  final String? remoteId;
  final String copyLocalId;
  final String? copyRemoteId;
  final String bookLocalId;
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
  final SyncStatus syncStatus;
  final String? lastSyncedAt;
  final String deviceId;
  final int rowVersion;
}

class InventoryRow {
  InventoryRow({
    required this.copyLocalId,
    required this.copyRemoteId,
    required this.bookLocalId,
    required this.bookRemoteId,
    required this.epcTag,
    required this.title,
    this.isbn,
    this.category,
    this.location,
    this.locationType,
    this.locationName,
    required this.status,
    required this.dateAdded,
    required this.updatedAt,
    required this.syncStatus,
  });

  final String copyLocalId;
  final String? copyRemoteId;
  final String bookLocalId;
  final String? bookRemoteId;
  final String epcTag;
  final String title;
  final String? isbn;
  final String? category;
  final String? location;
  final String? locationType;
  final String? locationName;
  final String status;
  final String dateAdded;
  final String updatedAt;
  final SyncStatus syncStatus;
}

class BoxInventoryRow {
  BoxInventoryRow({
    required this.boxLocalId,
    required this.boxRemoteId,
    required this.bookLocalId,
    required this.bookRemoteId,
    required this.epcTag,
    required this.quantity,
    required this.title,
    this.isbn,
    this.category,
    this.location,
    this.locationType,
    this.locationName,
    required this.dateAdded,
    required this.updatedAt,
    required this.syncStatus,
  });

  final String boxLocalId;
  final String? boxRemoteId;
  final String bookLocalId;
  final String? bookRemoteId;
  final String epcTag;
  final int quantity;
  final String title;
  final String? isbn;
  final String? category;
  final String? location;
  final String? locationType;
  final String? locationName;
  final String dateAdded;
  final String updatedAt;
  final SyncStatus syncStatus;
}

class LocationSummaryRow {
  const LocationSummaryRow({
    required this.locationType,
    required this.locationName,
    required this.locationDisplay,
    required this.totalBooks,
  });

  final String locationType;
  final String locationName;
  final String locationDisplay;
  final int totalBooks;
}

class SyncQueueItem {
  SyncQueueItem({
    required this.id,
    required this.operationId,
    required this.tableName,
    required this.action,
    required this.localId,
    this.remoteId,
    required this.payloadJson,
    required this.clientUpdatedAt,
    required this.rowVersion,
    required this.retryCount,
    this.lastError,
    required this.createdAt,
  });

  final int id;
  final String operationId;
  final String tableName;
  final String action;
  final String localId;
  final String? remoteId;
  final String payloadJson;
  final String clientUpdatedAt;
  final int rowVersion;
  final int retryCount;
  final String? lastError;
  final String createdAt;
}
