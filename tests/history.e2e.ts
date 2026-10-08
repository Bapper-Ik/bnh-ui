import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { RequestView } from '../src/lib/api/schema.js';
function fixture() {
	return JSON.parse(readFileSync('test-results/vendor-fixture.json', 'utf8')) as {
		people: { role: string; email: string }[];
		password: string;
	};
}
async function login(page: Page, role: string) {
	const f = fixture();
	await page.goto('/login');
	await page.getByLabel('Work email').fill(f.people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(f.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
	await page.goto('/vendors');
}
async function create(page: Page, amount: string) {
	await login(page, 'requester');
	await page.goto('/requisitions/new');
	const title = 'Approval journey ' + randomUUID();
	await page.getByLabel('Vendor name', { exact: true }).fill('Synthetic approval supplier');
	await page.getByLabel('Description of work or purchase').fill(title);
	await page.getByLabel('Location', { exact: true }).fill('Abuja');
	await page.getByRole('button', { name: '+ Add item', exact: true }).click();
	await page.getByLabel('Item 1', { exact: true }).fill('Office materials');
	await page.getByLabel('Unit price (₦)', { exact: true }).fill(amount);
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	return { title, url: page.url() };
}

test('persisted history and scoped audit paginate, filter and open private evidence', async ({
	page
}) => {
	test.setTimeout(90000);
	const req = await create(page, '248000');
	const id = new URL(req.url).pathname.split('/').pop()!;
	const path = '/api/v1/requisitions/' + id;
	let saved = (await (await page.request.get(path)).json()) as RequestView;
	const csrf = (await page.context().cookies()).find((c) => c.name === 'custodian_csrf')!.value;
	for (let i = 0; i < 26; i++) {
		const response = await page.request.put(path + '/draft', {
			data: {
				expected_version: saved.version,
				content: { ...saved.content, location: 'Abuja ' + i }
			},
			headers: { origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrf }
		});
		expect(response.status()).toBe(200);
		saved = (await response.json()) as RequestView;
	}
	await page.reload();
	const history = page.getByRole('region', { name: 'Request history', exact: true });
	await expect(history.getByText('1–10 of 27 actions', { exact: true })).toBeVisible();
	await history.getByRole('button', { name: 'Later actions' }).click();
	await expect(history.getByText('11–20 of 27 actions', { exact: true })).toBeVisible();
	await history.getByRole('button', { name: 'Earlier actions' }).click();
	await expect(history.getByText('Draft created', { exact: true })).toBeVisible();
	await page.screenshot({ path: 'test-results/history-desktop.png', fullPage: true });
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII=',
		'base64'
	);
	await page
		.getByLabel('Supporting document', { exact: true })
		.setInputFiles({ name: 'history-quote.png', mimeType: 'image/png', buffer: png });
	await page.getByRole('button', { name: 'Upload document', exact: true }).click();
	await expect(page.getByRole('button', { name: 'View history-quote.png' })).toBeVisible();
	await page.goto('/requisitions');
	await page.getByText('More filters', { exact: true }).click();
	await page.getByLabel('Search requisitions').fill(saved.reference);
	await page.getByLabel('Requester', { exact: true }).fill('Synthetic requester');
	await page.getByLabel('Department', { exact: true }).fill('Requisition Operations');
	await page.getByLabel('Company', { exact: true }).fill('Synthetic requisition company');
	await page.getByLabel('Vendor', { exact: true }).fill('Synthetic approval supplier');
	await page.getByLabel('Only my requests').check();
	await page.getByRole('button', { name: 'Apply filters' }).click();
	await expect(page).toHaveURL(/vendor=Synthetic/);
	await expect(page.getByRole('link', { name: saved.reference, exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByLabel('Vendor', { exact: true })).toHaveValue(
		'Synthetic approval supplier'
	);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: 'test-results/history-filters-mobile.png', fullPage: true });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.screenshot({ path: 'test-results/history-filters-mobile.png', fullPage: true });
	await page.getByLabel('Vendor', { exact: true }).fill('Unavailable supplier');
	await page.getByRole('button', { name: 'Apply filters' }).click();
	await expect(page.getByRole('heading', { name: 'No matching requisitions' })).toBeVisible();
	await login(page, 'auditor');
	await page.getByRole('link', { name: 'Audit Log', exact: true }).click();
	await page.getByLabel('Search audit log').fill(saved.reference);
	await page.getByRole('button', { name: 'Apply filters' }).click();
	const events = page.getByRole('list', { name: 'Audit events' });
	await expect(events.locator(':scope > li')).toHaveCount(25);
	await expect(page.getByText('1–25 of 28', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'View history-quote.png', exact: true }).click();
	await expect(
		page.getByRole('dialog', { name: 'Document viewer' }).getByRole('img')
	).toBeVisible();
	await page.getByRole('button', { name: 'Close document' }).click();
	await page.screenshot({ path: 'test-results/audit-mobile.png', fullPage: false });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.getByRole('link', { name: 'Older events' }).click();
	await expect(page).toHaveURL(/before=/);
	await expect(page.getByText('26–28 of 28', { exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Newer events' }).click();
	await expect(page.getByText('1–25 of 28', { exact: true })).toBeVisible();
	await page.getByLabel('Exact action').fill('requisition.created');
	await page.getByRole('button', { name: 'Apply filters' }).click();
	await expect(events.locator(':scope > li')).toHaveCount(1);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.screenshot({ path: 'test-results/audit-desktop.png', fullPage: true });
	await events.getByRole('link', { name: saved.reference }).click();
	await expect(page.getByRole('heading', { name: req.title, exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toHaveCount(0);
	await expect(history.getByText('Draft created', { exact: true })).toBeVisible();
});

test('technical administrators and ordinary staff cannot open the Audit Log', async ({ page }) => {
	for (const role of ['admin', 'requester', 'readonly']) {
		await login(page, role);
		await expect(page.getByRole('link', { name: 'Audit Log', exact: true })).toHaveCount(0);
		expect((await page.request.get('/api/v1/audit-events')).status()).toBe(403);
		await page.goto('/audit');
		await expect(page.getByRole('heading', { name: 'Audit Log access restricted' })).toBeVisible();
		await expect(page.getByRole('list', { name: 'Audit events' })).toHaveCount(0);
	}
});
