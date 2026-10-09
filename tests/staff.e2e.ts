import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

type Fixture = {
	people: { role: string; email: string }[];
	password: string;
	entity: string;
	entity_name: string;
	department: string;
};
function fixture() {
	return JSON.parse(readFileSync('test-results/vendor-fixture.json', 'utf8')) as Fixture;
}
async function login(page: Page, role: string) {
	const data = fixture();
	await page.goto('/login');
	await page.getByLabel('Work email').fill(data.people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(data.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
	await page.goto('/vendors');
}
async function search(page: Page, value: string) {
	await page.getByLabel('Search staff').fill(value);
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.locator('tbody tr')).toHaveCount(1);
}
async function openManaged(page: Page) {
	await page.goto('/staff');
	await search(page, fixture().people.find((p) => p.role === 'managed')!.email);
	await page
		.locator('tbody')
		.getByRole('button', { name: /^Manage / })
		.click();
	await expect(page.getByRole('dialog')).toBeVisible();
}
async function capturedLink(email: string) {
	const path = 'test-results/mailbox/' + createHash('sha256').update(email).digest('hex') + '.json';
	await expect.poll(() => existsSync(path), { timeout: 20000 }).toBe(true);
	return JSON.parse(readFileSync(path, 'utf8')) as { url: string };
}

test('staff invitation, resend and activation through the management drawer', async ({
	page,
	browser
}) => {
	await login(page, 'admin');
	await page.getByRole('link', { name: 'Staff & Access' }).click();
	await expect(page.getByRole('heading', { name: 'Staff & Access', exact: true })).toBeVisible();
	const email = 'staff-screen-' + randomUUID() + '@example.com';
	await page.getByRole('button', { name: 'Invite staff', exact: true }).click();
	await page.getByLabel('Full name').fill('Synthetic staff invitation');
	await page.getByLabel('Work email').fill(email);
	await page.getByRole('button', { name: 'Send invitation' }).click();
	const drawer = page.getByRole('dialog');
	await expect(drawer.getByRole('heading', { name: 'Synthetic staff invitation' })).toBeVisible();
	await expect(drawer).toContainText('Invitation pending');
	const original = await capturedLink(email);
	await drawer.getByRole('button', { name: 'Resend invitation' }).click();
	await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(drawer.getByRole('heading', { name: 'Synthetic staff invitation' })).toBeVisible();
	await expect
		.poll(async () => (await capturedLink(email)).url, { timeout: 20000 })
		.not.toBe(original.url);
	const mail = await capturedLink(email);
	const context = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const invitee = await context.newPage();
	await invitee.goto(original.url);
	await expect(invitee.getByRole('heading', { name: 'This link is unavailable' })).toBeVisible();
	await invitee.goto(mail.url);
	await expect(invitee.getByRole('heading', { name: 'Activate your account' })).toBeVisible();
	await invitee
		.getByLabel('New password', { exact: true })
		.fill('Synthetic-activated-staff-password');
	await invitee.getByLabel('Confirm new password').fill('Synthetic-activated-staff-password');
	await invitee.getByRole('button', { name: 'Activate account' }).click();
	await expect(invitee.getByRole('status')).toContainText('account is ready');
	await context.close();
	await drawer.getByRole('button', { name: 'Close staff drawer' }).click();
	await search(page, email);
	await expect(page.locator('tbody tr')).toContainText('Active');
	await page.getByRole('button', { name: 'Manage Synthetic staff invitation' }).click();
	await expect(drawer.getByRole('button', { name: 'Resend invitation' })).toHaveCount(0);
	await drawer.getByRole('button', { name: 'Set membership' }).click();
	await drawer
		.getByRole('combobox', { name: 'Company', exact: true })
		.selectOption(fixture().entity);
	await drawer
		.getByRole('combobox', { name: 'Department', exact: true })
		.selectOption(fixture().department);
	await drawer.getByRole('button', { name: 'Save membership' }).click();
	await expect(drawer).toContainText('Membership enabled');
	await drawer.getByRole('button', { name: 'Assign office' }).click();
	await drawer.getByRole('combobox', { name: 'Office', exact: true }).selectOption('secretary');
	await drawer.getByLabel('Authorisation reference').fill('Synthetic appointment reference');
	await drawer.getByRole('button', { name: 'Record appointment' }).click();
	await expect(drawer.getByText('Company Secretary', { exact: true })).toBeVisible();
	await drawer.getByRole('button', { name: 'Assign office' }).click();
	await drawer.getByRole('combobox', { name: 'Office', exact: true }).selectOption('chairman');
	await drawer.getByLabel('Authorisation reference').fill('Synthetic conflicting appointment');
	await drawer.getByRole('button', { name: 'Record appointment' }).click();
	await expect(drawer.getByRole('alert')).toContainText('different people');
	await drawer.getByRole('button', { name: 'Back to details' }).click();
	await drawer.getByRole('button', { name: 'Discard changes' }).click();
	await drawer.getByRole('button', { name: 'Revoke appointment' }).click();
	await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(drawer).toContainText('Revoked');
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
	await drawer.evaluate((element) => {
		element.scrollTop = 0;
	});
	await page.screenshot({ path: 'test-results/staff-mobile.png', fullPage: false });
});

test('staff stale edits preserve input and disabling/revoking ends sessions', async ({
	page,
	browser
}) => {
	await login(page, 'admin');
	await openManaged(page);
	const drawer = page.getByRole('dialog');
	await drawer.getByRole('button', { name: 'Edit name' }).click();
	await drawer.getByLabel('Full name').fill('Unsaved staff name');
	const context = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const peer = await context.newPage();
	await login(peer, 'admin_peer');
	await openManaged(peer);
	await peer.getByRole('dialog').getByRole('button', { name: 'Edit name' }).click();
	await peer.getByLabel('Full name').fill('Updated managed staff');
	await peer.getByRole('button', { name: 'Save name' }).click();
	await expect(
		peer.getByRole('dialog').getByRole('heading', { name: 'Updated managed staff' })
	).toBeVisible();
	await drawer.getByRole('button', { name: 'Save name' }).click();
	await expect(drawer.getByRole('alert')).toContainText('record changed');
	await expect(drawer.getByLabel('Full name')).toHaveValue('Unsaved staff name');
	await drawer.getByRole('button', { name: 'Discard entries and reload' }).click();
	await expect(drawer.getByRole('heading', { name: 'Updated managed staff' })).toBeVisible();
	const target = await context.newPage();
	await login(target, 'managed');
	await drawer.getByRole('button', { name: 'Disable account' }).click();
	await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(drawer.locator('.status')).toHaveText('Disabled');
	await target.goto('/vendors');
	await expect(target.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
	await drawer.getByRole('button', { name: 'Enable account' }).click();
	await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(drawer.locator('.status')).toHaveText('Active');
	await login(target, 'managed');
	await drawer.getByRole('button', { name: 'Sign out all sessions' }).click();
	await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(drawer.getByRole('heading', { name: 'Updated managed staff' })).toBeVisible();
	await target.goto('/vendors');
	await expect(target.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
	await context.close();
	await drawer.getByRole('button', { name: 'Close staff drawer' }).click();
	await page.screenshot({ path: 'test-results/staff-desktop.png', fullPage: true });
});

test('staff deep links deny ordinary staff and own authority controls are absent', async ({
	page
}) => {
	await login(page, 'owner');
	await expect(page.getByRole('link', { name: 'Staff & Access' })).toHaveCount(0);
	await page.goto('/staff');
	await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
	await expect(page.locator('table')).toHaveCount(0);
	await page.getByRole('button', { name: 'Account menu', exact: true }).click();
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
	await login(page, 'admin');
	await page.goto('/staff');
	await search(page, fixture().people.find((p) => p.role === 'admin')!.email);
	await page.getByRole('button', { name: 'Manage Synthetic admin', exact: true }).click();
	const drawer = page.getByRole('dialog');
	for (const action of ['Disable account', 'Set membership', 'Assign office'])
		await expect(drawer.getByRole('button', { name: action, exact: true })).toHaveCount(0);
	await drawer.getByRole('button', { name: 'Close staff drawer' }).click();
	await page.getByLabel('Search staff').fill('no-matching-' + randomUUID());
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'No matching staff' })).toBeVisible();
	await search(page, fixture().people.find((p) => p.role === 'admin')!.email);
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.locator('body').evaluate((element) => element.scrollWidth <= 390)).toBe(true);
	await page.screenshot({ path: 'test-results/staff-list-mobile.png', fullPage: true });
});

test('revoked administrator session clears the open staff record', async ({ page, browser }) => {
	await login(page, 'admin_peer');
	await openManaged(page);
	await page.getByRole('dialog').getByRole('button', { name: 'Edit name' }).click();
	await page.getByLabel('Full name').fill('Uncommitted revoked-session edit');
	const context = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const operator = await context.newPage();
	await login(operator, 'admin');
	await operator.goto('/staff');
	await search(operator, fixture().people.find((p) => p.role === 'admin_peer')!.email);
	await operator.getByRole('button', { name: 'Manage Synthetic admin_peer', exact: true }).click();
	await operator.getByRole('dialog').getByRole('button', { name: 'Disable account' }).click();
	await operator.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(operator.getByRole('dialog').locator('.status')).toHaveText('Disabled');
	await page.getByRole('button', { name: 'Save name' }).click();
	await expect(page.getByRole('heading', { name: 'Sign in to Custodian' })).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await context.close();
});
