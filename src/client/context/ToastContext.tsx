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

function showFallbackToast(toast: ToastOptions) {
  if (typeof document === 'undefined') return;
  const region = document.createElement('div');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('data-toast-fallback', 'true');
  region.textContent = toast.message;
  document.body.append(region);
}

const ToastContext = createContext<ToastContextValue>({
  showToast: showFallbackToast,
});

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
    setToasts((current) => [
      ...current,
      { id, tone: toast.tone ?? 'info', message: toast.message },
    ]);
    window.setTimeout(() => dismissToast(id), 5000);
  }, [dismissToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-atomic="true"
          className="fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
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
  return useContext(ToastContext);
}
