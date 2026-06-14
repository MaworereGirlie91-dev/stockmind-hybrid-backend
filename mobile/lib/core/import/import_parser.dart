import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:csv/csv.dart';
import 'package:excel2003/excel2003.dart';
import 'package:file_picker/file_picker.dart';
import 'package:spreadsheet_decoder/spreadsheet_decoder.dart';

class ImportBookRow {
  const ImportBookRow({
    required this.isbn,
    required this.product,
  });

  final String isbn;
  final String product;
}

class ImportParseException implements Exception {
  const ImportParseException(this.message);

  final String message;

  @override
  String toString() => message;
}

Future<List<ImportBookRow>> parseIsbnProductImportFile(
  PlatformFile file,
) async {
  final extension = _fileExtension(file).toLowerCase();
  final bytes = await _resolveFileBytes(file);

  if (bytes == null || bytes.isEmpty) {
    throw const ImportParseException('Unable to read selected file.');
  }

  final rows = switch (extension) {
    'csv' => _parseCsvRows(bytes),
    'xlsx' || 'xlsm' || 'ods' => _parseOpenXmlRows(bytes),
    'xls' => _parseXlsRows(bytes),
    _ => throw const ImportParseException(
        'Unsupported file type. Use CSV, XLS, XLSX, XLSM, or ODS.',
      ),
  };

  return _extractRows(rows);
}

Future<List<int>?> _resolveFileBytes(PlatformFile file) async {
  final inMemory = file.bytes;
  if (inMemory != null && inMemory.isNotEmpty) {
    return inMemory;
  }

  final stream = file.readStream;
  if (stream != null) {
    try {
      final output = BytesBuilder(copy: false);
      await for (final chunk in stream) {
        if (chunk.isNotEmpty) {
          output.add(chunk);
        }
      }
      final bytes = output.takeBytes();
      if (bytes.isNotEmpty) {
        return bytes;
      }
    } catch (_) {
      // Fall through to disk path resolution.
    }
  }

  final path = (file.path ?? '').trim();
  if (path.isEmpty) {
    return null;
  }

  try {
    final diskFile = File(path);
    if (!await diskFile.exists()) {
      return null;
    }
    return await diskFile.readAsBytes();
  } catch (_) {
    return null;
  }
}

String _fileExtension(PlatformFile file) {
  final fromExtension = (file.extension ?? '').trim();
  if (fromExtension.isNotEmpty) {
    return fromExtension;
  }

  final name = file.name.trim();
  final dot = name.lastIndexOf('.');
  if (dot < 0 || dot == name.length - 1) {
    return '';
  }
  return name.substring(dot + 1);
}

List<List<String>> _parseCsvRows(List<int> bytes) {
  final raw = utf8.decode(bytes, allowMalformed: true).replaceFirst(
        RegExp(r'^\uFEFF'),
        '',
      );
  final delimiter = _detectDelimiter(raw);
  final parsed = CsvToListConverter(
    shouldParseNumbers: false,
    eol: '\n',
    fieldDelimiter: delimiter,
  ).convert(raw);

  return parsed
      .map((row) => row.map((cell) => _cellToString(cell)).toList())
      .toList();
}

String _detectDelimiter(String rawCsv) {
  final firstLine = rawCsv
      .split(RegExp(r'\r?\n'))
      .map((line) => line.trim())
      .firstWhere(
        (line) => line.isNotEmpty,
        orElse: () => '',
      );
  if (firstLine.isEmpty) {
    return ',';
  }

  final candidates = <String>[',', ';', '\t', '|'];
  String best = ',';
  var bestCount = -1;

  for (final candidate in candidates) {
    final count = candidate == '\t'
        ? '\t'.allMatches(firstLine).length
        : candidate.allMatches(firstLine).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return bestCount > 0 ? best : ',';
}

List<List<String>> _parseOpenXmlRows(List<int> bytes) {
  final decoder = SpreadsheetDecoder.decodeBytes(bytes);
  if (decoder.tables.isEmpty) {
    throw const ImportParseException('Spreadsheet has no sheets to import.');
  }

  final firstSheet = decoder.tables.values.first;
  return firstSheet.rows
      .map((row) => row.map((cell) => _cellToString(cell)).toList())
      .toList();
}

List<List<String>> _parseXlsRows(List<int> bytes) {
  final reader = XlsReader.fromBytes(Uint8List.fromList(bytes));
  if (reader.sheetCount < 1) {
    throw const ImportParseException('Spreadsheet has no sheets to import.');
  }
  final sheet = reader.sheet(0);
  return sheet.rows
      .map((row) => row.map((cell) => _cellToString(cell)).toList())
      .toList();
}

List<ImportBookRow> _extractRows(List<List<String>> rows) {
  final nonEmptyRows = rows
      .where((row) => row.any((cell) => cell.trim().isNotEmpty))
      .toList(growable: false);
  if (nonEmptyRows.isEmpty) {
    throw const ImportParseException('Import file is empty.');
  }

  final header = nonEmptyRows.first;
  final headerIndexByName = <String, int>{};

  for (var index = 0; index < header.length; index += 1) {
    final normalized = _normalizeHeader(header[index]);
    if (normalized.isEmpty) {
      continue;
    }
    headerIndexByName[normalized] = index;
  }

  final isbnIndex = _resolveHeaderIndex(headerIndexByName, const {
    'isbn',
    'isbn10',
    'isbn13',
  });
  final productIndex = _resolveHeaderIndex(headerIndexByName, const {
    'product',
    'title',
    'booktitle',
    'bookname',
  });

  if (isbnIndex == null || productIndex == null) {
    throw const ImportParseException(
      'Missing required columns. Expected headers: ISBN and Product.',
    );
  }

  final output = <ImportBookRow>[];
  for (var i = 1; i < nonEmptyRows.length; i += 1) {
    final row = nonEmptyRows[i];
    final isbn = _valueAt(row, isbnIndex);
    final product = _valueAt(row, productIndex);

    if (isbn.isEmpty && product.isEmpty) {
      continue;
    }
    if (isbn.isEmpty || product.isEmpty) {
      throw ImportParseException(
        'Invalid row ${i + 1}. ISBN and Product are both required.',
      );
    }

    output.add(ImportBookRow(isbn: isbn, product: product));
  }

  if (output.isEmpty) {
    throw const ImportParseException(
      'No import rows found. Add at least one ISBN and Product row.',
    );
  }

  return output;
}

int? _resolveHeaderIndex(Map<String, int> map, Set<String> aliases) {
  for (final alias in aliases) {
    final value = map[alias];
    if (value != null) {
      return value;
    }
  }
  return null;
}

String _normalizeHeader(String input) {
  return input
      .replaceAll('\uFEFF', '')
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[\s_-]+'), '');
}

String _valueAt(List<String> row, int index) {
  if (index < 0 || index >= row.length) {
    return '';
  }
  return row[index].trim();
}

String _cellToString(Object? value) {
  if (value == null) {
    return '';
  }
  if (value is String) {
    return value.trim();
  }
  if (value is num) {
    if (value == value.roundToDouble()) {
      return value.toInt().toString();
    }
    return value.toString().trim();
  }
  return value.toString().trim();
}
