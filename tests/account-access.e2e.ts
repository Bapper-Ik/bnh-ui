import { inspectWidths } from './responsive.js';
import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

function credentials(role = 'access') {
	const data = JSON.parse(readFileSync('test-results/vendor-fixture.json', 'utf8')) as {
		people: { role: string; email: string }[];
		password: string;
	};
	return { email: data.people.find((p) => p.role === role)!.email, password: data.password };
}
async function mailedLink(email: string) {
	const path = 'test-results/mailbox/' + createHash('sha256').update(email).digest('hex') + '.json';
	await expect.poll(() => existsSync(path), { timeout: 20000 }).toBe(true);
	return JSON.parse(readFileSync(path, 'utf8')) as { purpose: string; url: string };
}
async function login(page: Page, email: string, password: string) {
	await page.goto('/login');
	await page.getByLabel('Work email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
	await page.goto('/vendors');
}

test('forgot password through delivered link, password matching, revoked sessions and replay', async ({
	page,
	browser
}) => {
	const staff = credentials();
	await login(page, staff.email, staff.password);
	const oldSession = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const otherSessionPage = await oldSession.newPage();
	await login(otherSessionPage, staff.email, staff.password);
	const logoutResponse = page.waitForResponse((response) =>
		response.url().endsWith('/api/v1/auth/logout')
	);
	await page.getByRole('button', { name: 'Account menu', exact: true }).click();
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	const logout = await logoutResponse;
	expect(logout.status(), await logout.text()).toBe(200);
	await page.getByRole('link', { name: 'Forgot password?' }).click();
	await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
	await page.getByLabel('Work email').fill(staff.email);
	await page.getByRole('button', { name: 'Send password link' }).click();
	await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
	expect((await otherSessionPage.request.get('/api/v1/auth/me')).status()).toBe(200);
	const mail = await mailedLink(staff.email);
	expect(mail.purpose).toBe('reset');
	await page.goto(mail.url);
	await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
	expect(new URL(page.url()).hash).toBe('');
	const stored = await page.evaluate(() =>
		JSON.stringify({
			local: { ...localStorage },
			session: { ...sessionStorage },
			history: history.state
		})
	);
	const rawToken = new URLSearchParams(new URL(mail.url).hash.slice(1)).get('token')!;
	expect(stored).not.toContain(rawToken);
	expect(stored).not.toContain(staff.password);
	await page
		.getByLabel('New password', { exact: true })
		.fill('Synthetic-new-browser-password-2026');
	await page.getByLabel('Confirm new password').fill('Synthetic-mismatching-password-2026');
	await page.getByRole('button', { name: 'Set password', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('do not match');
	await page.getByLabel('Confirm new password').fill('Synthetic-new-browser-password-2026');
	await inspectWidths(page, 'set-password');
	await page.screenshot({ path: 'test-results/account-reset-desktop.png', fullPage: true });
	await page.getByRole('button', { name: 'Set password', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Your password is set' })).toBeVisible();
	await otherSessionPage.goto('/vendors');
	await expect(
		otherSessionPage.getByRole('heading', { name: 'Sign in to Custodian' })
	).toBeVisible();
	await oldSession.close();
	await page.goto(mail.url);
	await expect(page.getByRole('heading', { name: 'This link is unavailable' })).toBeVisible();
	await page.getByRole('link', { name: 'Request a new link' }).click();
	await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
	await login(page, staff.email, 'Synthetic-new-browser-password-2026');
});

test('protected invitation activates on the shared screen without granting authority', async ({
	page
}) => {
	const staff = credentials('inviter');
	await login(page, staff.email, staff.password);
	const email = 'invited-' + randomUUID() + '@example.com';
	const csrf = (await page.context().cookies()).find((c) => c.name === 'custodian_csrf')!.value;
	const response = await page.request.post('/api/v1/auth/invitations', {
		data: { name: 'Synthetic invited staff', email },
		headers: { origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrf }
	});
	expect(response.status()).toBe(201);
	const mail = await mailedLink(email);
	expect(mail.purpose).toBe('activate');
	await page.getByRole('button', { name: 'Account menu', exact: true }).click();
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
	await page.goto(mail.url);
	await expect(page.getByRole('heading', { name: 'Activate your account' })).toBeVisible();
	await inspectWidths(page, 'activate-account');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
	await page.screenshot({ path: 'test-results/account-activate-mobile.png', fullPage: true });
	await page.getByLabel('New password', { exact: true }).fill('Synthetic-invite-password-2026');
	await page.getByLabel('Confirm new password').fill('Synthetic-invite-password-2026');
	await page.getByRole('button', { name: 'Activate account', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('account is ready');
	await login(page, email, 'Synthetic-invite-password-2026');
	await expect(page.getByRole('heading', { name: 'No active company membership' })).toBeVisible();
	const current = await page.request.get('/api/v1/auth/me');
	expect((await current.json()).permissions).toEqual([]);
});

test('missing and malformed recovery links offer a safe new-link path', async ({ page }) => {
	await page.goto('/recover');
	await expect(page.getByRole('heading', { name: 'This link is unavailable' })).toBeVisible();
	await page.goto('/recover#token=invalid');
	await expect(page.getByRole('heading', { name: 'This link is unavailable' })).toBeVisible();
	expect(new URL(page.url()).hash).toBe('');
	await page.getByRole('link', { name: 'Request a new link' }).click();
	await page.getByLabel('Work email').fill('unregistered-' + randomUUID() + '@example.com');
	await page.getByRole('button', { name: 'Send password link' }).click();
	await expect(page.getByRole('status')).toContainText(
		'If this email belongs to an eligible account'
	);
});

test('unavailable session service shows a safe recoverable error state', async ({ page }) => {
	await page.route('**/api/v1/auth/me', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Synthetic service outage' })
		})
	);
	await page.goto('/vendors');
	await expect(page.getByRole('heading', { name: 'Unable to load this page' })).toBeVisible();
	await expect(page.getByRole('alert')).toHaveText('Your request could not be completed.');
	await page.unroute('**/api/v1/auth/me');
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
});
