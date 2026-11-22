import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pages',
  use: { browserName: 'chromium', locale: 'en-US' },
});
