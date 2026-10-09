import { openNavigation } from './workspace.js';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
function credentials(role = 'security') {
	const f = JSON.parse(readFileSync('test-results/vendor-fixture.json', 'utf8')) as {
		people: { role: string; email: string }[];
		password: string;
	};
	return { email: f.people.find((p) => p.role === role)!.email, password: f.password };
}
async function login(page: Page, role = 'security', password = credentials(role).password) {
	await page.goto('/login');
	await page.getByLabel('Work email').fill(credentials(role).email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
	await openNavigation(page);
	await page.getByRole('link', { name: 'My Account & Security', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Account details' })).toBeVisible();
}
async function confirm(page: Page) {
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Confirm sign out', exact: true })
		.click();
}

test('account profile, session revocation and password change persist across separate browsers', async ({
	page,
	browser
}) => {
	await login(page);
	const other = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const second = await other.newPage();
	try {
		await login(second);
		await page.getByRole('button', { name: 'Refresh account' }).click();
		await expect(page.getByText('2 active sessions', { exact: true })).toBeVisible();
		const details = page.getByRole('region', { name: 'Account details' });
		await expect(details.getByText(credentials().email, { exact: true })).toBeVisible();
		await expect(details.locator('input,select')).toHaveCount(0);
		await page.screenshot({ path: 'test-results/security-desktop.png', fullPage: true });
		await page.setViewportSize({ width: 390, height: 844 });
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
			.toBe(true);
		await page.screenshot({ path: 'test-results/security-mobile.png', fullPage: true });
		await page.getByRole('button', { name: /Sign out session from/ }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(page.getByText('2 active sessions', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: /Sign out session from/ }).click();
		await confirm(page);
		await expect(page.getByText('1 active session', { exact: true })).toBeVisible();
		await second.reload();
		await expect(second.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
		await login(second);
		await page.getByRole('button', { name: 'Refresh account' }).click();
		await page.getByRole('button', { name: 'Sign out other sessions', exact: true }).click();
		await confirm(page);
		await expect(page.getByText('1 active session', { exact: true })).toBeVisible();
		await second.reload();
		await expect(second.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
		await login(second);
		const newPassword = 'Synthetic-security-browser-password-2026';
		await page.getByLabel('Current password', { exact: true }).fill(credentials().password);
		await page.getByLabel('New password', { exact: true }).fill(newPassword);
		await page.getByLabel('Confirm new password').fill('Synthetic-mismatch-password');
		await page.getByRole('button', { name: 'Change password and sign out' }).click();
		await expect(page.getByRole('alert')).toContainText('do not match');
		await page.getByLabel('Current password', { exact: true }).fill('incorrect');
		await page.getByLabel('Confirm new password').fill(newPassword);
		await page.getByRole('button', { name: 'Change password and sign out' }).click();
		await expect(page.getByRole('alert')).toContainText('Current password is incorrect');
		await expect(page.getByLabel('New password', { exact: true })).toHaveValue('');
		await page.getByLabel('Current password', { exact: true }).fill(credentials().password);
		await page.getByLabel('New password', { exact: true }).fill(newPassword);
		await page.getByLabel('Confirm new password').fill(newPassword);
		await page.getByRole('button', { name: 'Change password and sign out' }).click();
		await expect(page.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
		await expect(page.getByRole('status')).toContainText('Your password was changed');
		await second.reload();
		await expect(second.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
		const stored = await page.evaluate(() =>
			JSON.stringify({
				local: { ...localStorage },
				session: { ...sessionStorage },
				history: history.state
			})
		);
		expect(stored).not.toContain(newPassword);
		await login(page, 'security', newPassword);
		await page.getByRole('button', { name: 'Sign out all sessions', exact: true }).click();
		await confirm(page);
		await expect(page.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
	} finally {
		await other.close();
	}
});

test('read-only staff can manage their account; refresh failure clears details and expiry redirects', async ({
	page
}) => {
	await login(page, 'readonly');
	await expect(page.getByText('Read-only workspace', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Change password and sign out' })).toBeEnabled();
	await page.route('**/api/v1/auth/profile', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({
				code: 'SERVICE_UNAVAILABLE',
				message: 'Account temporarily unavailable.'
			})
		})
	);
	await page.getByRole('button', { name: 'Refresh account' }).click();
	await expect(page.getByRole('alert')).toContainText('Account temporarily unavailable');
	await expect(page.getByRole('region', { name: 'Account details' })).toHaveCount(0);
	await page.unroute('**/api/v1/auth/profile');
	await page.getByRole('button', { name: 'Refresh account' }).click();
	await expect(page.getByRole('region', { name: 'Account details' })).toBeVisible();
	await page.context().clearCookies();
	await page.getByRole('button', { name: 'Refresh account' }).click();
	await expect(page.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
});
