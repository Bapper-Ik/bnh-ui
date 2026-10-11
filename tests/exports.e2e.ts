import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

test('private PDF persists through refresh, opens and downloads on desktop and mobile', async ({
	page
}) => {
	test.setTimeout(90000);
	const fixture = JSON.parse(readFileSync('test-results/vendor-fixture.json', 'utf8')) as {
		people: { role: string; email: string }[];
		password: string;
	};
	await page.goto('/login');
	await page
		.getByLabel('Staff Email')
		.fill(fixture.people.find((p) => p.role === 'requester')!.email);
	await page.getByLabel('Password', { exact: true }).fill(fixture.password);
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
	await page.goto('/requisitions/new');
	const title = 'PDF export ' + randomUUID();
	await page.getByLabel('Vendor Name', { exact: true }).fill('Synthetic PDF supplier');
	await page.getByLabel('Description of Work or Purchase').fill(title);
	await page.getByLabel('Location', { exact: true }).fill('Abuja');
	await page.getByRole('button', { name: '+ Add Item', exact: true }).click();
	await page.getByLabel('Item 1', { exact: true }).fill('Office materials');
	await page.getByLabel('Unit Price (₦)', { exact: true }).fill('248000');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	const exports = page.getByRole('region', { name: 'PDF Exports', exact: true });
	await expect(exports.getByLabel('Include private Board Records')).toHaveCount(0);
	await exports.getByRole('button', { name: 'Generate PDF', exact: true }).click();
	await page.reload();
	await expect(exports.getByRole('button', { name: 'View PDF', exact: true })).toBeVisible({
		timeout: 20000
	});
	await expect(page.getByText('PDF generated', { exact: true })).toBeVisible();
	await exports.getByRole('button', { name: 'View PDF', exact: true }).click();
	const viewer = page.getByRole('dialog', { name: 'Document Viewer' });
	await expect(viewer.getByRole('link', { name: 'Download', exact: true })).toBeVisible();
	await expect(viewer.getByRole('img', { name: 'PDF page 1 of 1', exact: true })).toBeVisible();
	await viewer.getByText('Page Text', { exact: true }).click();
	await expect(viewer.getByText(/No requester declaration has been signed/)).toBeVisible();
	await expect(viewer.getByText(/SHA-256|Signature reference|Export verification/)).toHaveCount(0);
	await viewer.getByText('Page Text', { exact: true }).click();
	const downloadPromise = page.waitForEvent('download');
	await viewer.getByRole('link', { name: 'Download', exact: true }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/draft-v\d+\.pdf$/);
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe('%PDF-');
	await page.screenshot({ path: 'test-results/pdf-viewer-desktop.png' });
	await viewer.getByRole('button', { name: 'Close Document' }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	await exports.scrollIntoViewIfNeeded();
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.screenshot({ path: 'test-results/pdf-exports-mobile.png' });
	// An unavailable-font response is a UI-only failure-state check; real rejection is covered in PostgreSQL API tests.
	await page.route('**/api/v1/requisitions/*/exports?*', async (route) => {
		const response = await route.fetch();
		await route.fulfill({
			response,
			json: {
				...(await response.json()),
				unavailable_reason:
					'The bundled PDF fonts are unavailable. Please contact your administrator to repair the backend deployment.'
			}
		});
	});
	await exports.getByRole('button', { name: 'Refresh Exports' }).click();
	await expect(exports.getByRole('button', { name: 'Generate PDF', exact: true })).toBeDisabled();
	await expect(exports.getByRole('button', { name: 'View PDF', exact: true })).toBeEnabled();
	await expect(exports.getByText(/bundled PDF fonts/)).toBeVisible();
});
