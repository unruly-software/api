// Test setup for React Query integration tests

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Clean up React components after each test
afterEach(() => {
  cleanup();
});

// Global test configuration
beforeEach(() => {
  // Reset any global state if needed
});
