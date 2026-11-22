import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { pinnedCatalog } from './scripts/build/bootstrap-catalog.ts';
import { serviceWorkerShell } from './scripts/build/build-shell.ts';
import { releaseNotices } from './scripts/build/release-notices.ts';
import { localChannel } from './scripts/data/channel-target.ts';

export default defineConfig({
  plugins: [react(), pinnedCatalog(), localChannel(), serviceWorkerShell(), releaseNotices()],
});
