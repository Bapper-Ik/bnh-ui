import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

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
async function sign(page: Page, role: string, button: string, confirm: string, reason = '') {
	await page.getByRole('button', { name: button, exact: true }).click();
	const dialog = page.getByRole('dialog');
	if (reason) await dialog.getByLabel('Reason', { exact: true }).fill(reason);
	await dialog.getByLabel('Your password').fill(fixture().password);
	await dialog.getByRole('button', { name: 'Continue to signature' }).click();
	await dialog.getByLabel('Confirm your full name').fill('Synthetic ' + role);
	await dialog.getByLabel('Draw your signature').focus();
	for (const key of ['Enter', 'ArrowRight', 'ArrowDown', 'Enter']) await page.keyboard.press(key);
	await dialog.getByRole('checkbox').check();
	await dialog.getByRole('button', { name: confirm, exact: true }).click();
	await expect(dialog).not.toBeVisible();
}
async function create(page: Page, role: string, amount: string) {
	await login(page, role);
	await page.goto('/requisitions/new');
	const title = 'Board journey ' + randomUUID();
	await page.getByLabel('Vendor name', { exact: true }).fill('Synthetic Board supplier');
	await page.getByLabel('Description of work or purchase').fill(title);
	await page.getByLabel('Location', { exact: true }).fill('Abuja');
	await page.getByRole('button', { name: '+ Add item', exact: true }).click();
	await page.getByLabel('Item 1', { exact: true }).fill('Equipment');
	await page.getByLabel('Unit price (₦)', { exact: true }).fill(amount);
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	const url = page.url();
	await sign(page, role, 'Review & submit', 'Submit requisition');
	await expect(page.getByText('Awaiting Board resolution', { exact: true })).toBeVisible();
	return { url, title };
}
async function fillRecord(page: Page, outcome: string) {
	await page.getByLabel('Actual meeting date', { exact: true }).fill('2026-01-01');
	await page.getByLabel('Resolution reference', { exact: true }).fill('SYN-001');
	await page.getByRole('combobox', { name: 'Meeting outcome', exact: true }).selectOption(outcome);
	await page.getByLabel('Decision text', { exact: true }).fill('Synthetic actual Board decision');
	if (outcome === 'CONDITIONAL_APPROVE')
		await page
			.getByLabel('Conditions / follow-up', { exact: true })
			.fill('Permit required before authorisation can proceed.');
	await page.getByLabel('Attendance / participants', { exact: true }).fill('Synthetic directors');
	await page
		.getByLabel('Quorum basis / policy reference', { exact: true })
		.fill('Synthetic Board charter');
	await page.getByRole('checkbox').check();
	await page.getByRole('button', { name: 'Save resolution draft', exact: true }).click();
	await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
}
async function evidence(page: Page) {
	await page.getByLabel('Attach evidence', { exact: true }).setInputFiles({
		name: 'formal-resolution.png',
		mimeType: 'image/png',
		buffer: Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII=',
			'base64'
		)
	});
	await expect(
		page.getByRole('button', { name: 'Review & submit to Chairman', exact: true })
	).toBeEnabled();
}

async function openAlerts(page: Page, title: string, reference: string) {
	await page.getByRole('button', { name: 'Notifications', exact: true }).click();
	const drawer = page.getByRole('dialog', { name: 'Notifications', exact: true });
	const row = drawer
		.getByRole('listitem')
		.filter({ hasText: reference })
		.filter({ hasText: title });
	await expect(async () => {
		await drawer.getByRole('button', { name: 'Refresh notifications' }).click();
		await expect(row).toBeVisible();
	}).toPass({ timeout: 15000 });
	return { drawer, row };
}
function mails(reference: string, title: string) {
	const dir = 'test-results/notification-mailbox';
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.map(
			(name) =>
				JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')) as {
					recipient: string;
					reference: string;
					title: string;
					url: string;
				}
		)
		.filter((item) => item.reference === reference && item.title === title);
}
async function reference(page: Page) {
	const text = await page.locator('main').innerText();
	return text.match(/BNH-[\w-]+/)![0];
}

