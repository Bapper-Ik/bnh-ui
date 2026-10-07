import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
	workers: 1,
	use: {
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
		launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
		trace: 'off'
	},
	webServer: [
		{
			command: 'cd ../bnh-backend && .venv/bin/python -m scripts.browser_fixture',
			env: { CUSTODIAN_BROWSER_FIXTURE: resolve('test-results/vendor-fixture.json') },
			url: 'http://127.0.0.1:8017/api/v1/health/ready',
			reuseExistingServer: false
		},
		{
			command: 'node build',
			url: 'http://127.0.0.1:4173/health',
			env: {
				BACKEND_URL: 'http://127.0.0.1:8017',
				HOST: '127.0.0.1',
				PORT: '4173',
				PROTOCOL_HEADER: 'x-forwarded-proto'
			},
			reuseExistingServer: false
		}
	],
	testMatch: '**/*.e2e.{ts,js}'
});
