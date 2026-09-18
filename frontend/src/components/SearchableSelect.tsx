import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string, label?: string) => void;
  placeholder?: string;
  'data-testid'?: string;
  allowCreate?: boolean;
  onCreate?: (text: string) => void;
  disabled?: boolean;
}

// SearchableSelect: dipakai bila opsi > 8 item; touch-friendly (tap target >= 44px)
export const SearchableSelect: React.FC<Props> = ({
  options,
  value,
  onChange,
  placeholder = 'Pilih…',
  allowCreate,
  onCreate,
  disabled,
  ...rest
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );
  const exactMatch = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setQuery('');
        }}
        className="input-base flex items-center justify-between gap-2 text-left"
        data-testid={rest['data-testid']}
      >
        <span className={selected ? 'text-[#2e3b34]' : 'text-[#93a298]'}>
          {selected ? selected.label : value && !selected ? value : placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-[#5c6f64]" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-[#dfe7e1] bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-[#eef2ef] px-3 py-2">
            <Search size={14} className="text-[#93a298]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const exact = options.find((o) => o.label.toLowerCase() === query.trim().toLowerCase());
                if (exact) {
                  onChange(exact.value, exact.label);
                  setOpen(false);
                } else if (allowCreate && query.trim()) {
                  onCreate?.(query.trim());
                  setOpen(false);
                } else if (filtered.length) {
                  onChange(filtered[0].value, filtered[0].label);
                  setOpen(false);
                }
              }}
              placeholder="Cari…"
              className="h-9 w-full bg-transparent text-sm focus:outline-none"
              data-testid={`${rest['data-testid'] || 'select'}-search`}
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value, o.label);
                  setOpen(false);
                }}
                className={`flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[#FAF8F3] ${
                  o.value === value ? 'bg-[#F2F7F4] font-semibold text-[#2e3b34]' : ''
                }`}
                data-testid={`${rest['data-testid'] || 'select'}-option-${o.value}`}
              >
                <span>{o.label}</span>
                {o.hint && <span className="text-xs text-[#5c6f64]">{o.hint}</span>}
              </button>
            ))}
            {!filtered.length && !allowCreate && (
              <div className="px-3 py-3 text-sm text-[#5c6f64]">Tidak ada hasil</div>
            )}
            {allowCreate && query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => {
                  onCreate?.(query.trim());
                  setOpen(false);
                }}
                className="flex min-h-[44px] w-full items-center px-3 py-2 text-left text-sm font-semibold text-[#6f8f7f] hover:bg-[#FAF8F3]"
                data-testid={`${rest['data-testid'] || 'select'}-create`}
              >
                + Tambah &quot;{query.trim()}&quot;
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
