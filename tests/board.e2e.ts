import { inspectWidths } from './responsive.js';
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
async function sign(page: Page, role: string, button: string, confirm: string, reason = '') {
	await page.getByRole('button', { name: button, exact: true }).click();
	const dialog = page.getByRole('dialog');
	if (reason) await dialog.getByLabel('Reason', { exact: true }).fill(reason);
	await dialog.getByLabel('Your Password').fill(fixture().password);
	await dialog.getByRole('button', { name: 'Continue to Signature' }).click();
	await dialog.getByLabel('Confirm Your Full Name').fill('Synthetic ' + role);
	await dialog.getByLabel('Draw Your Signature').focus();
	for (const key of ['Enter', 'ArrowRight', 'ArrowDown', 'Enter']) await page.keyboard.press(key);
	await dialog.getByRole('checkbox').check();
	await dialog.getByRole('button', { name: confirm, exact: true }).click();
	await expect(dialog).not.toBeVisible();
}
async function create(page: Page, role: string, amount: string) {
	await login(page, role);
	await page.goto('/requisitions/new');
	const title = 'Board journey ' + randomUUID();
	await page.getByLabel('Vendor Name', { exact: true }).fill('Synthetic Board supplier');
	await page.getByLabel('Description of Work or Purchase').fill(title);
	await page.getByLabel('Location', { exact: true }).fill('Abuja');
	await page.getByRole('button', { name: '+ Add Item', exact: true }).click();
	await page.getByLabel('Item 1', { exact: true }).fill('Equipment');
	await page.getByLabel('Unit Price (₦)', { exact: true }).fill(amount);
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	const url = page.url();
	await sign(page, role, 'Review & Submit', 'Submit Requisition');
	await expect(page.getByText('Awaiting Board Resolution', { exact: true })).toBeVisible();
	return { url, title };
}
async function openTask(page: Page, title: string) {
	await page.getByRole('link', { name: 'My Tasks', exact: true }).click();
	await page.getByLabel('Search Requisitions').fill(title);
	await page.getByRole('button', { name: 'Apply Filters' }).click();
	await page
		.getByRole('row')
		.filter({ hasText: title })
		.getByRole('link', { name: /^Open / })
		.click();
	await expect(page.getByRole('heading', { name: 'Board Resolution', exact: true })).toBeVisible();
}
async function fillRecord(page: Page, outcome: string) {
	await page.getByLabel('Actual Meeting Date', { exact: true }).fill('2026-01-01');
	await page.getByLabel('Resolution Reference', { exact: true }).fill('SYN-001');
	await page.getByRole('combobox', { name: 'Meeting Outcome', exact: true }).selectOption(outcome);
	await page.getByLabel('Decision Text', { exact: true }).fill('Synthetic actual Board decision');
	if (outcome === 'CONDITIONAL_APPROVE')
		await page
			.getByLabel('Conditions / Follow-Up', { exact: true })
			.fill('Permit required before authorisation can proceed.');
	await page.getByLabel('Attendance / Participants', { exact: true }).fill('Synthetic directors');
	await page
		.getByLabel('Quorum Basis / Policy Reference', { exact: true })
		.fill('Synthetic Board charter');
	await page.getByRole('checkbox').check();
	await page.getByRole('button', { name: 'Save Resolution Draft', exact: true }).click();
	await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
}
async function evidence(page: Page) {
	await page.getByLabel('Attach Evidence', { exact: true }).setInputFiles({
		name: 'formal-resolution.png',
		mimeType: 'image/png',
		buffer: Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII=',
			'base64'
		)
	});
	await expect(
		page.getByRole('button', { name: 'Review & Submit to Chairman', exact: true })
	).toBeEnabled();
}

