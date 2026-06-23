import React, { useEffect } from 'react';
interface ModalProps { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg'; }
const sizeClasses = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };
export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${sizeClasses[size]} bg-[--surface-2] border border-[--border] rounded-[--radius-xl] shadow-[--shadow-lg] animate-in fade-in zoom-in-95 duration-[--duration-normal]`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[--border]">
            <h2 className="text-sm font-semibold text-[--text-1]">{title}</h2>
            <button onClick={onClose} className="text-[--text-3] hover:text-[--text-2] transition-colors text-lg leading-none">×</button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}