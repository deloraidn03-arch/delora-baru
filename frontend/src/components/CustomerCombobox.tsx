import React from 'react';
import { Customer } from '../lib/types';
import { SearchableSelect } from './SearchableSelect';

interface Props {
  customers: Customer[];
  value: string;
  onChange: (name: string) => void;
  'data-testid'?: string;
}

// Pilih dari daftar customer ATAU ketik nama baru (otomatis tersimpan saat simpan)
export const CustomerCombobox: React.FC<Props> = ({ customers, value, onChange, ...rest }) => {
  return (
    <SearchableSelect
      options={customers.map((c) => ({ value: c.name, label: c.name, hint: c.whatsapp_number || undefined }))}
      value={value}
      onChange={(v) => onChange(v)}
      onCreate={(text) => onChange(text)}
      allowCreate
      placeholder="Pilih atau ketik nama customer…"
      data-testid={rest['data-testid'] || 'customer-combobox'}
    />
  );
};
