import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { contentFits, inspectWidths } from './responsive.js';

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

test('populated requisition content fits phones, tablets and desktop with persistent mobile editing', async ({
	page
}) => {
	test.setTimeout(120000);
	await page.setViewportSize({ width: 390, height: 844 });
	await login(page, 'requester');
	await page.goto('/requisitions/new');
	const title = 'Regional equipment and installation requisition ' + randomUUID();
	await page
		.getByLabel('Vendor name', { exact: true })
		.fill('Synthetic engineering and facilities management supplier');
	await page.getByLabel('Description of work or purchase').fill(title);
	await page.getByLabel('Location', { exact: true }).fill('Regional office in Abuja');
	await page.getByRole('button', { name: '+ Add item', exact: true }).click();
	await page
		.getByLabel('Item 1', { exact: true })
		.fill('Equipment installation and regional maintenance services');
	await page.getByLabel('Unit price (₦)', { exact: true }).fill('600000000.25');
	await page.getByRole('button', { name: '+ Add item', exact: true }).click();
	await page.getByLabel('Item 2', { exact: true }).fill('Transportation and setup');
	await page.getByLabel('Unit price (₦)', { exact: true }).nth(1).fill('248000');
	await inspectWidths(page, 'create-requisition');
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	const url = page.url();
	await expect(
		page
			.getByRole('region', { name: 'Request history' })
			.getByText('Draft created', { exact: true })
	).toBeVisible();
	await inspectWidths(page, 'requisition-details');
	const cost = page.locator('.responsive-table');
	await expect(
		cost
			.getByRole('cell')
			.filter({ hasText: /^Equipment installation and regional maintenance services$/ })
	).toBeVisible();
	await expect(cost.getByRole('columnheader', { name: 'Unit price', exact: true })).toHaveCount(1);
	await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
	await expect(page.getByLabel('Item 2', { exact: true })).toHaveValue('Transportation and setup');
	await page.getByLabel('Item 2', { exact: true }).fill('Transportation, setup and staff training');
	await inspectWidths(page, 'edit-requisition');
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await page.reload();
	await expect(
		page.getByText('Transportation, setup and staff training', { exact: true })
	).toBeVisible();
	await page.goto('/requisitions');
	await page.getByLabel('Search requisitions').fill(title);
	await page.getByRole('button', { name: 'Apply filters' }).click();
	await expect(page.getByRole('row').filter({ hasText: title })).toHaveCount(1);
	await inspectWidths(page, 'requisition-list');
	await page.getByRole('link', { name: /^Open BNH/ }).click();
	await expect(page).toHaveURL(url);
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Refresh dashboard', exact: true })).toBeEnabled();
	await expect(page.locator('.panels')).toContainText(title);
	await inspectWidths(page, 'dashboard');
	await page.goto('/account');
	await expect(page.getByText('This session', { exact: true })).toBeVisible();
	await inspectWidths(page, 'account-security');
	await page.getByRole('button', { name: 'Sign out all sessions', exact: true }).click();
	await inspectWidths(page, 'session-confirmation');
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await contentFits(page);
});

test('sign-in and password recovery content fits narrow screens', async ({ page }) => {
	await page.goto('/login');
	await page
		.getByLabel('Work email')
		.fill('synthetic-long-work-email-for-mobile-testing@example.com');
	await inspectWidths(page, 'login');
	await page.getByRole('link', { name: 'Forgot password?' }).click();
	await inspectWidths(page, 'forgot-password');
});
