import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function login(page: Page, role = 'oversight') {
	const fixture = JSON.parse(readFileSync('test-results/vendor-fixture.json', 'utf8')) as {
		people: { role: string; email: string }[];
		password: string;
	};
	await page.goto('/login');
	await page
		.getByLabel('Staff Email')
		.fill(fixture.people.find((person) => person.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(fixture.password);
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}
async function fits(page: Page) {
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
}

test('mobile navigation traps focus, dismisses, follows routes and restores desktop navigation', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await login(page);
	const trigger = page.getByRole('button', { name: 'Open Navigation', exact: true });
	const drawer = page.getByRole('dialog', { name: 'Workspace', exact: true });
	await expect(page.getByRole('navigation', { name: 'Main Navigation' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeInViewport();
	await trigger.click();
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	await expect(drawer).toBeVisible();
	await expect(drawer.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(drawer.getByRole('link', { name: 'Staff & Access', exact: true })).toBeVisible();
	await expect(drawer.getByRole('link', { name: 'My Tasks', exact: true })).toHaveCount(0);
	await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
	await drawer.getByRole('button', { name: 'Close Navigation', exact: true }).focus();
	await page.keyboard.press('Shift+Tab');
	await expect(
		drawer.getByRole('link', { name: 'My Account & Security', exact: true })
	).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(drawer.getByRole('button', { name: 'Close Navigation', exact: true })).toBeFocused();
	await page.screenshot({ path: 'test-results/mobile-navigation.png', fullPage: true });
	await page.keyboard.press('Escape');
	await expect(drawer).not.toBeVisible();
	await expect(trigger).toBeFocused();
	await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
	await trigger.click();
	await page.mouse.click(380, 200);
	await expect(drawer).not.toBeVisible();
	await trigger.click();
	await drawer.getByRole('link', { name: 'Vendors', exact: true }).click();
	await expect(page).toHaveURL(/\/vendors$/);
	await expect(drawer).not.toBeVisible();
	await expect(page.getByRole('heading', { name: 'Vendors', exact: true })).toBeInViewport();
	await trigger.click();
	await expect(drawer.getByRole('link', { name: 'Vendors', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(drawer).not.toBeVisible();
	await expect(trigger).not.toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Main Navigation' })).toHaveCount(1);
	await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
	await fits(page);
	await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await login(page, 'owner');
	await trigger.click();
	await expect(drawer.getByRole('link', { name: 'Staff & Access', exact: true })).toHaveCount(0);
	await expect(drawer.getByRole('link', { name: 'My Tasks', exact: true })).toHaveCount(0);
});

test('shared header keeps mobile screens compact and notifications usable', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await login(page);
	for (const path of ['/', '/requisitions', '/vendors', '/staff', '/organisation', '/account']) {
		await page.goto(path);
		await expect(page.locator('main h1').first()).toBeInViewport();
		if (path === '/')
			await expect(
				page.getByRole('button', { name: 'Refresh Dashboard', exact: true })
			).toBeEnabled();
		if (path === '/account')
			await expect(page.getByRole('region', { name: 'Account Details' })).toBeVisible();
		await fits(page);
		expect((await page.locator('main h1').first().boundingBox())!.y).toBeLessThan(180);
		await page.screenshot({
			path: `test-results/mobile-screen-${path.slice(1) || 'dashboard'}.png`,
			fullPage: true
		});
	}
	await page.goto('/');
	for (const width of [320, 390, 768, 900, 1024, 1280]) {
		await page.setViewportSize({ width, height: 844 });
		await fits(page);
		const header = page.getByRole('banner');
		expect((await header.boundingBox())!.height).toBeLessThanOrEqual(82);
		const bell = await header
			.getByRole('button', { name: 'Notifications', exact: true })
			.boundingBox();
		const account = await header
			.getByRole('button', { name: 'Account Menu', exact: true })
			.boundingBox();
		expect(bell!.width).toBeGreaterThanOrEqual(44);
		expect(account!.width).toBeGreaterThanOrEqual(44);
		expect(bell!.x + bell!.width).toBeLessThanOrEqual(account!.x);
	}
	await page.setViewportSize({ width: 320, height: 640 });
	const bell = page.getByRole('button', { name: 'Notifications', exact: true });
	await bell.click();
	const alerts = page.getByRole('dialog', { name: 'Notifications', exact: true });
	await expect(alerts).toBeVisible();
	await expect(
		alerts.getByRole('heading', { name: 'No Notifications Yet', exact: true })
	).toBeVisible();
	await fits(page);
	await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
	await page.screenshot({ path: 'test-results/mobile-notifications-320.png', fullPage: true });
	await page.keyboard.press('Escape');
	await expect(alerts).not.toBeVisible();
	await expect(bell).toBeFocused();
	await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('account dropdown handles long identity, keyboard dismissal and failed then successful sign-out', async ({
	page
}) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await login(page);
	// Display-only stress case; authentication and sign-out still use the real backend.
	const name = 'Synthetic staff member with a very long display name';
	const email = 'synthetic-long-account-address-for-mobile-layout@example.com';
	await page.route('**/api/v1/auth/me', async (route) => {
		const response = await route.fetch();
		await route.fulfill({ response, json: { ...(await response.json()), name, email } });
	});
	await page.reload();
	await expect(page.getByRole('button', { name: 'Refresh Dashboard', exact: true })).toBeEnabled();
	const account = page.getByRole('button', { name: 'Account Menu', exact: true });
	await account.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByText(email, { exact: true })).toBeVisible();
	await fits(page);
	await page.screenshot({ path: 'test-results/mobile-account-320.png', fullPage: true });
	await page.keyboard.press('Escape');
	await expect(account).toBeFocused();
	await expect(page.getByText(email, { exact: true })).not.toBeVisible();
	await account.click();
	await page.mouse.click(4, 200);
	await expect(page.getByText(email, { exact: true })).not.toBeVisible();
	await account.click();
	await page.getByRole('link', { name: 'My Account & Security', exact: true }).click();
	await expect(page).toHaveURL(/\/account$/);
	await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).not.toBeVisible();
	await account.click();
	await page.route('**/api/v1/auth/logout', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({
				code: 'SERVICE_UNAVAILABLE',
				message: 'Sign-out temporarily unavailable.'
			})
		})
	);
	await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('Sign-out temporarily unavailable.');
	await page.unroute('**/api/v1/auth/logout');
	await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Sign In to Custodian', exact: true })
	).toBeVisible();
	await page.goto('/');
	await expect(
		page.getByRole('heading', { name: 'Sign In to Custodian', exact: true })
	).toBeVisible();
});

test('login password visibility and shared branding work on narrow screens', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 740 });
	const copyright = '© 2026 Brendan Nicholas Holdings. All rights reserved.';
	await page.goto('/login');
	const password = page.getByLabel('Password', { exact: true });
	await password.fill('Synthetic visibility check');
	await expect(password).toHaveAttribute('type', 'password');
	await page.getByRole('button', { name: 'Show Password', exact: true }).click();
	await expect(password).toHaveAttribute('type', 'text');
	await expect(password).toHaveValue('Synthetic visibility check');
	await page.getByRole('button', { name: 'Hide Password', exact: true }).click();
	await expect(password).toHaveAttribute('type', 'password');
	await expect(
		page.getByText(
			'One place to raise requisitions, review requests and keep a clear record of every decision.'
		)
	).toHaveCount(0);
	for (const path of ['/login', '/forgot-password', '/set-password', '/missing-page']) {
		await page.goto(path);
		await expect(page.getByRole('contentinfo')).toHaveText(copyright);
		await expect(page.locator('img[src="/logo.png"]')).toBeVisible();
		await fits(page);
	}
	await login(page, 'requester');
	for (const path of ['/', '/requisitions', '/requisitions/new', '/vendors', '/account']) {
		await page.goto(path);
		await expect(page.getByRole('contentinfo')).toHaveText(copyright);
		await expect(page.locator('.mobile-brand img')).toBeVisible();
		await fits(page);
	}
	await page.screenshot({ path: 'test-results/new-branding-mobile.png', fullPage: true });
});
