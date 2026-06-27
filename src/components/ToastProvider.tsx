import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X, Zap } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  message: string;
}

type ToastFn = (type: ToastType, title: string, message: string) => number;

const ToastContext = createContext<ToastFn | null>(null);

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: Zap
};

const COLORS: Record<ToastType, string> = {
  success: 'border-emerald-500/30 bg-emerald-900/30 text-emerald-300',
  error: 'border-red-500/30 bg-red-900/30 text-red-300',
  info: 'border-indigo-500/30 bg-indigo-900/30 text-indigo-300',
  warning: 'border-amber-500/30 bg-amber-900/30 text-amber-300'
};

const ICON_COLORS: Record<ToastType, string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-indigo-400',
  warning: 'text-amber-400'
};

interface ToastProps extends ToastItem {
  onDismiss: (id: number) => void;
}

function Toast({ id, type = 'info', title, message, onDismiss }: ToastProps) {
  const Icon = ICONS[type] || Info;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), type === 'error' ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, [id, type, onDismiss]);

  return (
    <div className={`flex items-start gap-3 w-80 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-sm animate-in slide-in-from-right-4 duration-200 ${COLORS[type]}`}>
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${ICON_COLORS[type]}`} />
      <div className="flex-1 min-w-0">
        {title && <div className="text-[11px] font-bold uppercase tracking-widest mb-0.5">{title}</div>}
        {message && <div className="text-xs leading-relaxed opacity-90">{message}</div>}
      </div>
      <button
        onClick={() => onDismiss(id)}
        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface ProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef<number>(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((type: ToastType, title: string, message: string) => {
    const id = ++counterRef.current;
    setToasts((current) => [...current.slice(-4), { id, type, title, message }]);
    return id;
  }, []);

  const value = useMemo(() => toast, [toast]);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const { message, type = 'info', title } = e.detail || {};
      if (message) toast(type, title || '', message);
    };
    window.addEventListener('alphonso:toast', handler as EventListener);
    return () => window.removeEventListener('alphonso:toast', handler as EventListener);
  }, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9998] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast {...t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return {
    success: (title: string, msg: string) => ctx('success', title, msg),
    error: (title: string, msg: string) => ctx('error', title, msg),
    info: (title: string, msg: string) => ctx('info', title, msg),
    warning: (title: string, msg: string) => ctx('warning', title, msg)
  };
}
