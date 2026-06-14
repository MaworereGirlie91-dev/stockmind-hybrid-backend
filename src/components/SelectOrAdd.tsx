'use client';

import { useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';

interface SelectOrAddProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  onAddNew?: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}

export default function SelectOrAdd({
  label,
  value,
  onChange,
  options,
  onAddNew,
  placeholder = 'Select…',
  required,
}: SelectOrAddProps) {
  const [custom, setCustom] = useState('');
  const isOther = value === '__other__';

  const handleSelect = (v: string) => {
    if (v === '__other__') {
      onChange('__other__');
      setCustom('');
    } else {
      onChange(v);
    }
  };

  const handleCustomConfirm = () => {
    const t = custom.trim();
    if (!t) return;
    onAddNew?.(t);
    onChange(t);
    setCustom('');
  };

  const inputBase =
    'w-full bg-white border border-[#f3c6cc] rounded-lg px-3 py-2 text-sm text-[#1f2937] placeholder-[#9ca3af] focus:outline-none focus:border-[#c8102e]';

  return (
    <div>
      <label className="text-xs text-[#6b7280] font-medium block mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>

      {!isOther ? (
        <div className="relative">
          <select
            value={value}
            onChange={(e) => handleSelect(e.target.value)}
            className={`${inputBase} appearance-none pr-8 cursor-pointer`}
          >
            <option value="">{placeholder}</option>
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
            <option value="__other__">+ Add new…</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none" />
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            autoFocus
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCustomConfirm(); } }}
            placeholder="Type and press Enter…"
            className={`${inputBase} flex-1`}
          />
          <button
            type="button"
            onClick={handleCustomConfirm}
            disabled={!custom.trim()}
            className="px-3 rounded-lg bg-white text-black text-sm font-medium hover:bg-[#e6e6e6] transition-colors disabled:opacity-30"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => { onChange(''); setCustom(''); }}
            className="px-3 rounded-lg border border-[#f3c6cc] text-[#9f1027] hover:text-[#c8102e] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {!isOther && value && value !== '__other__' && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="mt-1 text-[10px] text-[#6b7280] hover:text-[#9f1027] transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
