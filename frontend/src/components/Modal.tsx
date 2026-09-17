import React from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  'data-testid'?: string;
}

// Modal responsif: full-screen di HP, centered dialog di desktop
export const Modal: React.FC<Props> = ({ open, onClose, title, children, wide, ...rest }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#2e3b34]/60 sm:items-center sm:p-4"
      onClick={onClose}
      data-testid={rest['data-testid'] || 'modal'}
    >
      <div
        className={`flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[92vh] sm:rounded-xl sm:shadow-xl ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#eef2ef] px-4 py-3 sm:px-6">
          <h2 className="font-brand text-xl font-semibold text-[#2e3b34]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[#5c6f64] transition-colors hover:bg-[#f0f4f1]"
            data-testid="modal-close-button"
            aria-label="Tutup"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
      </div>
    </div>
  );
};
