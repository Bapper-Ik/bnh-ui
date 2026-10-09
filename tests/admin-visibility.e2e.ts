import { openNavigation } from './workspace.js';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { MembershipView, RequestView, VendorView } from '../src/lib/api/schema.js';

async function login(page: Page, role: string) {
	const f = JSON.parse(readFileSync('test-results/vendor-fixture.json', 'utf8')) as {
		people: { role: string; email: string }[];
		password: string;
	};
	await page.goto('/login');
	await page.getByLabel('Work email').fill(f.people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(f.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}
async function fixture(page: Page, role: string) {
	await login(page, role);
	const memberships = (await (
		await page.request.get('/api/v1/organisation/memberships')
	).json()) as MembershipView[];
	const entity = memberships[0];
	const csrf = (await page.context().cookies()).find((c) => c.name === 'custodian_csrf')!.value;
	const headers = { origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrf };
	const vendorName = 'Oversight supplier ' + randomUUID();
	const bank = {
		bank_name: 'Private synthetic bank',
		account_name: 'Private synthetic beneficiary',
		account_number: '0000000088'
	};
	const vr = await page.request.post('/api/v1/vendors', {
		headers,
		data: { entity_id: entity.entity_id, data: { name: vendorName, bank } }
	});
	expect(vr.status()).toBe(201);
	const vendor = (await vr.json()) as VendorView;
	const description = 'Oversight request ' + randomUUID();
	const rr = await page.request.post('/api/v1/requisitions', {
		headers,
		data: {
			entity_id: entity.entity_id,
			creation_key: randomUUID(),
			content: {
				description,
				vendor: { name: vendorName, ...bank },
				lines: [{ description: 'Materials', quantity: '1', unit_price: '248000' }]
			}
		}
	});
	expect(rr.status()).toBe(201);
	return { request: (await rr.json()) as RequestView, vendor, entity };
}

test('administrator without membership can inspect requests and vendors across companies without financial powers', async ({
	page
}) => {
	const first = await fixture(page, 'owner');
	const second = await fixture(page, 'requester');
	await login(page, 'oversight');
	await expect(page.getByRole('link', { name: 'Open My Tasks', exact: true })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Create requisition', exact: true })).toHaveCount(0);
	const nav = page.getByRole('navigation', { name: 'Main navigation' });
	await expect(nav.getByRole('link', { name: 'My Tasks', exact: true })).toHaveCount(0);
	await nav.getByRole('link', { name: 'Requisitions', exact: true }).click();
	await expect(page.getByRole('link', { name: '+ New requisition', exact: true })).toHaveCount(0);
	for (const data of [first, second]) {
		await page.goto('/requisitions?search=' + data.request.reference);
		await expect(page.getByText(data.request.content.description, { exact: true })).toBeVisible();
		await page.goto('/requisitions/' + data.request.id);
		await expect(
			page.getByRole('heading', { name: data.request.content.description, exact: true })
		).toBeVisible();
		await expect(page.getByText(/Administrative oversight ·/)).toBeVisible();
		await expect(page.getByText(/Document access is restricted/)).toBeVisible();
		await expect(page.getByText('0000000088', { exact: true })).toHaveCount(0);
		await expect(
			page.getByRole('button', {
				name: /^(Edit draft|Approve|Review & submit|Reject|Return for revision)$/
			})
		).toHaveCount(0);
	}
	await page.screenshot({ path: 'test-results/admin-requisition-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.screenshot({ path: 'test-results/admin-requisition-mobile.png', fullPage: true });
	await openNavigation(page);
	await nav.getByRole('link', { name: 'Vendors', exact: true }).click();
	for (const data of [first, second]) {
		await page
			.getByRole('combobox', { name: 'Company', exact: true })
			.selectOption(data.entity.entity_id);
		await page.getByLabel('Search vendors').fill(data.vendor.name);
		await page.getByRole('button', { name: 'Search', exact: true }).click();
		await expect(page.getByRole('button', { name: '+ Add vendor', exact: true })).toHaveCount(0);
		await page.getByRole('button', { name: 'View ' + data.vendor.name, exact: true }).click();
		await expect(page.getByRole('button', { name: 'Edit vendor', exact: true })).toHaveCount(0);
		await expect(page.getByText('0000000088', { exact: true })).toHaveCount(0);
		await page.getByRole('button', { name: 'Close vendor drawer' }).click();
	}
	await expect
		.poll(() =>
			page.locator('.table-wrap').evaluate((element) => element.scrollWidth <= element.clientWidth)
		)
		.toBe(true);
	await page.screenshot({ path: 'test-results/admin-vendors-mobile.png', fullPage: true });
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.screenshot({ path: 'test-results/admin-vendors-desktop.png', fullPage: true });
	await login(page, 'inviter');
	await page.goto('/requisitions/' + first.request.id);
	await expect(page.getByText('Requisition not found.', { exact: true })).toBeVisible();
	expect(
		(await page.request.get('/api/v1/vendors?entity_id=' + second.entity.entity_id)).status()
	).toBe(403);
});

test('administrator vendor loading failure clears the directory and can retry', async ({
	page
}) => {
	await login(page, 'oversight');
	await page.route('**/api/v1/vendors/companies', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({
				code: 'SERVICE_UNAVAILABLE',
				message: 'Company directory temporarily unavailable.'
			})
		})
	);
	await page.goto('/vendors');
	await expect(page.getByRole('alert')).toContainText('Company directory temporarily unavailable');
	await expect(page.getByRole('combobox', { name: 'Company', exact: true })).toHaveCount(0);
	await page.unroute('**/api/v1/vendors/companies');
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.getByRole('combobox', { name: 'Company', exact: true })).toBeVisible();
});
