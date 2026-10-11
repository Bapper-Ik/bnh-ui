import { inspectWidths } from './responsive.js';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

function fixture() {
	return JSON.parse(readFileSync('test-results/vendor-fixture.json', 'utf8')) as {
		people: { role: string; email: string }[];
		password: string;
		entity: string;
	};
}
async function login(page: Page, role = 'owner') {
	const credentials = fixture();
	await page.goto('/login');
	await page.getByLabel('Staff Email').fill(credentials.people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(credentials.password);
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
	await page.goto('/vendors');
}

test('vendor capture, saved zeroes, updates, stale edits and restricted views', async ({
	page,
	browser
}) => {
	await login(page);
	await page.getByRole('button', { name: 'Add Vendor' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Vendor Name').fill('Synthetic browser supplier');
	await dialog.getByLabel('Contact Person').fill('Synthetic contact');
	await dialog.getByLabel('Phone Numbers').fill('+234 000 000 001\n+234 000 000 002');
	await dialog
		.getByRole('combobox', { name: 'Bank Details', exact: true })
		.selectOption({ label: 'Supply Bank Details' });
	await dialog.getByLabel('Bank Name', { exact: true }).fill('Synthetic bank');
	await dialog.getByLabel('Account Name', { exact: true }).fill('Synthetic beneficiary');
	await dialog.getByLabel('Account Number', { exact: true }).fill('0000000123');
	await inspectWidths(page, 'vendor-form');
	await dialog.getByRole('button', { name: 'Save Vendor' }).click();
	await expect(dialog.getByText('0000000123', { exact: true })).toBeVisible();
	await dialog.getByRole('button', { name: 'Close Vendor Drawer' }).click();
	await page.reload();
	await page.getByRole('button', { name: 'View Synthetic browser supplier', exact: true }).click();
	await expect(dialog.getByText('0000000123', { exact: true })).toBeVisible();
	await dialog.getByRole('button', { name: 'Edit Vendor', exact: true }).click();
	await dialog.getByLabel('Vendor Name').fill('Synthetic revised supplier');
	await dialog.getByRole('button', { name: 'Save Vendor' }).click();
	await expect(dialog.getByRole('heading', { name: 'Synthetic revised supplier' })).toBeVisible();
	await expect(dialog.getByText(/Version 2/)).toBeVisible();

	const second = await page.context().newPage();
	await second.goto('/vendors');
	await second
		.getByRole('button', { name: 'View Synthetic revised supplier', exact: true })
		.click();
	await second.getByRole('button', { name: 'Edit Vendor', exact: true }).click();
	await second.getByLabel('Contact Person').fill('Unsaved stale contact');
	await dialog.getByRole('button', { name: 'Edit Vendor', exact: true }).click();
	await dialog.getByLabel('Contact Person').fill('Current contact');
	await dialog.getByRole('button', { name: 'Save Vendor' }).click();
	await expect(dialog.getByText(/Version 3/)).toBeVisible();
	await second.getByRole('button', { name: 'Save Vendor' }).click();
	await expect(second.getByRole('alert')).toContainText('changed by someone else');
	await expect(second.getByLabel('Contact Person')).toHaveValue('Unsaved stale contact');
	await expect(second.getByRole('button', { name: 'Save Vendor' })).toBeDisabled();
	await second.close();
	await dialog.getByRole('button', { name: 'Close Vendor Drawer' }).click();
	await page.getByLabel('Search Vendors').fill('no matching supplier');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'No Matching Vendors' })).toBeVisible();
	await page.getByLabel('Search Vendors').fill('revised');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.getByRole('button', { name: 'View Synthetic revised supplier' })).toBeVisible();
	await inspectWidths(page, 'vendor-list');
	await page.screenshot({ path: 'test-results/vendors-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: 'View Synthetic revised supplier' }).click();
	await expect(dialog).toBeVisible();
	await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
	await expect(dialog).toHaveCSS('position', 'fixed');
	await page.screenshot({ path: 'test-results/vendors-mobile.png' });
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();

	for (const role of ['peer', 'readonly']) {
		const context = await browser.newContext();
		const restricted = await context.newPage();
		await login(restricted, role);
		await expect(restricted.getByText('0000000123')).toHaveCount(0);
		if (role === 'readonly')
			await expect(restricted.getByRole('button', { name: 'Add Vendor' })).toHaveCount(0);
		await restricted.getByRole('button', { name: 'View Synthetic revised supplier' }).click();
		await expect(
			restricted.getByText('You do not have access to these bank details.')
		).toBeVisible();
		await expect(restricted.getByText('0000000123')).toHaveCount(0);
		await expect(restricted.getByRole('button', { name: 'Edit Vendor', exact: true })).toHaveCount(
			0
		);
		await context.close();
	}
});

test('officers see full vendor details while ordinary peers stay restricted', async ({ page }) => {
	test.setTimeout(90000);
	const name = 'Officer-visible supplier ' + Date.now();
	await login(page, 'requester');
	const memberships = await (await page.request.get('/api/v1/organisation/memberships')).json();
	const csrf = (await page.context().cookies()).find(
		(cookie) => cookie.name === 'custodian_csrf'
	)!.value;
	const created = await page.request.post('/api/v1/vendors', {
		headers: { origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrf },
		data: {
			entity_id: memberships[0].entity_id,
			data: {
				name,
				bank: {
					bank_name: 'Synthetic officer bank',
					account_name: name,
					account_number: '0000000789'
				}
			}
		}
	});
	expect(created.status()).toBe(201);
	for (const role of [
		'requester',
		'hod',
		'chief_of_staff',
		'md',
		'secretary',
		'chairman',
		'draft_requester'
	]) {
		await login(page, role);
		await page.getByLabel('Search Vendors').fill(name);
		await page.getByRole('button', { name: 'Search', exact: true }).click();
		const row = page.getByRole('row').filter({ hasText: name });
		await expect(
			row.getByText(role === 'draft_requester' ? 'Recorded · restricted access' : 'Recorded', {
				exact: true
			})
		).toBeVisible();
		await row.getByRole('button', { name: 'View ' + name, exact: true }).click();
		const dialog = page.getByRole('dialog');
		if (role === 'draft_requester') {
			await expect(dialog.getByText('You do not have access to these bank details.')).toBeVisible();
			await expect(dialog.getByText('0000000789', { exact: true })).toHaveCount(0);
		} else {
			await expect(dialog.getByText('0000000789', { exact: true })).toBeVisible();
		}
		if (role !== 'requester')
			await expect(dialog.getByRole('button', { name: 'Edit Vendor', exact: true })).toHaveCount(0);
	}
});
