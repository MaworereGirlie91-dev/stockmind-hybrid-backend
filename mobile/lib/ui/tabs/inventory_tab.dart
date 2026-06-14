import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/location/location_utils.dart';
import '../../data/models/sync_models.dart';
import '../../services/app_state.dart';
import '../theme.dart';

enum _InventoryMenuAction {
  editLocation,
  clearLocation,
  deleteCopy,
}

class InventoryTab extends StatefulWidget {
  const InventoryTab({super.key, required this.appState});

  final AppState appState;

  @override
  State<InventoryTab> createState() => _InventoryTabState();
}

class _InventoryTabState extends State<InventoryTab> {
  static const Duration _undoWindow = Duration(seconds: 10);

  final _searchController = TextEditingController();
  late Future<List<InventoryRow>> _future;
  late Future<List<BoxInventoryRow>> _boxesFuture;
  late Future<List<SaleLocal>> _salesFuture;

  @override
  void initState() {
    super.initState();
    _future = widget.appState.inventory();
    _boxesFuture = widget.appState.boxInventory();
    _salesFuture = widget.appState.sales(limit: 5000);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _reload() {
    setState(() {
      _future = widget.appState.inventory(search: _searchController.text);
      _boxesFuture = widget.appState.boxInventory(search: _searchController.text);
      _salesFuture = widget.appState.sales(limit: 5000);
    });
  }

  Future<void> _undoLastAction() async {
    try {
      final label = await widget.appState.undoInventoryAction();
      if (!mounted || label == null) {
        return;
      }
      _reload();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Undid $label.'),
          duration: const Duration(seconds: 3),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Undo failed: $error')),
      );
    }
  }