test('Board correction and later decision preserve a conditional hold with two signatures', async ({
	page
}) => {
	test.setTimeout(90000);
	const req = await create(page, 'md', '1');
	await login(page, 'secretary');
	await openTask(page, req.title);
	await fillRecord(page, 'CONDITIONAL_APPROVE');
	await inspectWidths(page, 'board-secretary');
	await page.reload();
	await expect(page.getByLabel('Resolution Reference', { exact: true })).toHaveValue('SYN-001');
	await expect(
		page.getByRole('button', { name: 'Review & Submit to Chairman', exact: true })
	).toBeDisabled();
	await evidence(page);
	await page.getByRole('button', { name: 'View', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Document Viewer' })).toBeVisible();
	await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
	await page.getByRole('button', { name: 'Close Document', exact: true }).click();
	await page.screenshot({ path: 'test-results/board-secretary-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.screenshot({ path: 'test-results/board-secretary-mobile.png', fullPage: true });
	await page.setViewportSize({ width: 1280, height: 900 });
	await sign(page, 'secretary', 'Review & Submit to Chairman', 'Submit Board Record');
	await expect(
		page.getByRole('button', { name: 'Confirm Board Decision', exact: true })
	).toHaveCount(0);
	await login(page, 'chairman');
	await openTask(page, req.title);
	await expect(page.getByLabel('Decision Text', { exact: true })).toHaveCount(0);
	await inspectWidths(page, 'board-chairman');
	await page.screenshot({ path: 'test-results/board-chairman-desktop.png', fullPage: true });
	await sign(
		page,
		'chairman',
		'Return Record to Secretary',
		'Return Record to Secretary',
		'Correct the meeting reference.'
	);
	await login(page, 'secretary');
	await openTask(page, req.title);
	await page.getByRole('button', { name: 'Start Record Correction' }).click();
	await page.getByLabel('Resolution Reference', { exact: true }).fill('SYN-002');
	await page.getByLabel('Correction Summary', { exact: true }).fill('Corrected meeting reference');
	await page.getByRole('button', { name: 'Save Resolution Draft', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Review & Submit to Chairman', exact: true })
	).toBeEnabled();
	await sign(page, 'secretary', 'Review & Submit to Chairman', 'Submit Board Record');
	await login(page, 'chairman');
	await openTask(page, req.title);
	await sign(page, 'chairman', 'Confirm Board Decision', 'Confirm Board Decision');
	await expect(page.locator('.status')).toHaveText('Conditional Approval — on Hold');
	await login(page, 'secretary');
	await openTask(page, req.title);
	await page.getByRole('button', { name: 'Record Later Resolution' }).click();
	await page.getByLabel('Actual Meeting Date', { exact: true }).fill('2026-01-02');
	await page.getByLabel('Resolution Reference', { exact: true }).fill('SYN-003');
	await page
		.getByLabel('Decision Text', { exact: true })
		.fill('Permit obtained, Board authorises request.');
	await page
		.getByRole('combobox', { name: 'Meeting Outcome', exact: true })
		.selectOption('APPROVE');
	await page.getByRole('checkbox').check();
	await page.getByRole('button', { name: 'Save Resolution Draft', exact: true }).click();
	await expect(page.locator('.status')).toHaveText('Conditional Approval — on Hold');
	await evidence(page);
	await sign(page, 'secretary', 'Review & Submit to Chairman', 'Submit Board Record');
	await expect(page.locator('.status')).toHaveText('Conditional Approval — on Hold');
	await login(page, 'chairman');
	await openTask(page, req.title);
	await sign(page, 'chairman', 'Confirm Board Decision', 'Confirm Board Decision');
	await expect(page.locator('.status')).toHaveText('Approved');
	await expect(
		page.getByText('Record 1 · Initial Resolution · Returned to Secretary')
	).toBeVisible();
	await login(page, 'md');
	await page.goto(req.url);
	await expect(page.locator('.status')).toHaveText('Approved');
	await expect(page.getByRole('link', { name: 'Open Board Workspace' })).toHaveCount(0);
	await page.goto(req.url + '/board');
	await expect(page.getByText('Board case not found.')).toBeVisible();
});

for (const [outcome, status] of [
	['REJECT', 'Rejected'],
	['DEFER', 'Deferred']
]) {
	test(`Chairman preserves actual ${outcome} outcome for a large requisition`, async ({ page }) => {
		const req = await create(page, 'requester', '600000000');
		await login(page, 'secretary');
		await openTask(page, req.title);
		await fillRecord(page, outcome);
		await evidence(page);
		await sign(page, 'secretary', 'Review & Submit to Chairman', 'Submit Board Record');
		await login(page, 'chairman');
		await openTask(page, req.title);
		await sign(page, 'chairman', 'Confirm Board Decision', 'Confirm Board Decision');
		await expect(page.locator('.status')).toHaveText(status);
		await login(page, 'requester');
		await page.goto(req.url);
		await expect(page.locator('.status')).toHaveText(status);
		await expect(page.getByRole('link', { name: 'My Tasks', exact: true })).toHaveCount(0);
	});
}
