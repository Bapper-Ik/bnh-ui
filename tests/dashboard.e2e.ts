import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
	await expect(page.getByRole('button', { name: 'Refresh dashboard', exact: true })).toBeEnabled();
}

test('dashboard shows persisted counts, activity, safe shortcuts and responsive links', async ({
	page
}) => {
	await login(page, 'draft_requester');
	const statuses = page.getByRole('region', { name: 'Request status counts' });
	await expect(page.getByRole('region', { name: 'Outstanding tasks' })).toHaveCount(0);
	await page.getByRole('link', { name: 'Create requisition', exact: true }).click();
	const title = 'Dashboard draft ' + randomUUID();
	await page.getByLabel('Description of work or purchase').fill(title);
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Main navigation' })
		.getByRole('link', { name: 'Dashboard', exact: true })
		.click();
	await expect(
		page.getByRole('region', { name: 'Latest requisitions' }).getByText(title, { exact: true })
	).toBeVisible();
	await expect(
		page
			.getByRole('region', { name: 'Recent activity' })
			.getByText('Draft created', { exact: true })
	).toBeVisible();
	await page.reload();
	await expect(statuses.getByRole('link', { name: /Draft: [1-9]/ })).toBeVisible();
	await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
	await statuses.getByRole('link', { name: /Draft:/ }).click();
	await expect(page).toHaveURL(/state=DRAFT/);
	await expect(page.getByText(title, { exact: true })).toBeVisible();
	await login(page, 'readonly');
	await expect(page.getByRole('link', { name: 'Create requisition', exact: true })).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Outstanding tasks' })).toHaveCount(0);
	await expect(page.getByText(title, { exact: true })).toHaveCount(0);
	await login(page, 'hod');
	await expect(page.getByRole('region', { name: 'Outstanding tasks' })).toBeVisible();
});

test('dashboard clears stale data on failed refresh and sends expired sessions to sign-in', async ({
	page
}) => {
	await login(page, 'requester');
	await expect(page.getByRole('region', { name: 'Request status counts' })).toBeVisible();
	await page.route('**/api/v1/dashboard', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({
				code: 'SERVICE_UNAVAILABLE',
				message: 'Dashboard temporarily unavailable.'
			})
		})
	);
	await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('Dashboard temporarily unavailable');
	await expect(page.getByRole('region', { name: 'Request status counts' })).toHaveCount(0);
	await page.unroute('**/api/v1/dashboard');
	await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Request status counts' })).toBeVisible();
	await page.context().clearCookies();
	await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Sign in to Custodian', exact: true })
	).toBeVisible();
});
