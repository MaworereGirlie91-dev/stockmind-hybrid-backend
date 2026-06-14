import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/import/import_parser.dart';
import '../../core/location/location_utils.dart';
import '../../services/app_state.dart';
import '../theme.dart';

enum _BulkEntryMode { copies, box }

class ScanAddTab extends StatefulWidget {
  const ScanAddTab({super.key, required this.appState});

  final AppState appState;

  @override
  State<ScanAddTab> createState() => _ScanAddTabState();
}

class _ScanAddTabState extends State<ScanAddTab> {
  static const _csvCacheKey = 'scan_add_csv_rows_v1';
  static const _scanRangeCacheKey = 'scan_add_scan_range_v1';
  static const _manualTitleValue = '__manual__';
  static const _customCategoryValue = '__custom__';
  static const _fixedCategories = <String>[
    'English',
    'Shona',
    'Science',
    'Maths',
    'ICT',
  ];

  bool _bulk = false;
  bool _submitting = false;
  bool _csvLoading = false;
  bool _booksLoading = true;
  String? _message;
  String? _csvError;
  String? _titleSelection = _manualTitleValue;
  String _categorySelection = _fixedCategories.first;
  double _scanRangeMeters = 5.0;
  _BulkEntryMode _bulkEntryMode = _BulkEntryMode.copies;
  List<_CsvBookRow> _csvRows = <_CsvBookRow>[];
  List<String> _isbnProductChoices = <String>[];
  List<_TitleOption> _savedTitleOptions = <_TitleOption>[];
  bool _bulkContinuousScanActive = false;
  final Set<String> _bulkDuplicateTags = <String>{};
  final Set<String> _existingInventoryEpcs = <String>{};
  int _bulkNoNewScanRounds = 0;
  bool _bulkAutoStopHandled = false;
  static const int _bulkNoNewScanRoundsBeforeStop = 2;
  String _locationTypeSelection = kLocationTypeShelf;

  final _epcController = TextEditingController();
  final _titleController = TextEditingController();
  final _isbnController = TextEditingController();
  final _categoryController =
      TextEditingController(text: _fixedCategories.first);
  final _locationController = TextEditingController();
  final _scanRangeController = TextEditingController(text: '5.0');
  final _boxQuantityController = TextEditingController(text: '1');

  final _bulkInputController = TextEditingController();
  final _bulkInputFocusNode = FocusNode();
  final List<String> _bulkTags = [];
  Timer? _bulkInputDebounce;
  Timer? _bulkFocusKeepAlive;
  Timer? _bulkRoundEvalTimer;
  bool _bulkSawNewTagsInCurrentRound = false;
  static const Duration _bulkRoundIdleWindow = Duration(milliseconds: 900);
  static const Duration _bulkMinContinuousScanDuration = Duration(seconds: 10);
  DateTime? _bulkContinuousScanStartedAt;

  @override
  void initState() {
    super.initState();
    _initData();
  }

  @override
  void dispose() {
    _epcController.dispose();
    _titleController.dispose();
    _isbnController.dispose();
    _categoryController.dispose();
    _locationController.dispose();
    _scanRangeController.dispose();
    _boxQuantityController.dispose();
    _bulkInputController.dispose();
    _bulkInputFocusNode.dispose();
    _bulkInputDebounce?.cancel();
    _bulkFocusKeepAlive?.cancel();
    _bulkRoundEvalTimer?.cancel();
    super.dispose();
  }

  Future<void> _initData() async {
    await _loadCsvCache();
    await _loadSavedTitles();
    await _loadScanRange();
  }

  Future<void> _loadSavedTitles() async {
    setState(() => _booksLoading = true);
    try {
      final inventory = await widget.appState.inventory();
      final boxes = await widget.appState.boxInventory();
      final byTitle = <String, Set<String>>{};
      final knownEpcs = <String>{};
      for (final row in inventory) {
        final title = row.title.trim();
        if (title.isEmpty) {
          continue;
        }
        byTitle.putIfAbsent(title, () => <String>{});
        final isbn = (row.isbn ?? '').trim();
        if (isbn.isNotEmpty) {
          byTitle[title]!.add(isbn);
        }
        final epc = row.epcTag.trim().toUpperCase();
        if (epc.isNotEmpty) {
          knownEpcs.add(epc);
        }
      }
      for (final row in boxes) {
        final title = row.title.trim();
        if (title.isEmpty) {
          continue;
        }
        byTitle.putIfAbsent(title, () => <String>{});
        final isbn = (row.isbn ?? '').trim();
        if (isbn.isNotEmpty) {
          byTitle[title]!.add(isbn);
        }
        final epc = row.epcTag.trim().toUpperCase();
        if (epc.isNotEmpty) {
          knownEpcs.add(epc);
        }
      }

      final options = byTitle.entries.map((entry) {
        final sorted = entry.value.toList()..sort();
        return _TitleOption(
          title: entry.key,
          isbn: sorted.length == 1 ? sorted.first : null,
          isbnChoices: sorted,
        );
      }).toList()
        ..sort(
            (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));

      setState(() {
        _savedTitleOptions = options;
        _existingInventoryEpcs
          ..clear()
          ..addAll(knownEpcs);
      });
    } catch (_) {
      // Keep UI usable even if local list fails.
    } finally {
      if (mounted) {
        setState(() => _booksLoading = false);
      }
    }
  }

