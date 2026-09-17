import React from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'data-testid'?: string;
}

// CurrencyInput: format ribuan IDR realtime (aturan lintas-menu #1)
export const CurrencyInput: React.FC<Props> = ({ value, onChange, placeholder, className = '', disabled, ...rest }) => {
  const display = value ? Math.round(value).toLocaleString('id-ID') : '';
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#5c6f64]">
        Rp
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d]/g, '')) || 0;
          onChange(n);
        }}
        className="input-base pl-10"
        data-testid={rest['data-testid']}
      />
    </div>
  );
};
