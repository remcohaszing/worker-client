import { join } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      'worker-client': join(import.meta.dirname, 'src', 'worker-client.ts')
    },
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium' }],
      provider: 'playwright',
      screenshotFailures: false
    },
    coverage: {
      enabled: true
    }
  }
})
