// Re-export of @testing-library/react with a default `wrapper`, so components that
// call `useToast` get a provider without every test spelling one out. Import `render`
// from here instead of from RTL directly in any test that renders a toast consumer.
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ToastProvider } from '../../src/client/context/ToastContext.js';

export * from '@testing-library/react';

function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: Providers, ...options });
}
