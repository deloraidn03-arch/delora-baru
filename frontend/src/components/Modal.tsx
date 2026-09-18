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
  // Tutup modal dengan tombol Escape (aksesibilitas keyboard)
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#1F2823]/40 sm:items-center sm:p-4"
      onClick={onClose}
      data-testid={rest['data-testid'] || 'modal'}
    >
      <div
        className={`animate-modal flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-[#E6E2D8] sm:shadow-[0_24px_48px_-12px_rgba(31,40,35,0.25)] ${
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
