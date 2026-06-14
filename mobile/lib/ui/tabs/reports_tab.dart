import 'dart:convert';
import 'dart:io';

import 'package:csv/csv.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/location/location_utils.dart';
import '../../data/models/sync_models.dart';
import '../../services/app_state.dart';
import '../theme.dart';

class ReportsTab extends StatefulWidget {
  const ReportsTab({super.key, required this.appState});

  final AppState appState;

  @override
  State<ReportsTab> createState() => _ReportsTabState();
}

class _ReportsTabState extends State<ReportsTab> {
  static const MethodChannel _filesChannel = MethodChannel('stockmind/files');

  late Future<Map<String, num>> _summaryFuture;
  late Future<List<LocationSummaryRow>> _locationSummaryFuture;
  late Future<List<SaleLocal>> _salesFuture;
  bool _exporting = false;
  String? _exportMessage;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _summaryFuture = widget.appState.summary();
    _locationSummaryFuture = widget.appState.locationSummary();
    _salesFuture = widget.appState.sales(limit: 150);
  }

  String _formatDateTime(String isoDate) {
    try {
      return DateFormat('dd MMM yyyy HH:mm:ss')
          .format(DateTime.parse(isoDate).toLocal());
    } catch (_) {
      return isoDate;
    }
  }

  String _safeCell(String? value) => (value ?? '').trim();

  Future<void> _writeCsv({
    required String prefix,
    required List<List<dynamic>> rows,
  }) async {
    setState(() {
      _exporting = true;
      _exportMessage = null;
    });

    try {
      final csv = const ListToCsvConverter().convert(rows);
      final stamp = DateFormat('yyyyMMdd_HHmmss').format(DateTime.now());
      final fileName = '$prefix-$stamp.csv';
      String savedAt;

      if (Platform.isAndroid) {
        final location = await _filesChannel.invokeMethod<String>(
          'saveCsvToDownloads',
          <String, dynamic>{
            'filename': fileName,
            'content': csv,
          },
        );
        savedAt = location ?? 'Downloads/$fileName';
      } else {
        final dir = await getApplicationDocumentsDirectory();
        final file = File('${dir.path}/$fileName');
        await file.writeAsBytes(utf8.encode(csv), flush: true);
        savedAt = file.path;
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _exportMessage = 'CSV downloaded: $savedAt';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _exportMessage = 'CSV export failed: ${error.toString()}';
      });
    } finally {
      if (mounted) {
        setState(() {
          _exporting = false;
        });
      }
    }
  }

  Future<void> _exportSalesCsv() async {
    final sales = await widget.appState.sales(limit: 5000);
    final rows = <List<dynamic>>[
      const <dynamic>[
        'Date & Time',
        'Title',
        'ISBN',
        'Category',
        'Location',
        'EPC Tag',
        'Notes',
      ],
      ...sales.map(
        (sale) => <dynamic>[
          _formatDateTime(sale.soldAt),
          sale.title,
          _safeCell(sale.isbn),
          _safeCell(sale.category),
          _safeCell(sale.location),
          sale.epcTag,
          _safeCell(sale.notes),
        ],
      ),
    ];

    await _writeCsv(prefix: 'stockmind-sales', rows: rows);
  }

  Future<void> _exportInventoryCsv() async {
    final inventory = await widget.appState.inventory();
    final boxes = await widget.appState.boxInventory();
    final rows = <List<dynamic>>[
      const <dynamic>[
        'EPC Tag',
        'Title',
        'ISBN',
        'Category',
        'Location',
        'Type',
        'Status',
        'Date Added',
      ],
      ...inventory.map(
        (item) => <dynamic>[
          item.epcTag,
          item.title,
          _safeCell(item.isbn),
          _safeCell(item.category),
          _safeCell(item.location),
          'Shelved',
          item.status,
          _formatDateTime(item.dateAdded),
        ],
      ),
      ...boxes.map(
        (item) => <dynamic>[
          item.epcTag,
          item.title,
          _safeCell(item.isbn),
          _safeCell(item.category),
          _safeCell(item.location),
          'Boxed',
          'in_stock',
          _formatDateTime(item.dateAdded),
        ],
      ),
    ];

    await _writeCsv(prefix: 'stockmind-inventory', rows: rows);
  }

  Future<void> _exportFullReportCsv() async {
    final sales = await widget.appState.sales(limit: 5000);
    final inventory = await widget.appState.inventory();
    final boxes = await widget.appState.boxInventory();

    final rows = <List<dynamic>>[
      const <dynamic>[
        'Record Type',
        'Date & Time',
        'Title',
        'ISBN',
        'Category',
        'Location',
        'EPC Tag',
        'Status',
        'Notes',
      ],
      ...sales.map(
        (sale) => <dynamic>[
          'sale',
          _formatDateTime(sale.soldAt),
          sale.title,
          _safeCell(sale.isbn),
          _safeCell(sale.category),
          _safeCell(sale.location),
          sale.epcTag,
          'sold',
          _safeCell(sale.notes),
        ],
      ),
      ...inventory.map(
        (item) => <dynamic>[
          'inventory',
          _formatDateTime(item.dateAdded),
          item.title,
          _safeCell(item.isbn),
          _safeCell(item.category),
          _safeCell(item.location),
          item.epcTag,
          item.status,
          '',
        ],
      ),
      ...boxes.map(
        (item) => <dynamic>[
          'inventory_box',
          _formatDateTime(item.dateAdded),
          item.title,
          _safeCell(item.isbn),
          _safeCell(item.category),
          _safeCell(item.location),
          item.epcTag,
          'boxed_qty_${item.quantity}',
          '',
        ],
      ),
    ];

    await _writeCsv(prefix: 'stockmind-full-report', rows: rows);
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppTheme.brand,
      onRefresh: () async {
        await widget.appState.syncNow();
        setState(_reload);
      },
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          FutureBuilder<Map<String, num>>(
            future: _summaryFuture,
            builder: (context, snapshot) {
              final summary = snapshot.data ?? const <String, num>{};

              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Reports',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: AppTheme.foreground,
                            ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Mobile summary from local cache (works offline).',
                        style: TextStyle(color: AppTheme.muted),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          _metric('Total Books',
                              '${summary['total_books'] ?? 0}', AppTheme.info),
                          _metric('Total Boxes',
                              '${summary['total_boxes'] ?? 0}', AppTheme.success),
                          _metric('Books In Boxes',
                              '${summary['books_in_boxes'] ?? 0}', AppTheme.brandDark),
                          _metric('Books Outside Boxes',
                              '${summary['books_outside_boxes'] ?? 0}', AppTheme.warning),
                          _metric('Total Sales',
                              '${summary['total_sales'] ?? 0}', AppTheme.brand),
                          _metric('Total Books Lost',
                              '${summary['total_books_lost'] ?? 0}', AppTheme.danger),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ElevatedButton.icon(
                            onPressed: _exporting ? null : _exportSalesCsv,
                            icon: const Icon(Icons.download_rounded),
                            label: const Text('Sales CSV'),
                          ),
                          ElevatedButton.icon(
                            onPressed: _exporting ? null : _exportInventoryCsv,
                            icon: const Icon(Icons.download_rounded),
                            label: const Text('Inventory CSV'),
                          ),
                          ElevatedButton.icon(
                            onPressed: _exporting ? null : _exportFullReportCsv,
                            icon: const Icon(Icons.summarize_rounded),
                            label: const Text('Full Report CSV'),
                          ),
                        ],
                      ),
                      if (_exportMessage != null) ...[
                        const SizedBox(height: 10),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color:
                                _exportMessage!.toLowerCase().contains('failed')
                                    ? AppTheme.danger.withAlpha(12)
                                    : AppTheme.brand.withAlpha(12),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: _exportMessage!
                                      .toLowerCase()
                                      .contains('failed')
                                  ? AppTheme.danger.withAlpha(90)
                                  : AppTheme.brand.withAlpha(90),
                            ),
                          ),
                          child: Text(
                            _exportMessage!,
                            style: const TextStyle(color: AppTheme.foreground),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          FutureBuilder<List<LocationSummaryRow>>(
            future: _locationSummaryFuture,
            builder: (context, snapshot) {
              final locations = snapshot.data ?? const <LocationSummaryRow>[];
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Location Summary',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: AppTheme.foreground,
                            ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Total books by structured location (includes books inside tagged boxes).',
                        style: TextStyle(color: AppTheme.muted, fontSize: 12),
                      ),
                      const SizedBox(height: 10),
                      if (locations.isEmpty)
                        const Text(
                          'No location assignments yet.',
                          style: TextStyle(color: AppTheme.muted),
                        )
                      else
                        ...locations.map(
                          (item) => Container(
                            width: double.infinity,
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppTheme.cardHover,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppTheme.border),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    '${locationTypeLabel(item.locationType)} - ${item.locationName}',
                                    style: const TextStyle(
                                      color: AppTheme.foreground,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                Text(
                                  '${item.totalBooks} books',
                                  style: const TextStyle(
                                    color: AppTheme.brandDark,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          FutureBuilder<List<SaleLocal>>(
            future: _salesFuture,
            builder: (context, snapshot) {
              final sales = snapshot.data ?? const <SaleLocal>[];

              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Reports Table',
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.foreground,
                                ),
                      ),
                      const SizedBox(height: 10),
                      if (sales.isEmpty)
                        const Text('No sales yet.')
                      else
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: DataTable(
                            headingTextStyle: const TextStyle(
                              color: AppTheme.foreground,
                              fontWeight: FontWeight.w700,
                            ),
                            columns: const [
                              DataColumn(label: Text('Date & Time')),
                              DataColumn(label: Text('Title')),
                              DataColumn(label: Text('ISBN')),
                              DataColumn(label: Text('Category')),
                              DataColumn(label: Text('Action')),
                            ],
                            rows: sales
                                .take(50)
                                .map(
                                  (sale) => DataRow(
                                    cells: [
                                      DataCell(
                                        Text(
                                          _formatDateTime(sale.soldAt),
                                          style: const TextStyle(
                                            color: AppTheme.muted,
                                          ),
                                        ),
                                      ),
                                      DataCell(
                                        SizedBox(
                                          width: 180,
                                          child: Text(
                                            sale.title,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              color: AppTheme.foreground,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ),
                                      ),
                                      DataCell(
                                        Text(
                                          _safeCell(sale.isbn).isEmpty
                                              ? '-'
                                              : _safeCell(sale.isbn),
                                          style: const TextStyle(
                                            color: AppTheme.muted,
                                          ),
                                        ),
                                      ),
                                      DataCell(
                                        Text(
                                          _safeCell(sale.category).isEmpty
                                              ? '-'
                                              : _safeCell(sale.category),
                                          style: const TextStyle(
                                            color: AppTheme.muted,
                                          ),
                                        ),
                                      ),
                                      DataCell(
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 5,
                                          ),
                                          decoration: BoxDecoration(
                                            color: AppTheme.brand,
                                            borderRadius:
                                                BorderRadius.circular(999),
                                          ),
                                          child: const Text(
                                            'Sold',
                                            style: TextStyle(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w700,
                                              fontSize: 11,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                )
                                .toList(),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _metric(String label, String value, Color color) {
    return Container(
      width: 145,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 12, color: Colors.white),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}
