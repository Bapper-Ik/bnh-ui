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
async function openTask(page: Page, title: string) {
	await page.getByRole('link', { name: 'My Tasks', exact: true }).click();
	await page.getByLabel('Search requisitions').fill(title);
	await page.getByRole('button', { name: 'Apply filters' }).click();
	await page
		.getByRole('row')
		.filter({ hasText: title })
		.getByRole('link', { name: /^Open / })
		.click();
	await expect(page.getByRole('heading', { name: 'Board resolution', exact: true })).toBeVisible();
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

test('Board correction and later decision preserve a conditional hold with two signatures', async ({
	page
}) => {
	test.setTimeout(90000);
	const req = await create(page, 'md', '1');
	await login(page, 'secretary');
	await openTask(page, req.title);
	await fillRecord(page, 'CONDITIONAL_APPROVE');
	await page.reload();
	await expect(page.getByLabel('Resolution reference', { exact: true })).toHaveValue('SYN-001');
	await expect(
		page.getByRole('button', { name: 'Review & submit to Chairman', exact: true })
	).toBeDisabled();
	await evidence(page);
	await page.getByRole('button', { name: 'View', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Document viewer' })).toBeVisible();
	await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
	await page.getByRole('button', { name: 'Close document', exact: true }).click();
	await page.screenshot({ path: 'test-results/board-secretary-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.screenshot({ path: 'test-results/board-secretary-mobile.png', fullPage: true });
	await page.setViewportSize({ width: 1280, height: 900 });
	await sign(page, 'secretary', 'Review & submit to Chairman', 'Submit Board record');
	await expect(
		page.getByRole('button', { name: 'Confirm Board decision', exact: true })
	).toHaveCount(0);
	await login(page, 'chairman');
	await openTask(page, req.title);
	await expect(page.getByLabel('Decision text', { exact: true })).toHaveCount(0);
	await page.screenshot({ path: 'test-results/board-chairman-desktop.png', fullPage: true });
	await sign(
		page,
		'chairman',
		'Return record to Secretary',
		'Return record to Secretary',
		'Correct the meeting reference.'
	);
	await login(page, 'secretary');
	await openTask(page, req.title);
	await page.getByRole('button', { name: 'Start record correction' }).click();
	await page.getByLabel('Resolution reference', { exact: true }).fill('SYN-002');
	await page.getByLabel('Correction summary', { exact: true }).fill('Corrected meeting reference');
	await page.getByRole('button', { name: 'Save resolution draft', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Review & submit to Chairman', exact: true })
	).toBeEnabled();
	await sign(page, 'secretary', 'Review & submit to Chairman', 'Submit Board record');
	await login(page, 'chairman');
	await openTask(page, req.title);
	await sign(page, 'chairman', 'Confirm Board decision', 'Confirm Board decision');
	await expect(page.locator('.status')).toHaveText('Conditional approval — on hold');
	await login(page, 'secretary');
	await openTask(page, req.title);
	await page.getByRole('button', { name: 'Record later resolution' }).click();
	await page.getByLabel('Actual meeting date', { exact: true }).fill('2026-01-02');
	await page.getByLabel('Resolution reference', { exact: true }).fill('SYN-003');
	await page
		.getByLabel('Decision text', { exact: true })
		.fill('Permit obtained, Board authorises request.');
	await page
		.getByRole('combobox', { name: 'Meeting outcome', exact: true })
		.selectOption('APPROVE');
	await page.getByRole('checkbox').check();
	await page.getByRole('button', { name: 'Save resolution draft', exact: true }).click();
	await expect(page.locator('.status')).toHaveText('Conditional approval — on hold');
	await evidence(page);
	await sign(page, 'secretary', 'Review & submit to Chairman', 'Submit Board record');
	await expect(page.locator('.status')).toHaveText('Conditional approval — on hold');
	await login(page, 'chairman');
	await openTask(page, req.title);
	await sign(page, 'chairman', 'Confirm Board decision', 'Confirm Board decision');
	await expect(page.locator('.status')).toHaveText('Approved');
	await expect(page.getByText('Record 1 · initial · Returned to Secretary')).toBeVisible();
	await login(page, 'md');
	await page.goto(req.url);
	await expect(page.locator('.status')).toHaveText('Approved');
	await expect(page.getByRole('link', { name: 'Open Board workspace' })).toHaveCount(0);
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
		await sign(page, 'secretary', 'Review & submit to Chairman', 'Submit Board record');
		await login(page, 'chairman');
		await openTask(page, req.title);
		await sign(page, 'chairman', 'Confirm Board decision', 'Confirm Board decision');
		await expect(page.locator('.status')).toHaveText(status);
		await login(page, 'requester');
		await page.goto(req.url);
		await expect(page.locator('.status')).toHaveText(status);
		await expect(page.getByRole('link', { name: 'My Tasks', exact: true })).toHaveCount(0);
	});
}
