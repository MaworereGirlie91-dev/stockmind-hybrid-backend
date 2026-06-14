import 'package:flutter/material.dart';

import '../../data/models/sync_models.dart';
import '../../services/app_state.dart';
import '../theme.dart';

enum _SaleMode { single, bulk }

class SalesTab extends StatefulWidget {
  const SalesTab({super.key, required this.appState});

  final AppState appState;

  @override
  State<SalesTab> createState() => _SalesTabState();
}

class _SalesTabState extends State<SalesTab> {
  final _notesController = TextEditingController();
  final _scanTagController = TextEditingController();
  final _bulkScanFocusNode = FocusNode();
  final List<String> _bulkValidTags = <String>[];
  final List<String> _bulkDuplicateTags = <String>[];

  InventoryRow? _singleSaleCopy;
  _SaleMode _saleMode = _SaleMode.single;
  bool _bulkContinuousScanActive = false;
  bool _saving = false;
  String? _message;

  List<String> _extractTags(String input) {
    final normalized = input.trim().toUpperCase();
    if (normalized.isEmpty) {
      return const <String>[];
    }
    return normalized
        .split(RegExp(r'[\s,;]+'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }

  @override
  void dispose() {
    _notesController.dispose();
    _scanTagController.dispose();
    _bulkScanFocusNode.dispose();
    super.dispose();
  }

  void _switchMode(_SaleMode mode) {
    setState(() {
      _saleMode = mode;
      _message = null;
      _scanTagController.clear();
      _singleSaleCopy = null;
      _bulkValidTags.clear();
      _bulkDuplicateTags.clear();
      _bulkContinuousScanActive = false;
    });
  }

  String _availabilityMessage(String tag, InventoryRow? copy) {
    if (copy == null) {
      return 'EPC tag $tag was not found in inventory.';
    }
    if (copy.status == 'checked_out') {
      return 'EPC tag $tag has already been declared sold and cannot be sold twice.';
    }
    return 'EPC tag $tag is not available for sale.';
  }

  void _scanSingleTag(Map<String, InventoryRow> copiesByEpc) {
    final tags = _extractTags(_scanTagController.text);
    if (tags.isEmpty) {
      setState(() {
        _singleSaleCopy = null;
        _message = 'Scan or enter one EPC tag.';
      });
      return;
    }
    if (tags.length > 1) {
      setState(() {
        _singleSaleCopy = null;
        _message =
            'Single Sale accepts exactly one EPC tag. Remove extra tags before saving.';
      });
      return;
    }

    final tag = tags.first;
    final copy = copiesByEpc[tag];
    if (copy == null || copy.status != 'in_stock') {
      setState(() {
        _singleSaleCopy = null;
        _scanTagController.text = tag;
        _message = _availabilityMessage(tag, copy);
      });
      return;
    }

    setState(() {
      _singleSaleCopy = copy;
      _scanTagController.text = tag;
      _message = 'Ready to record sale for ${copy.title}.';
    });
  }

  void _addDuplicateTag(String tag) {
    if (_bulkDuplicateTags.contains(tag)) {
      return;
    }
    _bulkDuplicateTags.insert(0, tag);
  }

  void _appendBulkTags(Map<String, InventoryRow> copiesByEpc) {
    final tags = _extractTags(_scanTagController.text);
    if (tags.isEmpty) {
      return;
    }

    final validAdded = <String>[];
    final duplicateHits = <String>[];
    final soldHits = <String>[];

    setState(() {
      for (final tag in tags) {
        final copy = copiesByEpc[tag];
        if (_bulkValidTags.contains(tag) || _bulkDuplicateTags.contains(tag)) {
          _addDuplicateTag(tag);
          duplicateHits.add(tag);
          continue;
        }
        if (copy == null) {
          _addDuplicateTag(tag);
          duplicateHits.add(tag);
          continue;
        }
        if (copy.status != 'in_stock') {
          _addDuplicateTag(tag);
          soldHits.add(tag);
          continue;
        }
        _bulkValidTags.insert(0, tag);
        validAdded.add(tag);
      }
      _scanTagController.clear();

      if (soldHits.isNotEmpty) {
        _message =
            'These EPC tags were already declared sold and were skipped: ${soldHits.join(', ')}';
      } else if (duplicateHits.isNotEmpty && validAdded.isNotEmpty) {
        _message =
            '${validAdded.length} tag(s) ready for sale. Duplicate or unknown EPCs skipped: ${duplicateHits.join(', ')}';
      } else if (duplicateHits.isNotEmpty) {
        _message =
            'Duplicate or unknown EPCs skipped: ${duplicateHits.join(', ')}';
      } else {
        _message = '${validAdded.length} tag(s) ready for sale.';
      }
    });

    if (_bulkContinuousScanActive && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _bulkScanFocusNode.requestFocus();
        }
      });
    }
  }

  void _maybeConsumeBulkScanInput(
    String value,
    Map<String, InventoryRow> copiesByEpc,
  ) {
    if (!_bulkContinuousScanActive) {
      return;
    }
    if (!RegExp(r'[\r\n,;\t ]').hasMatch(value)) {
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _bulkContinuousScanActive) {
        _appendBulkTags(copiesByEpc);
      }
    });
  }

  void _startBulkContinuousScan() {
    setState(() {
      _bulkContinuousScanActive = true;
      _message =
          'Bulk sale scan started. Keep scanning tags until you press Stop Scan.';
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _bulkScanFocusNode.requestFocus();
      }
    });
  }

  void _stopBulkContinuousScan() {
    setState(() {
      _bulkContinuousScanActive = false;
      _message = 'Bulk sale scan stopped.';
    });
  }

  Future<void> _recordSale(Map<String, InventoryRow> copiesByEpc) async {
    List<String> tags;

    if (_saleMode == _SaleMode.single) {
      final rawTags = _extractTags(_scanTagController.text);
      if (rawTags.isEmpty) {
        setState(() => _message = 'Scan one EPC tag before recording sale.');
        return;
      }
      if (rawTags.length > 1) {
        setState(() {
          _message =
              'Single Sale accepts exactly one EPC tag. Remove extra tags before saving.';
        });
        return;
      }

      final tag = rawTags.first;
      final copy = copiesByEpc[tag];
      if (copy == null || copy.status != 'in_stock') {
        setState(() {
          _singleSaleCopy = null;
          _message = _availabilityMessage(tag, copy);
        });
        return;
      }

      _singleSaleCopy = copy;
      tags = <String>[tag];
    } else {
      if (_bulkValidTags.isEmpty) {
        setState(() => _message = 'Scan at least one valid EPC tag first.');
        return;
      }
      tags = List<String>.from(_bulkValidTags);
    }

    setState(() {
      _saving = true;
      _message = null;
    });

    try {
      await widget.appState.completeSaleByEpcTags(
        epcTags: tags,
        notes: _notesController.text,
      );

      setState(() {
        _notesController.clear();
        _scanTagController.clear();
        _singleSaleCopy = null;
        _bulkValidTags.clear();
        _bulkDuplicateTags.clear();
        _bulkContinuousScanActive = false;
        _message =
            '${tags.length} book${tags.length == 1 ? '' : 's'} sold locally and queued for sync.';
      });
    } catch (error) {
      final message = error.toString().replaceFirst('Exception: ', '');
      setState(() {
        _message = message;
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  Widget _readOnlyField({
    required String label,
    required String value,
    int maxLines = 1,
  }) {
    return TextFormField(
      readOnly: true,
      initialValue: value,
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<InventoryRow>>(
      future: widget.appState.inventory(),
      builder: (context, snapshot) {
        final allCopies = snapshot.data ?? const <InventoryRow>[];
        final copiesByEpc = <String, InventoryRow>{
          for (final copy in allCopies)
            copy.epcTag.trim().toUpperCase(): copy,
        };
        final inStockCount =
            allCopies.where((item) => item.status == 'in_stock').length;
        final bulkTitleCounts = <String, int>{};
        for (final tag in _bulkValidTags) {
          final copy = copiesByEpc[tag];
          if (copy == null) {
            continue;
          }
          final key = copy.title.trim().isEmpty ? 'Unknown title' : copy.title;
          bulkTitleCounts[key] = (bulkTitleCounts[key] ?? 0) + 1;
        }
        final bulkTitleLines = bulkTitleCounts.entries
            .map((entry) => '${entry.key} x${entry.value}')
            .toList()
          ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

        return ListView(
          padding: const EdgeInsets.all(14),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Sales',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: AppTheme.foreground,
                          ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Choose Single Sale or Bulk Sale. Record sales by scanning EPC tags only.',
                      style: TextStyle(color: AppTheme.muted),
                    ),
                    const SizedBox(height: 14),
                    SegmentedButton<_SaleMode>(
                      segments: const [
                        ButtonSegment<_SaleMode>(
                          value: _SaleMode.single,
                          icon: Icon(Icons.looks_one_rounded),
                          label: Text('Single Sale'),
                        ),
                        ButtonSegment<_SaleMode>(
                          value: _SaleMode.bulk,
                          icon: Icon(Icons.layers_outlined),
                          label: Text('Bulk Sale'),
                        ),
                      ],
                      selected: {_saleMode},
                      onSelectionChanged: (value) => _switchMode(value.first),
                    ),
                    const SizedBox(height: 12),
                    if (_saleMode == _SaleMode.single) ...[
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _scanTagController,
                              decoration: const InputDecoration(
                                labelText: 'EPC Tag',
                                hintText: 'Scan or type one EPC tag',
                              ),
                              onChanged: (_) {
                                setState(() {
                                  _singleSaleCopy = null;
                                });
                              },
                              onSubmitted: (_) => _scanSingleTag(copiesByEpc),
                            ),
                          ),
                          const SizedBox(width: 10),
                          ElevatedButton.icon(
                            onPressed: () => _scanSingleTag(copiesByEpc),
                            icon: const Icon(Icons.qr_code_scanner_rounded),
                            label: const Text('Scan Tag'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      _readOnlyField(
                        label: 'Book Title',
                        value: _singleSaleCopy?.title ?? '',
                      ),
                      const SizedBox(height: 10),
                      _readOnlyField(
                        label: 'ISBN',
                        value: _singleSaleCopy?.isbn ?? '',
                      ),
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1D4ED8),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFF2563EB)),
                        ),
                        child: const Text(
                          'Number Sold: 1',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ] else ...[
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ElevatedButton.icon(
                            onPressed: _bulkContinuousScanActive
                                ? null
                                : _startBulkContinuousScan,
                            icon: const Icon(Icons.play_arrow_rounded),
                            label: const Text('Start Scan'),
                          ),
                          OutlinedButton.icon(
                            onPressed: _bulkContinuousScanActive
                                ? _stopBulkContinuousScan
                                : null,
                            icon: const Icon(Icons.stop_circle_outlined),
                            label: const Text('Stop Scan'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _scanTagController,
                              focusNode: _bulkScanFocusNode,
                              decoration: const InputDecoration(
                                labelText: 'EPC Tag',
                                hintText: 'Scan continuously or type EPC tag',
                              ),
                              onChanged: (value) =>
                                  _maybeConsumeBulkScanInput(value, copiesByEpc),
                              onSubmitted: (_) => _appendBulkTags(copiesByEpc),
                            ),
                          ),
                          const SizedBox(width: 10),
                          ElevatedButton.icon(
                            onPressed: () => _appendBulkTags(copiesByEpc),
                            icon: const Icon(Icons.qr_code_scanner_rounded),
                            label: const Text('Scan Tag'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppTheme.success.withAlpha(18),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: AppTheme.success.withAlpha(80),
                                ),
                              ),
                              child: Text(
                                'Valid: ${_bulkValidTags.length}',
                                style: const TextStyle(
                                  color: AppTheme.foreground,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppTheme.warning.withAlpha(18),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: AppTheme.warning.withAlpha(80),
                                ),
                              ),
                              child: Text(
                                'Duplicates: ${_bulkDuplicateTags.length}',
                                style: const TextStyle(
                                  color: AppTheme.foreground,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      _readOnlyField(
                        label: 'Book Title',
                        value: bulkTitleLines.join('\n'),
                        maxLines: bulkTitleLines.isEmpty ? 1 : bulkTitleLines.length,
                      ),
                      if (_bulkValidTags.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _bulkValidTags
                              .map(
                                (tag) => Chip(
                                  label: Text(
                                    '${copiesByEpc[tag]?.title ?? 'Unknown'} | $tag',
                                  ),
                                  onDeleted: () {
                                    setState(() {
                                      _bulkValidTags.remove(tag);
                                    });
                                  },
                                ),
                              )
                              .toList(),
                        ),
                      ],
                      if (_bulkDuplicateTags.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppTheme.warning.withAlpha(14),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: AppTheme.warning.withAlpha(90),
                            ),
                          ),
                          child: Text(
                            'Duplicate or blocked EPCs: ${_bulkDuplicateTags.join(', ')}',
                            style: const TextStyle(
                              color: AppTheme.foreground,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ],
                    const SizedBox(height: 10),
                    TextField(
                      controller: _notesController,
                      decoration: const InputDecoration(
                        labelText: 'Notes (optional)',
                      ),
                      maxLines: 2,
                    ),
                    const SizedBox(height: 14),
                    if (_message != null)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: _message!.toLowerCase().contains('failed') ||
                                  _message!.toLowerCase().contains('error') ||
                                  _message!.toLowerCase().contains('not available') ||
                                  _message!.toLowerCase().contains('already')
                              ? AppTheme.danger.withAlpha(12)
                              : AppTheme.brand.withAlpha(12),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: _message!.toLowerCase().contains('failed') ||
                                    _message!.toLowerCase().contains('error') ||
                                    _message!.toLowerCase().contains('not available') ||
                                    _message!.toLowerCase().contains('already')
                                ? AppTheme.danger.withAlpha(90)
                                : AppTheme.brand.withAlpha(90),
                          ),
                        ),
                        child: Text(
                          _message!,
                          style: const TextStyle(color: AppTheme.foreground),
                        ),
                      ),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _saving ? null : () => _recordSale(copiesByEpc),
                        icon: _saving
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.point_of_sale_outlined),
                        label: Text(
                          _saleMode == _SaleMode.single
                              ? 'Record Single Sale'
                              : 'Record Bulk Sale',
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'In stock copies: $inStockCount',
                      style: const TextStyle(color: AppTheme.muted),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
