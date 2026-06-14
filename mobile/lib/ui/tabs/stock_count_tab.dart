import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/models/sync_models.dart';
import '../../services/app_state.dart';
import '../theme.dart';

const _expectedBlue = Color(0xFF2563EB);
const _stockCountRangeCacheKey = 'stock_count_scan_range_v1';

class StockCountTab extends StatefulWidget {
  const StockCountTab({super.key, required this.appState});

  final AppState appState;

  @override
  State<StockCountTab> createState() => _StockCountTabState();
}

class _StockCountTabState extends State<StockCountTab> {
  final _epcController = TextEditingController();
  final _scanRangeController = TextEditingController(text: '5.0');
  final _scanFocusNode = FocusNode();
  final Set<String> _scanned = <String>{};
  bool _counting = false;
  bool _savingCount = false;
  String _locationFilter = 'all';
  double _scanRangeMeters = 5.0;
  String? _scanMessage;

  @override
  void initState() {
    super.initState();
    _loadScanRange();
  }

  @override
  void dispose() {
    _epcController.dispose();
    _scanRangeController.dispose();
    _scanFocusNode.dispose();
    super.dispose();
  }

  Future<void> _loadScanRange() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_stockCountRangeCacheKey)?.trim();
    if (raw == null || raw.isEmpty) {
      return;
    }
    final parsed = double.tryParse(raw);
    if (parsed == null || parsed < 0 || parsed > 50) {
      return;
    }
    if (!mounted) {
      return;
    }
    setState(() {
      _scanRangeMeters = double.parse(parsed.toStringAsFixed(1));
      _scanRangeController.text = _scanRangeMeters.toStringAsFixed(1);
    });
  }

  Future<void> _persistScanRange() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _stockCountRangeCacheKey,
      _scanRangeMeters.toStringAsFixed(1),
    );
  }

  bool _applyScanRangeFromInput({bool showError = true}) {
    final raw = _scanRangeController.text.trim();
    final parsed = double.tryParse(raw);
    final validDecimal = RegExp(r'^\d{1,2}(\.\d)?$').hasMatch(raw);

    if (parsed == null || parsed < 0 || parsed > 50 || !validDecimal) {
      if (showError) {
        setState(() {
          _scanMessage =
              'Range must be 0 to 50 meters with up to one decimal place.';
        });
      }
      return false;
    }

    setState(() {
      _scanRangeMeters = double.parse(parsed.toStringAsFixed(1));
      _scanRangeController.text = _scanRangeMeters.toStringAsFixed(1);
    });
    _persistScanRange();
    return true;
  }

  void _start() {
    setState(() {
      _counting = true;
      _scanned.clear();
      _scanMessage =
          'Bulk stock count started. Keep scanning tags until you press Stop Count.';
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _scanFocusNode.requestFocus();
      }
    });
  }

  Future<void> _finish() async {
    if (_savingCount) {
      return;
    }

    setState(() {
      _savingCount = true;
      _scanMessage = 'Saving stock count results...';
    });

    try {
      await widget.appState.finalizeStockCount(
        scannedEpcs: Set<String>.from(_scanned),
        locationFilter: _locationFilter,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _counting = false;
        _scanMessage =
            'Stock count saved. Missing copies are marked lost, and found copies are marked in stock.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _scanMessage = error.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _savingCount = false;
        });
      }
    }
  }

  void _scan(Set<String> expectedEpcs) {
    if (!_applyScanRangeFromInput(showError: false)) {
      return;
    }

    final tags = _epcController.text
        .split(RegExp(r'[\s,;]+'))
        .map((item) => item.trim().toUpperCase())
        .where((item) => item.isNotEmpty)
        .toList();
    if (tags.isEmpty) {
      return;
    }

    var added = 0;
    final duplicates = <String>[];
    final invalid = <String>[];
    setState(() {
      _epcController.clear();
      for (final tag in tags) {
        if (!expectedEpcs.contains(tag)) {
          invalid.add(tag);
          continue;
        }
        if (_scanned.contains(tag)) {
          duplicates.add(tag);
          continue;
        }
        _scanned.add(tag);
        added += 1;
      }

      if (added > 0 && duplicates.isEmpty && invalid.isEmpty) {
        _scanMessage = '$added valid tag(s) counted.';
      } else if (added > 0) {
        final details = <String>['$added valid tag(s) counted'];
        if (duplicates.isNotEmpty) {
          details.add('duplicates ignored: ${duplicates.join(', ')}');
        }
        if (invalid.isNotEmpty) {
          details.add('not in expected scope: ${invalid.join(', ')}');
        }
        _scanMessage = '${details.join(' | ')}.';
      } else if (duplicates.isNotEmpty && invalid.isEmpty) {
        _scanMessage = 'Duplicate scan ignored: ${duplicates.join(', ')}';
      } else {
        _scanMessage =
            'No valid new tags counted. Not in expected scope: ${invalid.join(', ')}';
      }
    });

    if (_counting && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _scanFocusNode.requestFocus();
        }
      });
    }
  }

  void _maybeConsumeScanInput(String value, Set<String> expectedEpcs) {
    if (!_counting) {
      return;
    }
    if (!RegExp(r'[\r\n,;\t ]').hasMatch(value)) {
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _counting) {
        _scan(expectedEpcs);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppTheme.brand,
      onRefresh: () async {
        await widget.appState.syncNow();
        setState(() {});
      },
      child: FutureBuilder<List<dynamic>>(
        future: Future.wait<dynamic>([
          widget.appState.inventory(),
          widget.appState.sales(limit: 5000),
        ]),
        builder: (context, snapshot) {
          final all = (snapshot.data != null && snapshot.data!.isNotEmpty)
              ? (snapshot.data![0] as List<InventoryRow>? ??
                  const <InventoryRow>[])
              : const <InventoryRow>[];
          final sales = (snapshot.data != null && snapshot.data!.length > 1)
              ? (snapshot.data![1] as List<SaleLocal>? ?? const <SaleLocal>[])
              : const <SaleLocal>[];

          final locations = {
            'all',
            ...all.map((item) => item.location ?? 'No location'),
          }.toList()
            ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

          final scopedInventory = all.where((item) {
            if (_locationFilter == 'all') {
              return true;
            }
            final loc = item.location ?? 'No location';
            return loc == _locationFilter;
          }).toList();

          final scopedInventoryByEpc = <String, InventoryRow>{
            for (final row in scopedInventory)
              row.epcTag.trim().toUpperCase(): row,
          };

          final soldCount = sales
              .where((sale) {
                final tag = sale.epcTag.trim().toUpperCase();
                if (tag.isEmpty) {
                  return false;
                }
                if (_locationFilter == 'all') {
                  return true;
                }
                final saleLocation = (sale.location ?? 'No location').trim();
                if (saleLocation == _locationFilter) {
                  return true;
                }
                final scopedCopy = scopedInventoryByEpc[tag];
                final copyLocation =
                    (scopedCopy?.location ?? 'No location').trim();
                return copyLocation == _locationFilter;
              })
              .map((sale) => sale.epcTag.trim().toUpperCase())
              .toSet()
              .length;

          final expectedByEpc = <String, InventoryRow>{
            for (final row in scopedInventory.where(
              (item) => item.status != 'checked_out',
            ))
              row.epcTag.trim().toUpperCase(): row,
          };
          final expectedCount = expectedByEpc.length;
          final found = _scanned.length;
          final missing = math.max(0, expectedCount - found);
          final scannedList = _scanned.toList()..sort((a, b) => a.compareTo(b));

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
                        'Stock Count',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: AppTheme.foreground,
                            ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Track expected, found, sold, and missing counts fully offline.',
                        style: TextStyle(color: AppTheme.muted),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: _locationFilter,
                        decoration:
                            const InputDecoration(labelText: 'Location scope'),
                        items: locations
                            .map(
                              (location) => DropdownMenuItem<String>(
                                value: location,
                                child: Text(location),
                              ),
                            )
                            .toList(),
                        onChanged: (value) {
                          if (value == null) {
                            return;
                          }
                          setState(() {
                            _locationFilter = value;
                            _scanned.clear();
                            _scanMessage =
                                'Location scope changed. Start or continue scanning.';
                          });
                        },
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppTheme.brand.withAlpha(10),
                          borderRadius: BorderRadius.circular(12),
                          border:
                              Border.all(color: AppTheme.brand.withAlpha(70)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Reader Scan Range (0 to 50 meters)',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleSmall
                                  ?.copyWith(
                                    color: AppTheme.brandDark,
                                    fontWeight: FontWeight.w700,
                                  ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'This range only matters when a supported RFID reader is attached. A phone by itself cannot detect room tags by distance.',
                              style: TextStyle(
                                color: AppTheme.muted,
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Slider(
                              value: _scanRangeMeters,
                              min: 0,
                              max: 50,
                              divisions: 500,
                              label: '${_scanRangeMeters.toStringAsFixed(1)} m',
                              activeColor: AppTheme.brand,
                              onChanged: (value) {
                                setState(() {
                                  _scanRangeMeters =
                                      double.parse(value.toStringAsFixed(1));
                                  _scanRangeController.text =
                                      _scanRangeMeters.toStringAsFixed(1);
                                });
                              },
                              onChangeEnd: (_) => _persistScanRange(),
                            ),
                            TextField(
                              controller: _scanRangeController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              decoration: const InputDecoration(
                                labelText: 'Custom range (e.g. 1.5)',
                                suffixText: 'm',
                              ),
                              onSubmitted: (_) => _applyScanRangeFromInput(),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: _counting || _savingCount ? null : _start,
                              icon: const Icon(Icons.play_arrow_rounded),
                              label: const Text('Start count'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: _counting && !_savingCount ? _finish : null,
                              icon: const Icon(Icons.stop_circle_outlined),
                              label: const Text('Stop Count'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (_counting)
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _epcController,
                                focusNode: _scanFocusNode,
                                enabled: !_savingCount,
                                decoration: const InputDecoration(
                                  labelText: 'Scan EPC tags continuously',
                                  hintText: 'Keep scanning until you press Stop Count',
                                ),
                                onChanged: (value) => _maybeConsumeScanInput(
                                  value,
                                  expectedByEpc.keys.toSet(),
                                ),
                                onSubmitted: (_) =>
                                    _scan(expectedByEpc.keys.toSet()),
                              ),
                            ),
                            const SizedBox(width: 10),
                            ElevatedButton(
                              onPressed: _savingCount
                                  ? null
                                  : () =>
                                  _scan(expectedByEpc.keys.toSet()),
                              child: const Text('Capture'),
                            ),
                          ],
                        ),
                      if (_scanMessage != null) ...[
                        const SizedBox(height: 10),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppTheme.brand.withAlpha(12),
                            borderRadius: BorderRadius.circular(12),
                            border:
                                Border.all(color: AppTheme.brand.withAlpha(85)),
                          ),
                          child: Text(
                            _scanMessage!,
                            style: const TextStyle(
                              color: AppTheme.foreground,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _badge('Current Found', found, AppTheme.success),
                          _badge('Sold', soldCount, AppTheme.info),
                          _badge('Missing', missing, AppTheme.warning),
                          _badge('Expected', expectedCount, _expectedBlue),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Scanned books: ${_scanned.length}',
                        style: const TextStyle(
                          color: AppTheme.foreground,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                      if (scannedList.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Container(
                          width: double.infinity,
                          constraints: const BoxConstraints(maxHeight: 150),
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppTheme.cardHover,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppTheme.border),
                          ),
                          child: ListView.separated(
                            itemCount: scannedList.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 6),
                            itemBuilder: (context, index) {
                              final tag = scannedList[index];
                              return Text(
                                '${index + 1}. $tag',
                                style: const TextStyle(
                                  color: AppTheme.foreground,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _badge(String label, int value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color),
      ),
      child: Text(
        '$label: $value',
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}