test('notification opens assigned work; read state survives refresh and email has authenticated link', async ({
	page
}) => {
	await login(page, 'requester');
	await page.goto('/requisitions/new');
	const title = 'Notification journey ' + randomUUID();
	await page.getByLabel('Vendor name', { exact: true }).fill('Synthetic notifications supplier');
	await page.getByLabel('Description of work or purchase').fill(title);
	await page.getByLabel('Location', { exact: true }).fill('Abuja');
	await page.getByRole('button', { name: '+ Add item', exact: true }).click();
	await page.getByLabel('Item 1', { exact: true }).fill('Materials');
	await page.getByLabel('Unit price (₦)', { exact: true }).fill('100');
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	const reqUrl = page.url(),
		ref = await reference(page);
	await sign(page, 'requester', 'Review & submit', 'Submit requisition');
	await expect(page.getByText('Awaiting approval', { exact: true })).toBeVisible();
	await expect.poll(() => mails(ref, 'Requisition needs your review').length).toBe(1);
	const email = mails(ref, 'Requisition needs your review')[0];
	expect(email.recipient).toBe(fixture().people.find((p) => p.role === 'hod')!.email);
	expect(email.url).toBe(reqUrl);
	await login(page, 'hod');
	let alerts = await openAlerts(page, 'Requisition needs your review', ref);
	await alerts.row.getByRole('button', { name: 'Mark as read' }).click();
	await expect(alerts.row.getByText('Unread', { exact: true })).toHaveCount(0);
	await page.reload();
	alerts = await openAlerts(page, 'Requisition needs your review', ref);
	await expect(alerts.row.getByRole('button', { name: 'Mark as read' })).toHaveCount(0);
	await page.screenshot({ path: 'test-results/notifications-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.screenshot({ path: 'test-results/notifications-mobile.png', fullPage: true });
	await alerts.row.getByRole('button', { name: 'Open requisition', exact: true }).click();
	await expect(page).toHaveURL(reqUrl);
	await expect(page.getByText('Awaiting approval', { exact: true })).toBeVisible();
	await sign(page, 'hod', 'Approve', 'Approve requisition');
	await login(page, 'requester');
	alerts = await openAlerts(page, 'Requisition approved', ref);
	await alerts.row.getByRole('button', { name: 'Open requisition', exact: true }).click();
	await expect(page.getByText('Approved', { exact: true })).toBeVisible();
	await login(page, 'peer');
	await page.getByRole('button', { name: 'Notifications', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'No notifications yet' })).toBeVisible();
	await expect(page.getByRole('dialog').getByText(ref, { exact: false })).toHaveCount(0);
});

test('Board alerts hand off from Secretary to Chairman and report the actual hold to requester', async ({
	page
}) => {
	test.setTimeout(90000);
	const req = await create(page, 'md', '1');
	const ref = await reference(page);
	await login(page, 'secretary');
	let alerts = await openAlerts(page, 'Board resolution needs recording', ref);
	await alerts.row.getByRole('button', { name: 'Open Board workspace' }).click();
	await expect(page.getByRole('heading', { name: 'Board resolution', exact: true })).toBeVisible();
	await fillRecord(page, 'CONDITIONAL_APPROVE');
	await evidence(page);
	await sign(page, 'secretary', 'Review & submit to Chairman', 'Submit Board record');
	await login(page, 'chairman');
	alerts = await openAlerts(page, 'Board record needs your review', ref);
	await alerts.row.getByRole('button', { name: 'Open Board workspace' }).click();
	await sign(page, 'chairman', 'Confirm Board decision', 'Confirm Board decision');
	await login(page, 'md');
	alerts = await openAlerts(page, 'Conditional Board approval confirmed — on hold', ref);
	await expect(alerts.row.getByRole('button', { name: 'Open Board workspace' })).toHaveCount(0);
	await alerts.row.getByRole('button', { name: 'Open requisition', exact: true }).click();
	await expect(page).toHaveURL(req.url);
	await expect(page.locator('.status')).toHaveText('Conditional approval — on hold');
	await login(page, 'secretary');
	alerts = await openAlerts(page, 'Later Board resolution required — hold remains', ref);
	await alerts.row.getByRole('button', { name: 'Open Board workspace' }).click();
	await expect(page.getByRole('button', { name: 'Record later resolution' })).toBeVisible();
});

test('drawer clears stale alerts on failure, retries and redirects an expired session', async ({
	page
}) => {
	await login(page, 'peer');
	await page.route('**/api/v1/notifications?**', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({
				error: { code: 'SERVICE_UNAVAILABLE', message: 'Notifications temporarily unavailable' }
			})
		})
	);
	await page.getByRole('button', { name: 'Notifications', exact: true }).click();
	const drawer = page.getByRole('dialog', { name: 'Notifications', exact: true });
	await expect(drawer.getByRole('alert')).toBeVisible();
	await expect(drawer.getByRole('listitem')).toHaveCount(0);
	await page.unroute('**/api/v1/notifications?**');
	await drawer.getByRole('button', { name: 'Retry notifications' }).click();
	await expect(drawer.getByRole('heading', { name: 'No notifications yet' })).toBeVisible();
	await page.context().clearCookies();
	await drawer.getByRole('button', { name: 'Refresh notifications' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toHaveCount(0);
});

test('focus refreshes coalesce while the notification request is still running', async ({
	page
}) => {
	await login(page, 'peer');
	await page.getByRole('button', { name: 'Notifications', exact: true }).click();
	const drawer = page.getByRole('dialog', { name: 'Notifications', exact: true });
	await expect(drawer.getByRole('button', { name: 'Refresh notifications' })).toBeEnabled();
	await drawer.getByRole('button', { name: 'Close notifications' }).click();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const calls: string[] = [];
	await page.route('**/api/v1/notifications?**', async (route) => {
		calls.push(route.request().url());
		if (calls.length === 1) await gate;
		await route.continue();
	});
	try {
		await page.getByRole('button', { name: 'Notifications', exact: true }).click();
		await expect.poll(() => calls.length).toBe(1);
		await page.evaluate(() => {
			for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('focus'));
		});
		await drawer.getByLabel('Unread only').check();
		expect(calls.length).toBe(1);
		release();
		await expect(drawer.getByRole('heading', { name: 'No unread notifications' })).toBeVisible();
		await expect(drawer.getByRole('button', { name: 'Refresh notifications' })).toBeEnabled();
		expect(calls).toHaveLength(2);
		expect(calls[1]).toContain('unread=true');
	} finally {
		release();
	}
});
