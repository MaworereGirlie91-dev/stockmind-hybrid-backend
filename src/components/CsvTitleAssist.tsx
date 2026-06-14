'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, FileUp, X } from 'lucide-react';

import { parseCsvCandidates, parseSpreadsheetCandidates } from '@/lib/csv';
import { CsvTitleCandidate } from '@/types';

export default function CsvTitleAssist({
  onSelect,
  onCandidatesChange,
}: {
  onSelect: (candidate: CsvTitleCandidate) => void;
  onCandidatesChange?: (candidates: CsvTitleCandidate[]) => void;
}) {
  const [candidates, setCandidates] = useState<CsvTitleCandidate[]>([]);
  const [selected, setSelected] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const options = useMemo(
    () =>
      candidates.map((candidate, index) => ({
        id: String(index),
        label: `${candidate.title}${candidate.isbn ? ` | ISBN ${candidate.isbn}` : ''}${
          candidate.category ? ` | ${candidate.category}` : ''
        }`,
        candidate,
      })),
    [candidates]
  );

  const handleFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    setError('');
    try {
      const lower = file.name.toLowerCase();
      let parsed: CsvTitleCandidate[] = [];

      if (lower.endsWith('.csv') || file.type.includes('csv')) {
        const text = await file.text();
        parsed = parseCsvCandidates(text);
      } else if (
        lower.endsWith('.xls') ||
        lower.endsWith('.xlsx') ||
        lower.endsWith('.xlsm') ||
        lower.endsWith('.ods')
      ) {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, {
          type: 'array',
          cellText: true,
          cellDates: false,
        });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new Error('Spreadsheet has no sheets to import.');
        }
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
          header: 1,
          raw: false,
          defval: '',
          blankrows: false,
        });
        parsed = parseSpreadsheetCandidates(rows);
      } else {
        throw new Error('Unsupported file type. Use CSV, XLS, XLSX, XLSM, or ODS.');
      }

      if (!parsed.length) {
        setCandidates([]);
        setSelected('');
        setFileName(file.name);
        setError(
          'No valid rows found. Ensure file includes Title (or Product) and optional ISBN/category metadata.'
        );
        onCandidatesChange?.([]);
        return;
      }

      setCandidates(parsed);
      setSelected('');
      setFileName(file.name);
      onCandidatesChange?.(parsed);
    } catch (err) {
      setCandidates([]);
      setSelected('');
      setFileName(file.name);
      setError(err instanceof Error ? err.message : 'Failed to parse selected file.');
      onCandidatesChange?.([]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs text-[#6b7280] font-medium block">Spreadsheet Title Assist (optional)</label>

      <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#f3c6cc] bg-white text-[#6b7280] hover:text-[#9f1027] hover:border-[#c8102e] transition-colors text-xs cursor-pointer">
        <FileUp size={13} />
        <span className="truncate">
          {fileName
            ? `Loaded: ${fileName}`
            : 'Upload CSV/XLS/XLSX/XLSM/ODS with title or ISBN/Product metadata'}
        </span>
        <input
          type="file"
          accept=".csv,.xls,.xlsx,.xlsm,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
        />
      </label>

      {candidates.length > 0 && (
        <div className="relative">
          <select
            value={selected}
            onChange={(event) => {
              const value = event.target.value;
              setSelected(value);
              const index = Number(value);
              if (Number.isFinite(index) && index >= 0 && index < options.length) {
                onSelect(options[index].candidate);
              }
            }}
            className="appearance-none w-full bg-white border border-[#f3c6cc] rounded-lg pl-3 pr-8 py-2 text-xs text-[#1f2937] focus:outline-none focus:border-[#c8102e]"
          >
            <option value="">Choose a title from imported CSV ({candidates.length})</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b7280] pointer-events-none" />
        </div>
      )}

      {(error || candidates.length > 0) && (
        <div className="text-[11px] text-[#6b7280] flex items-center justify-between gap-2">
          <span className={error ? 'text-red-400' : ''}>{error || `${candidates.length} candidate titles loaded.`}</span>
          {candidates.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setCandidates([]);
                setSelected('');
                setFileName('');
                setError('');
                onCandidatesChange?.([]);
              }}
              className="inline-flex items-center gap-1 text-[#9f1027] hover:text-[#c8102e] transition-colors"
            >
              <X size={11} />
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