  void _showUndoSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        duration: _undoWindow,
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () => unawaited(_undoLastAction()),
        ),
      ),
    );
  }

  Future<void> _editLocation(InventoryRow item) async {
    final current = parseLocation(
      location: item.location,
      locationType: item.locationType,
      locationName: item.locationName,
    );
    final nameController =
        TextEditingController(text: current.locationName ?? '');
    var selectedType = current.locationType ?? kLocationTypeShelf;

    final value = await showDialog<_LocationEditValue>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          title: const Text('Edit Location'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selectedType,
                decoration: const InputDecoration(labelText: 'Location Type'),
                items: const [
                  DropdownMenuItem<String>(
                    value: kLocationTypeWarehouse,
                    child: Text('Warehouse'),
                  ),
                  DropdownMenuItem<String>(
                    value: kLocationTypeStockRoom,
                    child: Text('Stock Room'),
                  ),
                  DropdownMenuItem<String>(
                    value: kLocationTypeShelf,
                    child: Text('Shelf'),
                  ),
                ],
                onChanged: (value) {
                  if (value == null) {
                    return;
                  }
                  setModalState(() {
                    selectedType = value;
                  });
                },
              ),
              const SizedBox(height: 10),
              TextField(
                controller: nameController,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'Location Name',
                  hintText: selectedType == kLocationTypeWarehouse
                      ? 'e.g. Main Warehouse'
                      : selectedType == kLocationTypeStockRoom
                          ? 'e.g. Room A'
                          : 'e.g. Shelf B2',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(
                _LocationEditValue(
                  locationType: selectedType,
                  locationName: nameController.text.trim(),
                ),
              ),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    nameController.dispose();

    if (value == null) {
      return;
    }

    await widget.appState.updateCopyLocation(
      copyLocalId: item.copyLocalId,
      locationType: value.locationName.isEmpty ? null : value.locationType,
      locationName: value.locationName.isEmpty ? null : value.locationName,
    );
    _reload();
    if (!mounted) {
      return;
    }
    _showUndoSnackBar(
      value.locationName.isEmpty
          ? 'Location cleared.'
          : 'Location updated to "${locationTypeLabel(value.locationType)}: ${value.locationName}".',
    );
  }

  Future<void> _clearLocation(InventoryRow item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clear location?'),
        content: const Text(
          'This removes location information for this copy.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Clear'),
          ),
        ],
      ),
    );

    if (confirmed != true) {
      return;
    }

    await widget.appState.updateCopyLocation(
      copyLocalId: item.copyLocalId,
      location: null,
      locationType: null,
      locationName: null,
    );
    _reload();
    if (!mounted) {
      return;
    }
    _showUndoSnackBar('Location cleared.');
  }

  Future<void> _deleteCopy(InventoryRow item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete copy?'),
        content: const Text(
          'This marks the copy as deleted locally and syncs the delete when online.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) {
      return;
    }

    await widget.appState.deleteCopy(item.copyLocalId);
    _reload();
    if (!mounted) {
      return;
    }
    _showUndoSnackBar('Copy deleted for testing.');
  }

  Future<void> _deleteGroup(_InventoryGroup group) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete book from inventory?'),
        content: Text(
          'This will delete ${group.items.length} cop${group.items.length == 1 ? 'y' : 'ies'} for "${group.title}" from local inventory and sync the delete when online.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) {
      return;
    }

    await widget.appState.deleteCopies(
      group.items.map((item) => item.copyLocalId).toList(),
    );
    _reload();
    if (!mounted) {
      return;
    }
    _showUndoSnackBar(
      'Deleted ${group.items.length} cop${group.items.length == 1 ? 'y' : 'ies'} for "${group.title}".',
    );
  }

  Color _statusColor(String status) {
    return switch (status) {
      'in_stock' => AppTheme.success,
      'checked_out' => AppTheme.warning,
      'lost' => AppTheme.danger,
      _ => AppTheme.muted,
    };
  }

  List<_InventoryGroup> _groupRows(
    List<InventoryRow> rows,
    List<SaleLocal> sales,
  ) {
    final map = <String, _InventoryGroupBuilder>{};
    final saleCounts = <String, int>{};

    for (final row in rows) {
      final key = [
        row.title.trim().toLowerCase(),
        (row.isbn ?? '').trim().toLowerCase(),
        (row.category ?? '').trim().toLowerCase(),
      ].join('|');

      final builder = map.putIfAbsent(
        key,
        () => _InventoryGroupBuilder(
          title: row.title,
          isbn: row.isbn,
          category: row.category,
        ),
      );
      builder.items.add(row);
    }

    for (final sale in sales) {
      final key = [
        sale.title.trim().toLowerCase(),
        (sale.isbn ?? '').trim().toLowerCase(),
        (sale.category ?? '').trim().toLowerCase(),
      ].join('|');
      saleCounts[key] = (saleCounts[key] ?? 0) + 1;
    }

    final groups = map.values
        .map((builder) {
          final key = [
            builder.title.trim().toLowerCase(),
            (builder.isbn ?? '').trim().toLowerCase(),
            (builder.category ?? '').trim().toLowerCase(),
          ].join('|');
          builder.items.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
          final syncCounts = <SyncStatus, int>{};
          for (final item in builder.items) {
            syncCounts[item.syncStatus] = (syncCounts[item.syncStatus] ?? 0) + 1;
          }
          final inStockCount = builder.items
              .where((item) => item.status == 'in_stock')
              .length;
          final locations = builder.items
              .map((item) => (item.location ?? 'No location').trim())
              .where((location) => location.isNotEmpty)
              .toSet()
              .toList()
            ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

          return _InventoryGroup(
            title: builder.title,
            isbn: builder.isbn,
            category: builder.category,
            items: builder.items,
            syncCounts: syncCounts,
            locations: locations,
            totalSales: saleCounts[key] ?? 0,
            inStockCount: inStockCount,
          );
        })
        .toList()
      ..sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));

    return groups;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppTheme.brand,
      onRefresh: () async {
        await widget.appState.syncNow();
        _reload();
      },
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Inventory',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: AppTheme.foreground,
                        ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Local-first listing with sync metadata status.',
                    style: TextStyle(color: AppTheme.muted),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search title, EPC, ISBN, category, location',
                      suffixIcon: IconButton(
                        onPressed: _reload,
                        icon: const Icon(Icons.search, color: AppTheme.brand),
                      ),
                    ),
                    onSubmitted: (_) => _reload(),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          FutureBuilder<List<dynamic>>(
            future: Future.wait<dynamic>([_future, _boxesFuture, _salesFuture]),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(30),
                    child: CircularProgressIndicator(color: AppTheme.brand),
                  ),
                );
              }

              if (snapshot.hasError) {
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Text(
                      'Failed to load inventory: ${snapshot.error}',
                      style: const TextStyle(color: AppTheme.danger),
                    ),
                  ),
                );
              }

              final rows = snapshot.data != null && snapshot.data!.isNotEmpty
                  ? (snapshot.data![0] as List<InventoryRow>? ??
                      const <InventoryRow>[])
                  : const <InventoryRow>[];
              final boxes = snapshot.data != null && snapshot.data!.length > 1
                  ? (snapshot.data![1] as List<BoxInventoryRow>? ??
                      const <BoxInventoryRow>[])
                  : const <BoxInventoryRow>[];
              final sales = snapshot.data != null && snapshot.data!.length > 2
                  ? (snapshot.data![2] as List<SaleLocal>? ??
                      const <SaleLocal>[])
                  : const <SaleLocal>[];
              if (rows.isEmpty && boxes.isEmpty) {
                return const Card(
                  child: Padding(
                    padding: EdgeInsets.all(18),
                    child: Text('No inventory records yet.'),
                  ),
                );
              }

              final groups = _groupRows(rows, sales);
              final copyCards = groups.map((group) {
                  final copyCount = group.items.length;
                  final syncSummary = <String>[
                    if ((group.syncCounts[SyncStatus.synced] ?? 0) > 0)
                      'synced ${group.syncCounts[SyncStatus.synced]}',
                    if ((group.syncCounts[SyncStatus.pending] ?? 0) > 0)
                      'pending ${group.syncCounts[SyncStatus.pending]}',
                    if ((group.syncCounts[SyncStatus.failed] ?? 0) > 0)
                      'failed ${group.syncCounts[SyncStatus.failed]}',
                    if ((group.syncCounts[SyncStatus.conflict] ?? 0) > 0)
                      'conflict ${group.syncCounts[SyncStatus.conflict]}',
                  ].join(' | ');

                  return Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ExpansionTile(
                      tilePadding:
                          const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                      childrenPadding:
                          const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _summaryPill(
                            'Sold',
                            group.totalSales,
                            AppTheme.brandDark,
                          ),
                          const SizedBox(width: 6),
                          _summaryPill(
                            'Stock',
                            group.inStockCount,
                            AppTheme.success,
                          ),
                          const SizedBox(width: 4),
                          IconButton(
                            tooltip: 'Delete book from inventory',
                            onPressed: () => _deleteGroup(group),
                            icon: const Icon(
                              Icons.delete_outline_rounded,
                              color: AppTheme.danger,
                            ),
                          ),
                          const Icon(
                            Icons.expand_more_rounded,
                            color: AppTheme.muted,
                          ),
                        ],
                      ),
                      title: Text(
                        group.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppTheme.foreground,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${group.isbn?.trim().isNotEmpty == true ? 'ISBN ${group.isbn}' : 'No ISBN'} | ${group.category ?? 'No category'}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppTheme.muted,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Copies: $copyCount | Locations: ${group.locations.join(', ')}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppTheme.muted,
                              ),
                            ),
                            if (syncSummary.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                'Sync: $syncSummary',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: (group.syncCounts[SyncStatus.conflict] ?? 0) >
                                          0
                                      ? AppTheme.warning
                                      : AppTheme.muted,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      children: group.items.map((item) {
                        final statusColor = _statusColor(item.status);
                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppTheme.cardHover,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppTheme.border),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'EPC: ${item.epcTag}',
                                      style: const TextStyle(
                                        color: AppTheme.foreground,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 12,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      'Location: ${item.location ?? 'No location'}',
                                      style: const TextStyle(
                                        color: AppTheme.muted,
                                        fontSize: 12,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      'Sync: ${item.syncStatus.name}',
                                      style: TextStyle(
                                        color: item.syncStatus == SyncStatus.conflict
                                            ? AppTheme.warning
                                            : AppTheme.muted,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              Column(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 5,
                                    ),
                                    decoration: BoxDecoration(
                                      color: statusColor.withAlpha(20),
                                      borderRadius: BorderRadius.circular(999),
                                      border: Border.all(
                                        color: statusColor.withAlpha(90),
                                      ),
                                    ),
                                    child: Text(
                                      item.status,
                                      style: TextStyle(
                                        color: statusColor,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ),
                                  PopupMenuButton<_InventoryMenuAction>(
                                    tooltip: 'Manage copy',
                                    onSelected: (value) async {
                                      if (value ==
                                          _InventoryMenuAction.editLocation) {
                                        await _editLocation(item);
                                        return;
                                      }
                                      if (value ==
                                          _InventoryMenuAction.clearLocation) {
                                        await _clearLocation(item);
                                        return;
                                      }
                                      await _deleteCopy(item);
                                    },
                                    itemBuilder: (context) => [
                                      const PopupMenuItem<_InventoryMenuAction>(
                                        value: _InventoryMenuAction.editLocation,
                                        child: Text('Edit location'),
                                      ),
                                      const PopupMenuItem<_InventoryMenuAction>(
                                        value: _InventoryMenuAction.clearLocation,
                                        child: Text('Clear location'),
                                      ),
                                      const PopupMenuDivider(),
                                      const PopupMenuItem<_InventoryMenuAction>(
                                        value: _InventoryMenuAction.deleteCopy,
                                        child: Text('Delete copy'),
                                      ),
                                    ],
                                    icon: const Icon(
                                      Icons.more_vert_rounded,
                                      color: AppTheme.foreground,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  );
                }).toList();

              return Column(
                children: [
                  ...copyCards,
                  if (boxes.isNotEmpty)
                    _buildBoxSection(boxes),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildBoxSection(List<BoxInventoryRow> boxes) {
    final grouped = <String, List<BoxInventoryRow>>{};
    for (final item in boxes) {
      final key = [
        item.title.trim().toLowerCase(),
        (item.isbn ?? '').trim().toLowerCase(),
        (item.category ?? '').trim().toLowerCase(),
      ].join('|');
      grouped.putIfAbsent(key, () => <BoxInventoryRow>[]).add(item);
    }

    final groups = grouped.values.toList()
      ..sort((a, b) =>
          (a.first.title).toLowerCase().compareTo((b.first.title).toLowerCase()));

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        childrenPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        title: const Text(
          'Tagged Boxes',
          style: TextStyle(
            color: AppTheme.foreground,
            fontWeight: FontWeight.w700,
          ),
        ),
        subtitle: Text(
          '${boxes.length} boxes | ${boxes.fold<int>(0, (sum, item) => sum + item.quantity)} books represented',
          style: const TextStyle(
            color: AppTheme.muted,
            fontSize: 12,
          ),
        ),
        trailing: Padding(
          padding: const EdgeInsets.only(right: 8),
          child: PopupMenuButton<String>(
            onSelected: (value) async {
              if (value == 'clear_all') {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Clear All Tagged Boxes'),
                    content: const Text(
                      'Are you sure you want to clear all tagged boxes? This will allow you to restart the counting process.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Cancel'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Clear All'),
                      ),
                    ],
                  ),
                );
                
                if (confirmed == true) {
                  try {
                    await widget.appState.clearAllBoxTags();
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('All tagged boxes cleared'),
                          duration: Duration(seconds: 2),
                        ),
                      );
                    }
                  } catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Error clearing boxes: $e'),
                          duration: const Duration(seconds: 3),
                        ),
                      );
                    }
                  }
                }
              }
            },
            itemBuilder: (context) => [
              const PopupMenuItem<String>(
                value: 'clear_all',
                child: Text('Clear All Boxes'),
              ),
            ],
            icon: const Icon(
              Icons.more_vert_rounded,
              color: AppTheme.foreground,
              size: 18,
            ),
          ),
        ),
        children: groups.map((groupRows) {
          final first = groupRows.first;
          final totalBooks =
              groupRows.fold<int>(0, (sum, item) => sum + item.quantity);
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppTheme.cardHover,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  first.title,
                  style: const TextStyle(
                    color: AppTheme.foreground,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${first.isbn?.trim().isNotEmpty == true ? 'ISBN ${first.isbn}' : 'No ISBN'} | ${first.category ?? 'No category'}',
                  style: const TextStyle(
                    color: AppTheme.muted,
                    fontSize: 11,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Boxes: ${groupRows.length} | Books represented: $totalBooks',
                  style: const TextStyle(
                    color: AppTheme.brandDark,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                ...groupRows.map((item) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'EPC: ${item.epcTag}',
                                  style: const TextStyle(
                                    color: AppTheme.foreground,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 11,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Location: ${item.location ?? 'No location'}',
                                  style: const TextStyle(
                                    color: AppTheme.muted,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: AppTheme.info.withAlpha(18),
                              borderRadius: BorderRadius.circular(999),
                              border:
                                  Border.all(color: AppTheme.info.withAlpha(80)),
                            ),
                            child: Text(
                              'Qty ${item.quantity}',
                              style: const TextStyle(
                                color: AppTheme.info,
                                fontWeight: FontWeight.w700,
                                fontSize: 10,
                              ),
                            ),
                          ),
                        ],
                      ),
                    )),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _summaryPill(String label, int value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withAlpha(18),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withAlpha(80)),
      ),
      child: Text(
        '$label $value',
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: 10,
        ),
      ),
    );
  }
}

class _InventoryGroupBuilder {
  _InventoryGroupBuilder({
    required this.title,
    required this.isbn,
    required this.category,
  });

  final String title;
  final String? isbn;
  final String? category;
  final List<InventoryRow> items = <InventoryRow>[];
}

class _InventoryGroup {
  const _InventoryGroup({
    required this.title,
    required this.isbn,
    required this.category,
    required this.items,
    required this.syncCounts,
    required this.locations,
    required this.totalSales,
    required this.inStockCount,
  });

  final String title;
  final String? isbn;
  final String? category;
  final List<InventoryRow> items;
  final Map<SyncStatus, int> syncCounts;
  final List<String> locations;
  final int totalSales;
  final int inStockCount;
}

class _LocationEditValue {
  const _LocationEditValue({
    required this.locationType,
    required this.locationName,
  });

  final String locationType;
  final String locationName;
}
