import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 5310);
export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}/`, viewport: { width: 1280, height: 720 }, trace: 'retain-on-failure' },
  webServer: {
    command: `node scripts/serve-static.mjs dist/web ${port}`,
    port,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