  Future<void> _loadCsvCache() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_csvCacheKey);
    if (raw == null || raw.trim().isEmpty) {
      return;
    }

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) {
        return;
      }

      final rows = <_CsvBookRow>[];
      for (final item in decoded) {
        if (item is! Map<String, dynamic>) {
          continue;
        }
        final isbn = (item['isbn'] as String? ?? '').trim();
        final product = (item['product'] as String? ?? '').trim();
        if (isbn.isEmpty || product.isEmpty) {
          continue;
        }
        rows.add(_CsvBookRow(isbn: isbn, product: product));
      }
      setState(() {
        _csvRows = rows;
      });
    } catch (_) {
      // Ignore bad persisted data.
    }
  }

  Future<void> _saveCsvCache(List<_CsvBookRow> rows) async {
    final prefs = await SharedPreferences.getInstance();
    final payload = rows
        .map((row) => <String, dynamic>{
              'isbn': row.isbn,
              'product': row.product,
            })
        .toList();
    await prefs.setString(_csvCacheKey, jsonEncode(payload));
  }

  Future<void> _loadScanRange() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_scanRangeCacheKey)?.trim();
    if (raw == null || raw.isEmpty) {
      return;
    }

    final parsed = double.tryParse(raw);
    if (parsed == null || parsed < 0 || parsed > 50) {
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
        _scanRangeCacheKey, _scanRangeMeters.toStringAsFixed(1));
  }

  Map<String, List<String>> _isbnToProducts() {
    final map = <String, Set<String>>{};
    for (final row in _csvRows) {
      final key = _normalizeLookupKey(row.isbn);
      if (key.isEmpty) {
        continue;
      }
      map.putIfAbsent(key, () => <String>{});
      map[key]!.add(row.product.trim());
    }
    return {
      for (final entry in map.entries)
        entry.key: (entry.value.toList()..sort((a, b) => a.compareTo(b))),
    };
  }

  Map<String, List<String>> _productToIsbns() {
    final map = <String, Set<String>>{};
    for (final row in _csvRows) {
      final key = _normalizeLookupKey(row.product);
      if (key.isEmpty) {
        continue;
      }
      map.putIfAbsent(key, () => <String>{});
      map[key]!.add(row.isbn.trim());
    }
    return {
      for (final entry in map.entries)
        entry.key: (entry.value.toList()..sort((a, b) => a.compareTo(b))),
    };
  }

  String _resolvedTitle() {
    if ((_titleSelection ?? _manualTitleValue) == _manualTitleValue) {
      return _titleController.text.trim();
    }
    return (_titleSelection ?? '').trim();
  }

  String _resolvedCategory() {
    return _categoryController.text.trim();
  }

  ParsedLocation _resolvedLocation() {
    return parseLocation(
      locationType: _locationTypeSelection,
      locationName: _locationController.text.trim(),
      location: _locationController.text.trim(),
    );
  }

  String _normalizeLookupKey(String raw) {
    final lowered = raw.trim().toLowerCase();
    if (lowered.isEmpty) {
      return '';
    }
    if (RegExp(r'^-?\d+\.0+$').hasMatch(lowered)) {
      return lowered.split('.').first;
    }
    return lowered;
  }

  Future<void> _pickAndImportSpreadsheet() async {
    setState(() {
      _csvLoading = true;
      _csvError = null;
    });

    try {
      final picked = await FilePicker.platform.pickFiles(
        allowMultiple: false,
        type: FileType.any,
        withData: true,
        withReadStream: true,
      );

      if (picked == null || picked.files.isEmpty) {
        setState(() {
          _csvLoading = false;
        });
        return;
      }

      final file = picked.files.first;
      final importedRows = await parseIsbnProductImportFile(file);
      final imported = importedRows
          .map((row) => _CsvBookRow(isbn: row.isbn, product: row.product))
          .toList();

      await _saveCsvCache(imported);
      setState(() {
        _csvRows = imported;
        _csvLoading = false;
        _csvError = null;
        _message = 'Imported ${imported.length} rows from ${file.name}.';
      });
    } on ImportParseException catch (error) {
      setState(() {
        _csvLoading = false;
        _csvError = error.message;
      });
    } catch (error) {
      setState(() {
        _csvLoading = false;
        _csvError = 'Import failed: ${error.toString()}';
      });
    }
  }

  void _onTitleSelected(String? value) {
    final selection = value ?? _manualTitleValue;
    final productToIsbns = _productToIsbns();

    setState(() {
      _titleSelection = selection;
      _isbnProductChoices = <String>[];
    });

    if (selection == _manualTitleValue) {
      return;
    }

    final matchedSaved = _savedTitleOptions
        .where((option) => option.title == selection)
        .toList();
    if (matchedSaved.isNotEmpty) {
      final saved = matchedSaved.first;
      if ((saved.isbn ?? '').trim().isNotEmpty) {
        _isbnController.text = saved.isbn!.trim();
        return;
      }
      if (saved.isbnChoices.isNotEmpty) {
        _isbnController.text = saved.isbnChoices.first;
        return;
      }
    }

    final isbnMatches =
        productToIsbns[_normalizeLookupKey(selection)] ?? <String>[];
    if (isbnMatches.isNotEmpty) {
      _isbnController.text = isbnMatches.first;
    }
  }

  Future<void> _openTitleSearch() async {
    final titleEntries = _titleMenuEntries();
    if (!mounted) {
      return;
    }

    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        var query = '';
        return StatefulBuilder(
          builder: (context, setModalState) {
            final normalizedQuery = query.trim().toLowerCase();
            final filteredEntries = titleEntries.where((entry) {
              if (normalizedQuery.isEmpty) {
                return true;
              }
              final haystack =
                  '${entry.title} ${entry.supportingText}'.toLowerCase();
              return haystack.contains(normalizedQuery);
            }).toList();

            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  left: 12,
                  right: 12,
                  top: 12,
                  bottom: MediaQuery.of(context).viewInsets.bottom + 12,
                ),
                child: Container(
                  constraints: const BoxConstraints(maxHeight: 620),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Search book title',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(
                                    color: AppTheme.foreground,
                                    fontWeight: FontWeight.w700,
                                  ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Find a saved or imported title without scrolling the full list.',
                              style: TextStyle(
                                color: AppTheme.muted,
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              autofocus: true,
                              onChanged: (value) {
                                setModalState(() {
                                  query = value;
                                });
                              },
                              decoration: const InputDecoration(
                                labelText: 'Search title',
                                prefixIcon: Icon(Icons.search_rounded),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Divider(height: 1),
                      Expanded(
                        child: filteredEntries.isEmpty
                            ? const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(18),
                                  child: Text(
                                    'No matching titles found.',
                                    style: TextStyle(color: AppTheme.muted),
                                  ),
                                ),
                              )
                            : ListView.separated(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 8,
                                ),
                                itemCount: filteredEntries.length,
                                separatorBuilder: (_, __) =>
                                    const Divider(height: 1),
                                itemBuilder: (context, index) {
                                  final entry = filteredEntries[index];
                                  final isSelected = entry.value ==
                                      (_titleSelection ?? _manualTitleValue);
                                  return ListTile(
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    selected: isSelected,
                                    selectedTileColor:
                                        AppTheme.brand.withAlpha(10),
                                    title: Text(
                                      entry.title,
                                      style: TextStyle(
                                        color: entry.value == _manualTitleValue
                                            ? AppTheme.brandDark
                                            : AppTheme.foreground,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    subtitle: Text(
                                      entry.supportingText,
                                      style: const TextStyle(
                                        color: AppTheme.muted,
                                        fontSize: 12,
                                      ),
                                    ),
                                    trailing: isSelected
                                        ? const Icon(
                                            Icons.check_circle_rounded,
                                            color: AppTheme.brand,
                                          )
                                        : null,
                                    onTap: () => Navigator.of(sheetContext).pop(
                                      entry.value,
                                    ),
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    if (selected != null) {
      _onTitleSelected(selected);
    }
  }

  void _onIsbnChanged(String value) {
    final isbn = value.trim();
    final normalized = _normalizeLookupKey(isbn);
    final isbnToProducts = _isbnToProducts();
    final products = isbnToProducts[normalized] ?? <String>[];

    if (products.isEmpty) {
      final matched = _savedTitleOptions.firstWhere(
        (item) =>
            _normalizeLookupKey(item.isbn ?? '') == normalized ||
            item.isbnChoices.any(
              (isbnOption) => _normalizeLookupKey(isbnOption) == normalized,
            ),
        orElse: () =>
            const _TitleOption(title: '', isbn: null, isbnChoices: []),
      );
      if (matched.title.isNotEmpty) {
        setState(() {
          _titleSelection = matched.title;
          _isbnProductChoices = <String>[];
        });
      }
      return;
    }

    if (products.length == 1) {
      setState(() {
        _titleSelection = products.first;
        _isbnProductChoices = <String>[];
      });
      return;
    }

    setState(() {
      _isbnProductChoices = products;
      _titleSelection = products.first;
      _message =
          'Duplicate ISBN detected in CSV. Choose the correct Product for ISBN $isbn.';
    });
  }

  void _onCategoryQuickSelect(String? value) {
    if (value == null) {
      return;
    }
    setState(() {
      _categorySelection = value;
      if (value != _customCategoryValue) {
        _categoryController.text = value;
      }
    });
  }

  bool _applyScanRangeFromInput({bool showError = true}) {
    final raw = _scanRangeController.text.trim();
    final parsed = double.tryParse(raw);
    final validDecimal = RegExp(r'^\d{1,2}(\.\d)?$').hasMatch(raw);

    if (parsed == null || parsed < 0 || parsed > 50 || !validDecimal) {
      if (showError) {
        setState(() {
          _message =
              'Scan range must be a number between 0 and 50 with up to one decimal place (e.g. 1.5).';
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

  Future<void> _saveSingle() async {
    final title = _resolvedTitle();
    if (title.isEmpty) {
      setState(() {
        _message = 'Book title is required.';
      });
      return;
    }
    if (!_applyScanRangeFromInput()) {
      return;
    }

    setState(() {
      _submitting = true;
      _message = null;
    });

    try {
      final resolvedLocation = _resolvedLocation();
      await widget.appState.addSingleCopy(
        epcTag: _epcController.text,
        title: title,
        isbn: _isbnController.text.trim(),
        category: _resolvedCategory(),
        location: resolvedLocation.location,
        locationType: resolvedLocation.locationType,
        locationName: resolvedLocation.locationName,
      );

      _epcController.clear();
      _message = 'Single copy saved locally and queued for sync.';
      await _loadSavedTitles();
    } catch (error) {
      _message = error.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  Future<void> _saveBulk() async {
    final title = _resolvedTitle();
    if (title.isEmpty) {
      setState(() {
        _message = 'Book title is required.';
      });
      return;
    }
    if (!_applyScanRangeFromInput()) {
      return;
    }

    setState(() {
      _submitting = true;
      _message = null;
    });

    try {
      final resolvedLocation = _resolvedLocation();
      final duplicateTagsFromSession = <String>{..._bulkDuplicateTags};
      final result = await widget.appState.addBulkCopies(
        title: title,
        isbn: _isbnController.text.trim(),
        category: _resolvedCategory(),
        location: resolvedLocation.location,
        locationType: resolvedLocation.locationType,
        locationName: resolvedLocation.locationName,
        epcTags: List<String>.from(_bulkTags),
      );

      for (final added in result.addedTags) {
        _bulkTags.removeWhere((tag) => tag == added);
        _existingInventoryEpcs.add(added);
      }

      final allDuplicates = <String>{
        ...duplicateTagsFromSession,
        ...result.duplicateTags,
      };
      for (final duplicate in allDuplicates) {
        _bulkTags.removeWhere((tag) => tag == duplicate);
      }
      _bulkDuplicateTags
        ..clear()
        ..addAll(allDuplicates);

      final details = <String>[];
      details.add('valid new tags: ${result.addedCount}');
      details.add('duplicate tags: ${allDuplicates.length}');
      if (allDuplicates.isNotEmpty) {
        final sortedDuplicates = allDuplicates.toList()
          ..sort((a, b) => a.compareTo(b));
        details.add('duplicates skipped: ${sortedDuplicates.join(', ')}');
      }
      if (result.failed.isNotEmpty) {
        details.add('failed: ${result.failed.length}');
      }
      _message = 'Bulk add processed (${details.join(' | ')}).';
      _bulkContinuousScanActive = false;
      _bulkNoNewScanRounds = 0;
      _bulkAutoStopHandled = false;
      _bulkInputController.clear();

      if (result.addedCount > 0) {
        await _loadSavedTitles();
      }
    } catch (error) {
      _message = error.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  Future<void> _saveBoxTag() async {
    final title = _resolvedTitle();
    final quantity = int.tryParse(_boxQuantityController.text.trim()) ?? 0;
    if (title.isEmpty) {
      setState(() {
        _message = 'Book title is required.';
      });
      return;
    }
    if (quantity <= 0) {
      setState(() {
        _message =
            'Quantity of books in box must be a whole number greater than zero.';
      });
      return;
    }
    if (_epcController.text.trim().isEmpty) {
      setState(() {
        _message = 'Box EPC tag is required.';
      });
      return;
    }
    if (!_applyScanRangeFromInput()) {
      return;
    }

    setState(() {
      _submitting = true;
      _message = null;
    });

    try {
      final resolvedLocation = _resolvedLocation();
      await widget.appState.addBoxTag(
        epcTag: _epcController.text,
        title: title,
        quantity: quantity,
        isbn: _isbnController.text.trim(),
        category: _resolvedCategory(),
        location: resolvedLocation.location,
        locationType: resolvedLocation.locationType,
        locationName: resolvedLocation.locationName,
      );

      _epcController.clear();
      _boxQuantityController.text = '1';
      _message = 'Box tag saved locally and queued for sync.';
      await _loadSavedTitles();
    } catch (error) {
      _message = error.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  void _requestBulkInputFocus() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _bulkContinuousScanActive) {
        _bulkInputFocusNode.requestFocus();
      }
    });
  }

  void _startBulkFocusKeepAlive() {
    _bulkFocusKeepAlive?.cancel();
    _bulkFocusKeepAlive = Timer.periodic(const Duration(milliseconds: 700), (
      _,
    ) {
      if (!mounted || !_bulkContinuousScanActive) {
        return;
      }
      if (!_bulkInputFocusNode.hasFocus) {
        _bulkInputFocusNode.requestFocus();
      }
    });
  }

  void _consumeBulkInput({bool keepFocusAfterConsume = true}) {
    if (!_applyScanRangeFromInput(showError: false)) {
      return;
    }

    final input = _bulkInputController.text;
    final tags = input
        .split(RegExp(r'[\s,;]+'))
        .map((item) => item.trim().toUpperCase())
        .where((item) => item.isNotEmpty)
        .toList();
    if (tags.isEmpty) {
      return;
    }

    var added = 0;
    final duplicateHits = <String>[];
    setState(() {
      for (final tag in tags) {
        if (_bulkTags.contains(tag) ||
            _bulkDuplicateTags.contains(tag) ||
            _existingInventoryEpcs.contains(tag)) {
          _bulkDuplicateTags.add(tag);
          duplicateHits.add(tag);
          continue;
        }
        _bulkTags.insert(0, tag);
        added += 1;
      }
      _bulkInputController.clear();
      if (duplicateHits.isNotEmpty && added == 0) {
        _message = 'Duplicate EPC skipped: ${duplicateHits.join(', ')}';
      } else if (duplicateHits.isNotEmpty) {
        _message =
            '$added new tag(s) captured. Duplicates skipped: ${duplicateHits.join(', ')}';
      } else {
        _message = '$added tag(s) captured.';
      }

      if (_bulkContinuousScanActive) {
        if (added > 0) {
          _bulkSawNewTagsInCurrentRound = true;
          _bulkAutoStopHandled = false;
        }
      }
    });

    if (_bulkContinuousScanActive && keepFocusAfterConsume) {
      _scheduleBulkRoundEvaluation();
    }

    if (_bulkContinuousScanActive && keepFocusAfterConsume && mounted) {
      _requestBulkInputFocus();
    }
  }

  void _appendBulkTag() {
    _consumeBulkInput();
  }

  void _scheduleBulkRoundEvaluation() {
    _bulkRoundEvalTimer?.cancel();
    if (!_bulkContinuousScanActive) {
      return;
    }
    _bulkRoundEvalTimer = Timer(_bulkRoundIdleWindow, _evaluateBulkRound);
  }

  void _evaluateBulkRound() {
    if (!_bulkContinuousScanActive || !mounted) {
      return;
    }

    final uniqueTotal = <String>{..._bulkTags, ..._bulkDuplicateTags}.length;
    if (uniqueTotal == 0) {
      _scheduleBulkRoundEvaluation();
      return;
    }

    var shouldAutoStop = false;
    setState(() {
      if (_bulkSawNewTagsInCurrentRound) {
        _bulkSawNewTagsInCurrentRound = false;
        _bulkNoNewScanRounds = 0;
      } else {
        _bulkNoNewScanRounds += 1;
        if (_bulkNoNewScanRounds >= _bulkNoNewScanRoundsBeforeStop &&
            !_bulkAutoStopHandled) {
          final startedAt = _bulkContinuousScanStartedAt;
          final scanElapsed = startedAt == null
              ? _bulkMinContinuousScanDuration
              : DateTime.now().difference(startedAt);
          if (scanElapsed >= _bulkMinContinuousScanDuration) {
            _bulkAutoStopHandled = true;
            shouldAutoStop = true;
          }
        }
      }
    });

    if (shouldAutoStop) {
      unawaited(_autoStopBulkContinuousScan());
      return;
    }

    _scheduleBulkRoundEvaluation();
  }

  void _startBulkContinuousScan({bool autoStarted = false}) {
    if (!_applyScanRangeFromInput(showError: !autoStarted)) {
      return;
    }
    _bulkInputDebounce?.cancel();
    _bulkRoundEvalTimer?.cancel();
    setState(() {
      _bulkContinuousScanActive = true;
      _bulkNoNewScanRounds = 0;
      _bulkAutoStopHandled = false;
      _bulkSawNewTagsInCurrentRound = false;
      _bulkContinuousScanStartedAt = DateTime.now();
      _message = autoStarted
          ? 'Continuous scan started from trigger input. Keep scanning until auto-stop confirms no new EPC tags.'
          : 'Bulk continuous scan started. Pull the trigger once and scanning will auto-stop after repeated scans with no new EPC tags.';
    });
    _startBulkFocusKeepAlive();
    _requestBulkInputFocus();
    _scheduleBulkRoundEvaluation();
  }

  void _stopBulkContinuousScan({bool preserveMessage = true}) {
    _bulkInputDebounce?.cancel();
    _bulkRoundEvalTimer?.cancel();
    if (_bulkInputController.text.trim().isNotEmpty) {
      _consumeBulkInput(keepFocusAfterConsume: false);
    }
    _bulkFocusKeepAlive?.cancel();
    setState(() {
      _bulkContinuousScanActive = false;
      _bulkNoNewScanRounds = 0;
      _bulkSawNewTagsInCurrentRound = false;
      _bulkContinuousScanStartedAt = null;
      if (preserveMessage) {
        _message = 'Bulk continuous scan stopped.';
      }
    });
  }

  Future<void> _autoStopBulkContinuousScan() async {
    if (!_bulkContinuousScanActive) {
      return;
    }
    _stopBulkContinuousScan(preserveMessage: false);
    final uniqueTotal = <String>{..._bulkTags, ..._bulkDuplicateTags}.length;
    if (!mounted) {
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Scan Complete'),
        content: Text(
          'No new EPC tags were found in repeated scans. '
          'Total unique tags scanned: $uniqueTotal.',
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );

    if (!mounted) {
      return;
    }
    setState(() {
      _message =
          'Continuous scan auto-stopped. Unique tags scanned: $uniqueTotal.';
    });
  }

  void _maybeConsumeBulkScanInput(String value) {
    if (!_bulkContinuousScanActive &&
        _bulk &&
        _bulkEntryMode == _BulkEntryMode.copies &&
        value.trim().isNotEmpty) {
      _startBulkContinuousScan(autoStarted: true);
    }
    if (!_bulkContinuousScanActive) {
      return;
    }
    _bulkInputDebounce?.cancel();
    if (!RegExp(r'[\r\n,;\t ]').hasMatch(value)) {
      _bulkInputDebounce = Timer(const Duration(milliseconds: 180), () {
        if (mounted &&
            _bulkContinuousScanActive &&
            _bulkInputController.text.trim().isNotEmpty) {
          _consumeBulkInput();
        }
      });
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _bulkContinuousScanActive) {
        _consumeBulkInput();
      }
    });
  }

  List<_TitleMenuEntry> _titleMenuEntries() {
    final byTitle = <String, Set<String>>{};

    for (final item in _savedTitleOptions) {
      final title = item.title.trim();
      if (title.isEmpty) {
        continue;
      }
      byTitle.putIfAbsent(title, () => <String>{});
      if ((item.isbn ?? '').trim().isNotEmpty) {
        byTitle[title]!.add(item.isbn!.trim());
      }
      for (final isbn in item.isbnChoices) {
        final normalized = isbn.trim();
        if (normalized.isNotEmpty) {
          byTitle[title]!.add(normalized);
        }
      }
    }

    for (final row in _csvRows) {
      final title = row.product.trim();
      final isbn = row.isbn.trim();
      if (title.isEmpty) {
        continue;
      }
      byTitle.putIfAbsent(title, () => <String>{});
      if (isbn.isNotEmpty) {
        byTitle[title]!.add(isbn);
      }
    }

    final titles = byTitle.keys.toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

    return <_TitleMenuEntry>[
      const _TitleMenuEntry(
        value: _manualTitleValue,
        title: 'Manual entry (new title)',
        selectedLabel: 'Manual entry (new title)',
        supportingText: 'Type a new title below',
      ),
      ...titles.map((title) {
        final isbns = (byTitle[title]!.toList()
          ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase())));
        final supportingText = isbns.isEmpty
            ? 'Saved title'
            : isbns.length == 1
                ? 'ISBN ${isbns.first}'
                : '${isbns.length} ISBN entries';
        return _TitleMenuEntry(
          value: title,
          title: title,
          selectedLabel: title,
          supportingText: supportingText,
        );
      }),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final titleEntries = _titleMenuEntries();
    final selectedTitleValue = titleEntries.any(
      (entry) => entry.value == (_titleSelection ?? _manualTitleValue),
    )
        ? (_titleSelection ?? _manualTitleValue)
        : _manualTitleValue;
    final titleIsManual = selectedTitleValue == _manualTitleValue;
    final isSingleReady =
        _epcController.text.trim().isNotEmpty && _resolvedTitle().isNotEmpty;
    final isBulkReady = _resolvedTitle().isNotEmpty && _bulkTags.isNotEmpty;
    final boxQuantity = int.tryParse(_boxQuantityController.text.trim()) ?? 0;
    final isBoxReady = _resolvedTitle().isNotEmpty &&
        boxQuantity > 0 &&
        _epcController.text.trim().isNotEmpty;

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
                  'RFID Scan/Add',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppTheme.foreground,
                      ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Use scan/add with CSV-assisted ISBN-Product lookup. All writes commit locally first.',
                  style: TextStyle(color: AppTheme.muted),
                ),
                const SizedBox(height: 12),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment<bool>(
                      value: false,
                      icon: Icon(Icons.qr_code_2_rounded),
                      label: Text('Single Add'),
                    ),
                    ButtonSegment<bool>(
                      value: true,
                      icon: Icon(Icons.layers_outlined),
                      label: Text('Bulk Add'),
                    ),
                  ],
                  selected: {_bulk},
                  onSelectionChanged: (value) {
                    final nextBulk = value.first;
                    if (!nextBulk && _bulkContinuousScanActive) {
                      _stopBulkContinuousScan(preserveMessage: false);
                    }
                    setState(() {
                      _bulk = nextBulk;
                    });
                  },
                ),
                if (_bulk) ...[
                  const SizedBox(height: 12),
                  SegmentedButton<_BulkEntryMode>(
                    segments: const [
                      ButtonSegment<_BulkEntryMode>(
                        value: _BulkEntryMode.copies,
                        icon: Icon(Icons.layers_outlined),
                        label: Text('Bulk Singles'),
                      ),
                      ButtonSegment<_BulkEntryMode>(
                        value: _BulkEntryMode.box,
                        icon: Icon(Icons.inventory_2_outlined),
                        label: Text('Tag Box'),
                      ),
                    ],
                    selected: {_bulkEntryMode},
                    onSelectionChanged: (value) {
                      final nextMode = value.first;
                      if (nextMode != _BulkEntryMode.copies &&
                          _bulkContinuousScanActive) {
                        _stopBulkContinuousScan(preserveMessage: false);
                      }
                      setState(() {
                        _bulkEntryMode = nextMode;
                      });
                    },
                  ),
                ],
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ElevatedButton.icon(
                      onPressed: _csvLoading ? null : _pickAndImportSpreadsheet,
                      icon: _csvLoading
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.upload_file_rounded),
                      label: const Text(
                        'Upload CSV/XLS/XLSX/XLSM/ODS (ISBN, Product)',
                      ),
                    ),
                    Text(
                      _csvRows.isEmpty
                          ? 'No import file loaded'
                          : '${_csvRows.length} import rows loaded',
                      style: const TextStyle(
                        color: AppTheme.muted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
                if (_csvError != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppTheme.danger.withAlpha(12),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppTheme.danger.withAlpha(90)),
                    ),
                    child: Text(
                      _csvError!,
                      style: const TextStyle(color: AppTheme.danger),
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.cardHover,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 30,
                            height: 30,
                            decoration: BoxDecoration(
                              color: AppTheme.brandTint,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(
                              Icons.menu_book_rounded,
                              color: AppTheme.brandDark,
                              size: 18,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _booksLoading
                                      ? 'Book Title (loading...)'
                                      : 'Book Title',
                                  style: const TextStyle(
                                    color: AppTheme.foreground,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                const Text(
                                  'Select a saved title. The ISBN fills automatically in the ISBN field.',
                                  style: TextStyle(
                                    color: AppTheme.muted,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton.icon(
                            onPressed: _booksLoading ? null : _openTitleSearch,
                            icon: const Icon(Icons.search_rounded),
                            label: const Text('Search'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      DropdownButtonFormField<String>(
                        initialValue: selectedTitleValue,
                        isExpanded: true,
                        menuMaxHeight: 360,
                        decoration: const InputDecoration(
                          labelText: 'Choose title',
                          prefixIcon: Icon(
                            Icons.library_books_outlined,
                            color: AppTheme.brand,
                          ),
                        ),
                        selectedItemBuilder: (context) {
                          return titleEntries
                              .map(
                                (entry) => Align(
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    entry.selectedLabel,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: AppTheme.foreground,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              )
                              .toList();
                        },
                        items: titleEntries
                            .map(
                              (entry) => DropdownMenuItem<String>(
                                value: entry.value,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      entry.title,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        color: entry.value == _manualTitleValue
                                            ? AppTheme.brandDark
                                            : AppTheme.foreground,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      entry.supportingText,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        color: AppTheme.muted,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: _onTitleSelected,
                      ),
                    ],
                  ),
                ),
                if (titleIsManual) ...[
                  const SizedBox(height: 10),
                  TextField(
                    controller: _titleController,
                    decoration: const InputDecoration(
                      labelText: 'Manual Book Title *',
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ],
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _isbnController,
                        decoration: const InputDecoration(labelText: 'ISBN'),
                        onChanged: (value) {
                          _onIsbnChanged(value);
                          setState(() {});
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _categorySelection,
                        decoration: const InputDecoration(
                            labelText: 'Category (quick select)'),
                        items: const [
                          DropdownMenuItem<String>(
                            value: 'English',
                            child: Text('English'),
                          ),
                          DropdownMenuItem<String>(
                            value: 'Shona',
                            child: Text('Shona'),
                          ),
                          DropdownMenuItem<String>(
                            value: 'Science',
                            child: Text('Science'),
                          ),
                          DropdownMenuItem<String>(
                            value: 'Maths',
                            child: Text('Maths'),
                          ),
                          DropdownMenuItem<String>(
                            value: 'ICT',
                            child: Text('ICT'),
                          ),
                          DropdownMenuItem<String>(
                            value: _customCategoryValue,
                            child: Text('Type manually'),
                          ),
                        ],
                        onChanged: _onCategoryQuickSelect,
                      ),
                    ),
                  ],
                ),
                if (_isbnProductChoices.length > 1) ...[
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: _titleSelection,
                    decoration: const InputDecoration(
                      labelText: 'Duplicate ISBN matches - select Product',
                    ),
                    items: _isbnProductChoices
                        .map(
                          (product) => DropdownMenuItem<String>(
                            value: product,
                            child: Text(product),
                          ),
                        )
                        .toList(),
                    onChanged: _onTitleSelected,
                  ),
                ],
                const SizedBox(height: 10),
                TextField(
                  controller: _categoryController,
                  decoration: const InputDecoration(
                    labelText: 'Category (manual typing allowed)',
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: _locationTypeSelection,
                  decoration: const InputDecoration(
                    labelText: 'Location Type',
                  ),
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
                    setState(() {
                      _locationTypeSelection = value;
                    });
                  },
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _locationController,
                  decoration: InputDecoration(
                    labelText: 'Location Name',
                    hintText: _locationTypeSelection == kLocationTypeWarehouse
                        ? 'e.g. Main Warehouse'
                        : _locationTypeSelection == kLocationTypeStockRoom
                            ? 'e.g. Room A'
                            : 'e.g. Shelf B2',
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.brand.withAlpha(10),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.brand.withAlpha(70)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Reader Scan Range (0 to 50 meters)',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              color: AppTheme.brandDark,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Range only applies when a supported RFID reader feeds tags into the app. A phone alone cannot detect room tags by distance.',
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
                        keyboardType: const TextInputType.numberWithOptions(
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
                const SizedBox(height: 14),
                if (!_bulk)
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final isCompact = constraints.maxWidth < 430;

                      final epcField = TextField(
                        controller: _epcController,
                        decoration: const InputDecoration(
                          labelText: 'EPC Tag *',
                          hintText: 'Scan or type EPC tag',
                        ),
                        onChanged: (_) => setState(() {}),
                      );

                      final scanButton = ElevatedButton.icon(
                        onPressed: () {
                          _epcController.text =
                              _epcController.text.trim().toUpperCase();
                          setState(() {});
                        },
                        icon: const Icon(Icons.qr_code_scanner_rounded),
                        label: const Text('Scan'),
                      );

                      if (!isCompact) {
                        return Row(
                          children: [
                            Expanded(child: epcField),
                            const SizedBox(width: 10),
                            scanButton,
                          ],
                        );
                      }

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          epcField,
                          const SizedBox(height: 8),
                          scanButton,
                        ],
                      );
                    },
                  ),
                if (!_bulk && _epcController.text.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppTheme.brand.withAlpha(10),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.brand.withAlpha(80)),
                    ),
                    child: Text(
                      'Scan progress: 1 book | EPC: ${_epcController.text.trim().toUpperCase()}',
                      style: const TextStyle(
                        color: AppTheme.foreground,
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
                if (_bulk && _bulkEntryMode == _BulkEntryMode.copies)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ElevatedButton.icon(
                            onPressed: _bulkContinuousScanActive
                                ? null
                                : _startBulkContinuousScan,
                            icon: const Icon(Icons.play_arrow_rounded),
                            label: const Text('Start Continuous Scan'),
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
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final isCompact = constraints.maxWidth < 430;

                          if (!isCompact) {
                            return Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: _bulkInputController,
                                    focusNode: _bulkInputFocusNode,
                                    decoration: const InputDecoration(
                                      labelText: 'EPC Tag',
                                      hintText:
                                          'Pull trigger once, keep scanning until auto-stop confirms no new EPC tags',
                                    ),
                                    onChanged: _maybeConsumeBulkScanInput,
                                    onSubmitted: (_) => _appendBulkTag(),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                ElevatedButton.icon(
                                  onPressed: _bulkContinuousScanActive
                                      ? null
                                      : _appendBulkTag,
                                  icon:
                                      const Icon(Icons.qr_code_scanner_rounded),
                                  label: const Text('Scan'),
                                ),
                                const SizedBox(width: 8),
                                ElevatedButton(
                                  onPressed: _bulkContinuousScanActive
                                      ? null
                                      : _appendBulkTag,
                                  child: const Text('Add EPC'),
                                ),
                              ],
                            );
                          }

                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              TextField(
                                controller: _bulkInputController,
                                focusNode: _bulkInputFocusNode,
                                decoration: const InputDecoration(
                                  labelText: 'EPC Tag',
                                  hintText:
                                      'Pull trigger once, keep scanning until auto-stop confirms no new EPC tags',
                                ),
                                onChanged: _maybeConsumeBulkScanInput,
                                onSubmitted: (_) => _appendBulkTag(),
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  ElevatedButton.icon(
                                    onPressed: _bulkContinuousScanActive
                                        ? null
                                        : _appendBulkTag,
                                    icon: const Icon(
                                        Icons.qr_code_scanner_rounded),
                                    label: const Text('Scan'),
                                  ),
                                  ElevatedButton(
                                    onPressed: _bulkContinuousScanActive
                                        ? null
                                        : _appendBulkTag,
                                    child: const Text('Add EPC'),
                                  ),
                                ],
                              ),
                            ],
                          );
                        },
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Scan progress: valid ${_bulkTags.length} | duplicates ${_bulkDuplicateTags.length}',
                        style: const TextStyle(
                          color: AppTheme.foreground,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _bulkContinuousScanActive
                            ? 'Continuous scan is active. The app keeps collecting unique tags and auto-stops after repeated rounds with no new EPCs.'
                            : 'Continuous scan is stopped.',
                        style: const TextStyle(
                          color: AppTheme.muted,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (_bulkTags.isNotEmpty)
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _bulkTags
                              .map(
                                (tag) => Chip(
                                  label: Text(tag),
                                  deleteIcon: const Icon(Icons.close, size: 16),
                                  onDeleted: () {
                                    setState(() {
                                      _bulkTags.remove(tag);
                                    });
                                  },
                                ),
                              )
                              .toList(),
                        ),
                      if (_bulkDuplicateTags.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppTheme.danger.withAlpha(12),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                                color: AppTheme.danger.withAlpha(90)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Duplicate EPC tags skipped',
                                style: TextStyle(
                                  color: AppTheme.danger,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: (_bulkDuplicateTags.toList()
                                      ..sort((a, b) => a.compareTo(b)))
                                    .map(
                                      (tag) => Chip(
                                        label: Text(
                                          tag,
                                          style: const TextStyle(
                                            color: AppTheme.danger,
                                          ),
                                        ),
                                        side: BorderSide(
                                          color: AppTheme.danger.withAlpha(120),
                                        ),
                                        backgroundColor:
                                            AppTheme.danger.withAlpha(8),
                                      ),
                                    )
                                    .toList(),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                if (_bulk && _bulkEntryMode == _BulkEntryMode.box)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextField(
                        controller: _boxQuantityController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Quantity of books in box *',
                          hintText: 'Enter number of books in this tagged box',
                        ),
                      ),
                      const SizedBox(height: 10),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final isCompact = constraints.maxWidth < 430;

                          final epcField = TextField(
                            controller: _epcController,
                            decoration: const InputDecoration(
                              labelText: 'Box EPC Tag *',
                              hintText: 'Scan or type the box EPC tag',
                            ),
                            onChanged: (_) => setState(() {}),
                          );

                          final scanButton = ElevatedButton.icon(
                            onPressed: () {
                              _epcController.text =
                                  _epcController.text.trim().toUpperCase();
                              setState(() {});
                            },
                            icon: const Icon(Icons.qr_code_scanner_rounded),
                            label: const Text('Scan'),
                          );

                          if (!isCompact) {
                            return Row(
                              children: [
                                Expanded(child: epcField),
                                const SizedBox(width: 10),
                                scanButton,
                              ],
                            );
                          }

                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              epcField,
                              const SizedBox(height: 8),
                              scanButton,
                            ],
                          );
                        },
                      ),
                    ],
                  ),
                const SizedBox(height: 14),
                if (_message != null)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: _message!.toLowerCase().contains('failed') ||
                              _message!.toLowerCase().contains('error')
                          ? AppTheme.danger.withAlpha(20)
                          : AppTheme.brand.withAlpha(20),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _message!.toLowerCase().contains('failed') ||
                                _message!.toLowerCase().contains('error')
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
                    onPressed: _submitting
                        ? null
                        : _bulk
                            ? (_bulkEntryMode == _BulkEntryMode.box
                                ? (isBoxReady ? _saveBoxTag : null)
                                : (isBulkReady ? _saveBulk : null))
                            : (isSingleReady ? _saveSingle : null),
                    icon: _submitting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            _bulk
                                ? (_bulkEntryMode == _BulkEntryMode.box
                                    ? Icons.inventory_2_outlined
                                    : Icons.layers_outlined)
                                : Icons.qr_code_scanner_rounded,
                          ),
                    label: Text(
                      _bulk
                          ? (_bulkEntryMode == _BulkEntryMode.box
                              ? 'Save Box Tag'
                              : 'Save Bulk Singles')
                          : 'Save Single Copy',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _CsvBookRow {
  const _CsvBookRow({
    required this.isbn,
    required this.product,
  });

  final String isbn;
  final String product;
}

class _TitleOption {
  const _TitleOption({
    required this.title,
    required this.isbn,
    required this.isbnChoices,
  });

  final String title;
  final String? isbn;
  final List<String> isbnChoices;
}

class _TitleMenuEntry {
  const _TitleMenuEntry({
    required this.value,
    required this.title,
    required this.selectedLabel,
    required this.supportingText,
  });

  final String value;
  final String title;
  final String selectedLabel;
  final String supportingText;
}
