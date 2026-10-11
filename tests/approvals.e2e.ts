import { inspectWidths } from './responsive.js';
import { openNavigation } from './workspace.js';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
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
	await page.getByLabel('Staff Email').fill(f.people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(f.password);
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
	await page.goto('/vendors');
}
async function prepare(page: Page, role: string, action: string, reason = '') {
	await page.getByRole('button', { name: action, exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Sign Requisition' });
	if (reason) await dialog.getByLabel('Reason', { exact: true }).fill(reason);
	await dialog.getByLabel('Your Password').fill(fixture().password);
	await dialog.getByRole('button', { name: 'Continue to Signature' }).click();
	await dialog.getByLabel('Confirm Your Full Name').fill('Synthetic ' + role);
	await dialog.getByLabel('Draw Your Signature').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await dialog.getByRole('checkbox').check();
	if (role === 'hod' && action === 'Approve') await inspectWidths(page, 'signing-dialog');
	return dialog;
}
async function sign(page: Page, role: string, action: string, reason = '') {
	const dialog = await prepare(page, role, action, reason);
	if (reason) await expect(dialog.getByText(reason, { exact: false })).toBeVisible();
	const label =
		action === 'Review & Submit'
			? 'Submit Requisition'
			: action === 'Return for Revision'
				? action
				: action + ' Requisition';
	await dialog.getByRole('button', { name: label, exact: true }).click();
	await expect(dialog).not.toBeVisible();
}
async function create(page: Page, amount: string) {
	await login(page, 'requester');
	await page.goto('/requisitions/new');
	const title = 'Approval journey ' + randomUUID();
	await page.getByLabel('Vendor Name', { exact: true }).fill('Synthetic approval supplier');
	await page.getByLabel('Description of Work or Purchase').fill(title);
	await page.getByLabel('Location', { exact: true }).fill('Abuja');
	await page.getByRole('button', { name: '+ Add Item', exact: true }).click();
	await page.getByLabel('Item 1', { exact: true }).fill('Office materials');
	await page.getByLabel('Unit Price (₦)', { exact: true }).fill(amount);
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	return { title, url: page.url() };
}

test('ordinary staff have no approval navigation and inbox links return to requisitions', async ({
	page
}) => {
	for (const role of ['requester', 'admin', 'readonly']) {
		await login(page, role);
		await expect(page.getByRole('link', { name: 'My Tasks', exact: true })).toHaveCount(0);
		await page.goto('/requisitions?inbox=true');
		await expect(page).toHaveURL(/\/requisitions$/);
		await expect(page.getByRole('heading', { name: 'Requisitions', exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Approval Inbox', exact: true })).toHaveCount(0);
	}
	await login(page, 'hod');
	await expect(page.getByRole('link', { name: 'My Tasks', exact: true })).toBeVisible();
	await openNavigation(page);
	await page.getByRole('link', { name: 'My Tasks', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Approval Inbox', exact: true })).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'You’re All Caught Up', exact: true })
	).toBeVisible();
});

for (const [amount, role] of [
	['5000000', 'hod'],
	['5000000.01', 'chief_of_staff'],
	['100000000.01', 'md']
]) {
	test(`${role} reviews assigned inbox and signs approval`, async ({ page }) => {
		const req = await create(page, amount);
		await sign(page, 'requester', 'Review & Submit');
		await expect(page.getByText('Awaiting Approval', { exact: true })).toBeVisible();
		await login(page, role);
		await openNavigation(page);
		await page.getByRole('link', { name: 'My Tasks', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Approval Inbox', exact: true })).toBeVisible();
		await page.getByLabel('Search Requisitions').fill(req.title);
		await page.getByRole('button', { name: 'Apply Filters' }).click();
		await expect(page).toHaveURL(/inbox=true/);
		const row = page.getByRole('row').filter({ hasText: req.title });
		if (role === 'hod') await inspectWidths(page, 'approval-inbox');
		if (role === 'hod')
			await page.screenshot({ path: 'test-results/approval-inbox.png', fullPage: true });
		await row.getByRole('link', { name: /^Open / }).click();
		await expect(page.getByRole('heading', { name: req.title, exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit Draft', exact: true })).toHaveCount(0);
		if (role === 'hod') {
			await page.screenshot({ path: 'test-results/approval-desktop.png', fullPage: true });
			await page.setViewportSize({ width: 390, height: 844 });
			await expect
				.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
				.toBe(true);
			await page.screenshot({ path: 'test-results/approval-mobile.png', fullPage: true });
		}
		await sign(page, role, 'Approve');
		await expect(page.getByText('Approved', { exact: true })).toBeVisible();
		await page.reload();
		await expect(page.getByText('Approved', { exact: true })).toBeVisible();
		await openNavigation(page);
		await page.getByRole('link', { name: 'My Tasks', exact: true }).click();
		await expect(page.getByText(req.title, { exact: true })).toHaveCount(0);
		await login(page, 'requester');
		await page.goto(req.url);
		await expect(page.getByText('Approved', { exact: true })).toBeVisible();
	});
}

test('returned request preserves signed evidence, corrects and routes to a different authority', async ({
	page
}) => {
	const req = await create(page, '4000000');
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII=',
		'base64'
	);
	await page
		.getByLabel('Supporting Document', { exact: true })
		.setInputFiles({ name: 'original-quote.png', mimeType: 'image/png', buffer: png });
	await expect(page.getByRole('button', { name: 'View original-quote.png' })).toBeVisible();
	await sign(page, 'requester', 'Review & Submit');
	await login(page, 'hod');
	await page.goto(req.url);
	await sign(page, 'hod', 'Return for Revision', 'Include delivery and a revised quotation.');
	await expect(page.getByText('Returned for Revision', { exact: true })).toBeVisible();
	await login(page, 'requester');
	await page.goto(req.url);
	await expect(
		page.getByText('Include delivery and a revised quotation.', { exact: true })
	).toBeVisible();
	await page.getByRole('button', { name: 'Start Correction', exact: true }).click();
	await page.getByLabel('Unit Price (₦)', { exact: true }).fill('8000000');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: req.title, exact: true })).toBeVisible();
	page.on('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Remove original-quote.png' }).click();
	await expect(page.getByRole('button', { name: 'View original-quote.png' })).toHaveCount(0);
	await page.reload();
	await expect(page.getByText('₦8,000,000.00').first()).toBeVisible();
	await page.getByRole('link', { name: 'View Signed Revision 1', exact: true }).click();
	await expect(page.getByText('₦4,000,000.00').first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'View original-quote.png' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Review & Submit', exact: true })).toHaveCount(0);
	await page.getByRole('link', { name: 'Back to Current Request' }).click();
	await sign(page, 'requester', 'Review & Submit');
	await expect(page.getByText('Chief of Staff', { exact: true })).toBeVisible();
	await login(page, 'hod');
	await page.goto(req.url);
	await expect(page.getByRole('heading', { name: 'Requisition Unavailable' })).toBeVisible();
	await login(page, 'chief_of_staff');
	await page.goto(req.url);
	await sign(page, 'chief_of_staff', 'Reject', 'Budget not available this quarter.');
	await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
	await login(page, 'requester');
	await page.goto(req.url);
	await expect(page.getByText('Budget not available this quarter.', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Start Correction' })).toHaveCount(0);
	await expect(
		page.getByRole('link', { name: 'View Signed Revision 2', exact: true })
	).toBeVisible();
});

test('competing browser decisions require reload and expired sessions cannot sign', async ({
	page
}) => {
	const req = await create(page, '100');
	await sign(page, 'requester', 'Review & Submit');
	await login(page, 'hod');
	await page.goto(req.url);
	const dialog = await prepare(page, 'hod', 'Reject', 'Stale decision must not replace approval.');
	const other = await page.context().newPage();
	await other.goto(req.url);
	await sign(other, 'hod', 'Approve');
	await expect(other.getByText('Approved', { exact: true })).toBeVisible();
	await dialog.getByRole('button', { name: 'Reject Requisition', exact: true }).click();
	await expect(dialog.getByRole('alert')).toBeVisible();
	await expect(
		dialog.getByRole('button', { name: 'Reject Requisition', exact: true })
	).toBeDisabled();
	await dialog.getByRole('button', { name: 'Reload Request to Review Again' }).click();
	await expect(page.getByText('Approved', { exact: true })).toBeVisible();
	await other.close();
	const next = await create(page, '101');
	await sign(page, 'requester', 'Review & Submit');
	await login(page, 'hod');
	await page.goto(next.url);
	await prepare(page, 'hod', 'Approve');
	await page.context().clearCookies();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Approve Requisition', exact: true })
		.click();
	await expect(page).toHaveURL(/\/login$/);
});
