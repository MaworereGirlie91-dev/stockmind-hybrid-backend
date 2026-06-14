import { CsvImportRow, CsvTitleCandidate } from '@/types';

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = i + 1 < line.length ? line[i + 1] : '';

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

function mapCandidate(indexByHeader: Map<string, number>, values: string[]): CsvTitleCandidate | null {
  const read = (...aliases: string[]): string => {
    for (const alias of aliases) {
      const idx = indexByHeader.get(alias);
      if (idx !== undefined && idx < values.length) {
        return values[idx]?.trim() ?? '';
      }
    }
    return '';
  };

  const title = read('title', 'book_title', 'title_name', 'name', 'product');
  if (!title) {
    return null;
  }

  return {
    title,
    isbn: read('isbn', 'isbn_13', 'isbn_10'),
    category: read('category', 'book_category', 'genre'),
    author: read('author', 'author_name'),
    publisher: read('publisher', 'publisher_name'),
    edition: read('edition', 'book_edition'),
    list_price: read('list_price', 'price', 'unit_price'),
    location: read('location', 'shelf', 'shelf_location'),
  };
}

function mapImportRow(indexByHeader: Map<string, number>, values: string[]): CsvImportRow | null {
  const read = (...aliases: string[]): string => {
    for (const alias of aliases) {
      const idx = indexByHeader.get(alias);
      if (idx !== undefined && idx < values.length) {
        return values[idx]?.trim() ?? '';
      }
    }
    return '';
  };

  const epc_tag = read('epc_tag', 'epc', 'tag', 'rfid', 'rfid_tag', 'tag_id');
  const title = read('title', 'book_title', 'title_name', 'name', 'product');

  if (!epc_tag && !title) return null;

  return {
    epc_tag,
    title,
    isbn: read('isbn', 'isbn_13', 'isbn_10'),
    category: read('category', 'book_category', 'genre'),
    author: read('author', 'author_name'),
    publisher: read('publisher', 'publisher_name'),
    edition: read('edition', 'book_edition'),
    list_price: read('list_price', 'price', 'unit_price'),
    quantity: read('quantity', 'qty', 'count'),
    location: read('location', 'shelf', 'shelf_location'),
  };
}

function parseTabularCandidates(rows: string[][]): CsvTitleCandidate[] {
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];
  const indexByHeader = new Map<string, number>();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized) {
      indexByHeader.set(normalized, index);
    }
  });

  const candidates: CsvTitleCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i += 1) {
    const values = rows[i];
    const candidate = mapCandidate(indexByHeader, values);
    if (!candidate) {
      continue;
    }

    const key = `${candidate.title.toLowerCase()}::${candidate.isbn.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    candidates.push(candidate);
  }

  return candidates;
}

function parseTabularImportRows(rows: string[][]): CsvImportRow[] {
  if (rows.length < 2) return [];

  const headers = rows[0];
  const indexByHeader = new Map<string, number>();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized) indexByHeader.set(normalized, index);
  });

  const result: CsvImportRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = mapImportRow(indexByHeader, rows[i]);
    if (row) result.push(row);
  }
  return result;
}

export function parseCsvCandidates(content: string): CsvTitleCandidate[] {
  const lines = content
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const rows = lines.map((line) => splitCsvLine(line));
  return parseTabularCandidates(rows);
}

export function parseCsvImportRows(content: string): CsvImportRow[] {
  const lines = content
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const rows = lines.map((line) => splitCsvLine(line));
  return parseTabularImportRows(rows);
}

export function parseSpreadsheetCandidates(rows: Array<Array<unknown>>): CsvTitleCandidate[] {
  const normalized = rows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim()))
  );
  return parseTabularCandidates(normalized);
}

export function parseSpreadsheetImportRows(rows: Array<Array<unknown>>): CsvImportRow[] {
  const normalized = rows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim()))
  );
  return parseTabularImportRows(normalized);
}
