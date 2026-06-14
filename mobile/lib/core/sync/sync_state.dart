enum SyncHealth {
  offline,
  pending,
  synced,
  conflict,
  failed,
}

class SyncSnapshot {
  const SyncSnapshot({
    required this.health,
    this.lastSyncAt,
    this.pendingCount = 0,
    this.conflictCount = 0,
    this.message,
  });

  final SyncHealth health;
  final DateTime? lastSyncAt;
  final int pendingCount;
  final int conflictCount;
  final String? message;

  SyncSnapshot copyWith({
    SyncHealth? health,
    DateTime? lastSyncAt,
    int? pendingCount,
    int? conflictCount,
    String? message,
  }) {
    return SyncSnapshot(
      health: health ?? this.health,
      lastSyncAt: lastSyncAt ?? this.lastSyncAt,
      pendingCount: pendingCount ?? this.pendingCount,
      conflictCount: conflictCount ?? this.conflictCount,
      message: message,
    );
  }
}
