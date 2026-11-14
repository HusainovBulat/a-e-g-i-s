import { afterEach } from 'vitest';

// React Testing Library auto-cleanup needs a global afterEach; register it explicitly.
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
