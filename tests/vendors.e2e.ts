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
	await page.getByLabel('Work email').fill(credentials.people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(credentials.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Vendors', exact: true })).toBeVisible();
}

test('vendor capture, saved zeroes, updates, stale edits and restricted views', async ({
	page,
	browser
}) => {
	await login(page);
	await page.getByRole('button', { name: 'Add vendor' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Vendor name').fill('Synthetic browser supplier');
	await dialog.getByLabel('Contact person').fill('Synthetic contact');
	await dialog.getByLabel('Phone numbers').fill('+234 000 000 001\n+234 000 000 002');
	await dialog
		.getByRole('combobox', { name: 'Bank details', exact: true })
		.selectOption({ label: 'Supply bank details' });
	await dialog.getByLabel('Bank name', { exact: true }).fill('Synthetic bank');
	await dialog.getByLabel('Account name', { exact: true }).fill('Synthetic beneficiary');
	await dialog.getByLabel('Account number', { exact: true }).fill('0000000123');
	await dialog.getByRole('button', { name: 'Save vendor' }).click();
	await expect(dialog.getByText('0000000123', { exact: true })).toBeVisible();
	await dialog.getByRole('button', { name: 'Close vendor drawer' }).click();
	await page.reload();
	await page.getByRole('button', { name: 'View Synthetic browser supplier', exact: true }).click();
	await expect(dialog.getByText('0000000123', { exact: true })).toBeVisible();
	await dialog.getByRole('button', { name: 'Edit vendor', exact: true }).click();
	await dialog.getByLabel('Vendor name').fill('Synthetic revised supplier');
	await dialog.getByRole('button', { name: 'Save vendor' }).click();
	await expect(dialog.getByRole('heading', { name: 'Synthetic revised supplier' })).toBeVisible();
	await expect(dialog.getByText(/Version 2/)).toBeVisible();

	const second = await page.context().newPage();
	await second.goto('/vendors');
	await second
		.getByRole('button', { name: 'View Synthetic revised supplier', exact: true })
		.click();
	await second.getByRole('button', { name: 'Edit vendor', exact: true }).click();
	await second.getByLabel('Contact person').fill('Unsaved stale contact');
	await dialog.getByRole('button', { name: 'Edit vendor', exact: true }).click();
	await dialog.getByLabel('Contact person').fill('Current contact');
	await dialog.getByRole('button', { name: 'Save vendor' }).click();
	await expect(dialog.getByText(/Version 3/)).toBeVisible();
	await second.getByRole('button', { name: 'Save vendor' }).click();
	await expect(second.getByRole('alert')).toContainText('changed by someone else');
	await expect(second.getByLabel('Contact person')).toHaveValue('Unsaved stale contact');
	await expect(second.getByRole('button', { name: 'Save vendor' })).toBeDisabled();
	await second.close();
	await dialog.getByRole('button', { name: 'Close vendor drawer' }).click();
	await page.getByLabel('Search vendors').fill('no matching supplier');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'No matching vendors' })).toBeVisible();
	await page.getByLabel('Search vendors').fill('revised');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.getByRole('button', { name: 'View Synthetic revised supplier' })).toBeVisible();
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
			await expect(restricted.getByRole('button', { name: 'Add vendor' })).toHaveCount(0);
		await restricted.getByRole('button', { name: 'View Synthetic revised supplier' }).click();
		await expect(
			restricted.getByText('You do not have access to these bank details.')
		).toBeVisible();
		await expect(restricted.getByText('0000000123')).toHaveCount(0);
		await expect(restricted.getByRole('button', { name: 'Edit vendor', exact: true })).toHaveCount(
			0
		);
		await context.close();
	}
});
