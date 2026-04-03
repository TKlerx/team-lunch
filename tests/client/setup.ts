// Client test setup — jsdom environment with @testing-library/jest-dom matchers
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Ensure DOM cleanup between tests (needed when vitest globals=false)
afterEach(() => {
  cleanup();
});
