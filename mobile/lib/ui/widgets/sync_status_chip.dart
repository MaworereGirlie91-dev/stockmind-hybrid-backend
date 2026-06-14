import 'package:flutter/material.dart';

import '../../core/sync/sync_state.dart';
import '../theme.dart';

class SyncStatusChip extends StatelessWidget {
  const SyncStatusChip(
      {super.key, required this.snapshot, this.compact = false});

  final SyncSnapshot snapshot;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final info = _style(snapshot.health);

    return Container(
      padding: EdgeInsets.symmetric(
          horizontal: compact ? 8 : 10, vertical: compact ? 5 : 7),
      decoration: BoxDecoration(
        color: info.background,
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: info.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(info.icon, size: compact ? 12 : 14, color: info.foreground),
          const SizedBox(width: 6),
          Text(
            info.label,
            style: TextStyle(
              fontSize: compact ? 10 : 11,
              color: info.foreground,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (snapshot.pendingCount > 0) ...[
            const SizedBox(width: 6),
            Text(
              '${snapshot.pendingCount}',
              style: TextStyle(
                fontSize: compact ? 10 : 11,
                color: info.foreground,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          if (snapshot.conflictCount > 0) ...[
            const SizedBox(width: 6),
            Icon(Icons.warning_amber_rounded,
                size: compact ? 11 : 13, color: AppTheme.warning),
            Text(
              '${snapshot.conflictCount}',
              style: TextStyle(
                fontSize: compact ? 10 : 11,
                color: AppTheme.warning,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }

  _ChipInfo _style(SyncHealth health) {
    switch (health) {
      case SyncHealth.offline:
        return const _ChipInfo(
          label: 'offline',
          icon: Icons.cloud_off_rounded,
          foreground: AppTheme.warning,
          border: Color(0x44F59E0B),
          background: Colors.white,
        );
      case SyncHealth.pending:
        return const _ChipInfo(
          label: 'pending sync',
          icon: Icons.sync_rounded,
          foreground: AppTheme.brandDark,
          border: Color(0x44C8102E),
          background: Colors.white,
        );
      case SyncHealth.synced:
        return const _ChipInfo(
          label: 'synced',
          icon: Icons.check_circle_outline_rounded,
          foreground: AppTheme.success,
          border: Color(0x4422C55E),
          background: Colors.white,
        );
      case SyncHealth.conflict:
        return const _ChipInfo(
          label: 'conflict',
          icon: Icons.warning_amber_rounded,
          foreground: AppTheme.brandDark,
          border: Color(0x44C8102E),
          background: Colors.white,
        );
      case SyncHealth.failed:
        return const _ChipInfo(
          label: 'sync failed',
          icon: Icons.error_outline_rounded,
          foreground: AppTheme.danger,
          border: Color(0x44EF4444),
          background: Colors.white,
        );
    }
  }
}

class _ChipInfo {
  const _ChipInfo({
    required this.label,
    required this.icon,
    required this.foreground,
    required this.border,
    required this.background,
  });

  final String label;
  final IconData icon;
  final Color foreground;
  final Color border;
  final Color background;
}
