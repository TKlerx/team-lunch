import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../components/ui/Button.js';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastOptions {
  tone?: ToastTone;
  message: string;
}

interface ToastMessage extends Required<ToastOptions> {
  id: number;
}

interface ToastContextValue {
  showToast: (toast: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'border-success bg-success-soft text-success-fg',
  error: 'border-danger bg-danger-soft text-danger-fg',
  info: 'border-border bg-surface text-fg',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastOptions) => {
    const id = Date.now() + Math.random();
    const tone = toast.tone ?? 'info';
    setToasts((current) => [...current, { id, tone, message: toast.message }]);
    // Errors stay until dismissed: they are the ones worth reading, and a 5s
    // timer that cannot be paused fails WCAG 2.2.1 for exactly that content.
    if (tone !== 'error') {
      window.setTimeout(() => dismissToast(id), 5000);
    }
  }, [dismissToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          // atomic=false so adding/removing one toast does not re-announce the whole stack
          aria-atomic="false"
          className="fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              // errors get assertive announcement so they are not queued behind other speech
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${TONE_CLASS[toast.tone]}`}
            >
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1">{toast.message}</p>
                <Button
                  variant="ghost"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  className="-m-2 px-2 py-1 text-current hover:bg-black/5"
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('useToast must be used inside a <ToastProvider>');
  }
  return value;
}
