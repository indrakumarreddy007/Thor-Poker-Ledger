import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, AlertTriangle, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

type ToastAction =
  | { type: 'add'; toast: Toast }
  | { type: 'remove'; id: number };

function reducer(state: Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case 'add':
      return [...state, action.toast];
    case 'remove':
      return state.filter(t => t.id !== action.id);
    default:
      return state;
  }
}

interface ToastContextValue {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const VARIANT_STYLES: Record<ToastVariant, { ring: string; icon: React.ComponentType<{ className?: string }>; iconColor: string }> = {
  success: { ring: 'border-emerald-500/40 shadow-emerald-500/10', icon: CheckCircle2, iconColor: 'text-emerald-400' },
  error: { ring: 'border-rose-500/40 shadow-rose-500/10', icon: AlertCircle, iconColor: 'text-rose-400' },
  warning: { ring: 'border-amber-500/40 shadow-amber-500/10', icon: AlertTriangle, iconColor: 'text-amber-400' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, []);
  const idRef = useRef(0);

  const push = useCallback((message: string, variant: ToastVariant, duration: number) => {
    const id = ++idRef.current;
    dispatch({ type: 'add', toast: { id, message, variant, duration } });
  }, []);

  const success = useCallback((m: string, d = 3000) => push(m, 'success', d), [push]);
  const error = useCallback((m: string, d = 4500) => push(m, 'error', d), [push]);
  const warning = useCallback((m: string, d = 4000) => push(m, 'warning', d), [push]);

  const value = useMemo<ToastContextValue>(
    () => ({ success, error, warning }),
    [success, error, warning]
  );

  const dismiss = useCallback((id: number) => dispatch({ type: 'remove', id }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div
          aria-live="polite"
          aria-atomic="false"
          className="fixed z-[100] inset-x-0 bottom-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:px-0 sm:max-w-sm w-full sm:w-96 flex flex-col gap-2 pointer-events-none"
        >
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const { icon: Icon, iconColor, ring } = VARIANT_STYLES[toast.variant];

  useEffect(() => {
    if (toast.duration <= 0) return;
    const t = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={`glass pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl animate-slide ${ring}`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
      <p className="flex-1 text-sm font-bold text-slate-100 leading-snug">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 -mr-1 p-1 rounded-lg text-slate-500 hover:text-slate-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
