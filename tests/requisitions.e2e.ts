import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

function fixture() {
	return JSON.parse(readFileSync('test-results/vendor-fixture.json', 'utf8')) as {
		people: { role: string; email: string }[];
		password: string;
		request_entity: string;
	};
}
async function login(page: Page, role = 'requester') {
	const f = fixture();
	await page.goto('/login');
	await page.getByLabel('Staff Email').fill(f.people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(f.password);
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
	await page.goto('/vendors');
}
async function fill(page: Page, title: string, amount = '71640') {
	await page.getByLabel('Vendor Name', { exact: true }).fill('Synthetic request supplier');
	await page.getByLabel('Description of Work or Purchase').fill(title);
	await page.getByLabel('Location', { exact: true }).fill('Abuja');
	await page.getByRole('button', { name: '+ Add Item', exact: true }).click();
	await page.getByLabel('Item 1', { exact: true }).fill('Office materials');
	await page.getByLabel('Unit Price (₦)', { exact: true }).fill(amount);
}
async function sign(page: Page, name: string) {
	await page.getByRole('button', { name: 'Review & Submit', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Sign Requisition' });
	await dialog.getByLabel('Your Password').fill(fixture().password);
	await dialog.getByRole('button', { name: 'Continue to Signature' }).click();
	await dialog.getByLabel('Confirm Your Full Name').fill(name);
	await dialog.getByLabel('Draw Your Signature').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await dialog.getByRole('checkbox').check();
	await dialog.getByRole('button', { name: 'Submit Requisition', exact: true }).click();
	await expect(dialog).not.toBeVisible();
}

test('saved draft survives refresh during detail loading without an HOD', async ({ page }) => {
	await login(page, 'draft_requester');
	await page.goto('/requisitions');
	await page.getByRole('link', { name: '+ New Requisition' }).click();
	const title = 'Draft before submission ' + randomUUID();
	await fill(page, title);
	for (const [name, price] of [
		['Delivery', '5000'],
		['Installation', '20000']
	]) {
		await page.getByRole('button', { name: '+ Add Item', exact: true }).click();
		await page
			.getByLabel(/^Item [0-9]+$/)
			.last()
			.fill(name);
		await page.getByLabel('Unit Price (₦)', { exact: true }).last().fill(price);
	}
	// Hold only the first detail read after a successful database save. A refresh
	// must already target the saved record, even while this read has not completed.
	let releaseDetail!: () => void;
	const detailGate = new Promise<void>((resolve) => {
		releaseDetail = resolve;
	});
	let detailStarted!: (url: string) => void;
	const detailRequest = new Promise<string>((resolve) => {
		detailStarted = resolve;
	});
	let held = false;
	await page.route(/\/api\/v1\/requisitions\/[0-9a-f-]+$/, async (route) => {
		if (!held && route.request().method() === 'GET') {
			held = true;
			detailStarted(route.request().url());
			await detailGate;
			await route.continue().catch(() => {}); // The reload cancels this request.
		} else await route.continue();
	});
	try {
		const savedResponse = page.waitForResponse(
			(response) =>
				response.url().endsWith('/api/v1/requisitions') && response.request().method() === 'POST'
		);
		await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
		const response = await savedResponse;
		expect(response.status()).toBe(201);
		const savedId = new URL(await detailRequest).pathname.split('/').pop()!;
		await expect(page).toHaveURL(new RegExp('/requisitions/' + savedId + '$'));
		await page.reload();
		releaseDetail();
		await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
		await expect(page.getByText(/BNH-[A-Z]{3}-\d{6,}/).first()).toBeVisible();
		await expect(
			page.getByText('Draft saved. You can return to it before submitting.')
		).toBeVisible();
		await expect(page.getByText('₦96,640.00').first()).toBeVisible();
		await expect(page.getByRole('cell').filter({ hasText: /^Delivery$/ })).toBeVisible();
		await expect(page.getByRole('cell').filter({ hasText: /^Installation$/ })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Review & Submit', exact: true })).toBeDisabled();
		await expect(page.getByText(/A unique active hod appointment is required/)).toBeVisible();
		// Saving replaces the empty creation form in history with the permanent URL.
		await page.goBack();
		await expect(page).toHaveURL(/\/requisitions$/);
		await expect(page.getByText(title, { exact: true })).toBeVisible();
		await page.goForward();
		await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Edit Draft' }).click();
		await expect(page.getByLabel('Description of Work or Purchase')).toHaveValue(title);
		await page.getByLabel('Location', { exact: true }).fill('Updated saved location');
		await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
		await expect(page.getByText('Updated saved location', { exact: true })).toBeVisible();
		await page.reload();
		await expect(page.getByText('Updated saved location', { exact: true })).toBeVisible();
		await expect(page.getByText('Draft', { exact: true })).toBeVisible();
		await expect(page.getByText('₦96,640.00').first()).toBeVisible();
	} finally {
		releaseDetail();
	}
});

test('saved draft survives list refresh, reopening and a new login', async ({ page, browser }) => {
	await login(page);
	await page.goto('/requisitions/new');
	const title = 'Persistent draft ' + randomUUID();
	await fill(page, title);
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	const draftUrl = page.url();
	await page.getByRole('link', { name: '← Requisitions', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Requisitions', exact: true })).toBeVisible();
	await page.reload();
	await page.getByLabel('Search Requisitions').fill(title);
	await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('DRAFT');
	await page.getByRole('button', { name: 'Apply Filters' }).click();
	await expect(page).toHaveURL(/state=DRAFT/);
	await expect(page.getByText(title, { exact: true })).toBeVisible();
	await page.reload();
	const row = page.getByRole('row').filter({ hasText: title });
	await expect(row).toContainText('Draft');
	await row.getByRole('link', { name: /^Open / }).click();
	await expect(page).toHaveURL(draftUrl);
	await page.getByRole('button', { name: 'Edit Draft' }).click();
	await expect(page.getByLabel('Description of Work or Purchase')).toHaveValue(title);
	await expect(page.getByLabel('Vendor Name', { exact: true })).toHaveValue(
		'Synthetic request supplier'
	);
	await page.getByLabel('Location', { exact: true }).fill('Saved revised location');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByText('Saved revised location', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText('Saved revised location', { exact: true })).toBeVisible();
	const context = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	try {
		const other = await context.newPage();
		await login(other);
		await other.goto('/requisitions');
		await expect(other.getByText(title, { exact: true })).toBeVisible();
		await other.goto(draftUrl);
		await expect(other.getByRole('heading', { name: title, exact: true })).toBeVisible();
		await expect(other.getByText('Saved revised location', { exact: true })).toBeVisible();
		await expect(other.getByText('₦71,640.00').first()).toBeVisible();
	} finally {
		await context.close();
	}
});

test('draft, private document viewer, signed submission and assigned office visibility', async ({
	page,
	browser
}) => {
	await login(page);
	await page.getByRole('link', { name: 'Requisitions', exact: true }).click();
	await page.getByRole('link', { name: '+ New Requisition' }).click();
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Untitled Requisition', exact: true })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Review & Submit' })).toBeDisabled();
	await page.getByRole('button', { name: 'Edit Draft' }).click();
	const title = 'Synthetic requisition ' + randomUUID();
	await fill(page, title);
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await expect(page.getByText('₦71,640.00').first()).toBeVisible();
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII=',
		'base64'
	);
	await page
		.getByLabel('Supporting Document', { exact: true })
		.setInputFiles({ name: 'quote.png', mimeType: 'image/png', buffer: png });
	await expect(page.getByRole('button', { name: 'View quote.png' })).toBeVisible();
	await page.getByRole('button', { name: 'View quote.png' }).click();
	await expect(
		page.getByRole('dialog', { name: 'Document Viewer' }).getByRole('img')
	).toBeVisible();
	await page.getByRole('button', { name: 'Close Document' }).click();
	await page.screenshot({ path: 'test-results/requisition-desktop.png', fullPage: true });
	await sign(page, 'Synthetic requester');
	await expect(page.getByText('Awaiting Approval', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Edit Draft' })).toHaveCount(0);
	await expect(page.getByText(/Submitted evidence/)).toBeVisible();
	const link = page.url();
	const ctx = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const other = await ctx.newPage();
	await login(other, 'peer');
	await other.goto(link);
	await expect(other.getByRole('heading', { name: 'Requisition Unavailable' })).toBeVisible();
	await login(other, 'hod');
	await other.goto(link);
	await expect(other.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await ctx.close();
	await page.goto('/requisitions');
	await page.getByLabel('Search Requisitions').fill(title);
	await page.getByRole('button', { name: 'Apply Filters' }).click();
	await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test('vendor snapshot, stale draft preservation, cancelled edits and mobile board routing', async ({
	page
}) => {
	await login(page, 'md');
	await page.getByRole('button', { name: '+ Add Vendor', exact: true }).click();
	const supplier = 'Synthetic linked vendor ' + randomUUID();
	const drawer = page.getByRole('dialog');
	await drawer.getByLabel('Vendor Name').fill(supplier);
	await drawer.getByRole('button', { name: 'Save Vendor', exact: true }).click();
	await expect(drawer.getByRole('heading', { name: supplier, exact: true })).toBeVisible();
	await drawer.getByRole('button', { name: 'Close Vendor Drawer' }).click();
	await page.goto('/requisitions/new');
	await page.getByLabel('Find an Existing Vendor').fill(supplier);
	await page.getByRole('button', { name: 'Search Vendors', exact: true }).click();
	await page.getByRole('button', { name: supplier, exact: true }).click();
	await expect(page.getByLabel('Vendor Name', { exact: true })).toBeDisabled();
	await page.getByLabel('Description of Work or Purchase').fill('Synthetic Board stationery');
	await page.getByLabel('Location', { exact: true }).fill('Abuja');
	await page.getByRole('button', { name: '+ Add Item' }).click();
	await page.getByLabel('Item 1', { exact: true }).fill('Stationery');
	await page.getByLabel('Unit Price (₦)', { exact: true }).fill('1.00');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Synthetic Board stationery', exact: true })
	).toBeVisible();
	await expect(page.getByText('Board of Directors', { exact: true })).toBeVisible();
	const peer = await page.context().newPage();
	await peer.goto(page.url());
	await peer.getByRole('button', { name: 'Edit Draft' }).click();
	await peer.getByLabel('Location', { exact: true }).fill('Unsaved location');
	await page.getByRole('button', { name: 'Edit Draft' }).click();
	await page.getByLabel('Location', { exact: true }).fill('Current location');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Synthetic Board stationery', exact: true })
	).toBeVisible();
	await peer.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(peer.getByRole('alert')).toContainText('newer version');
	await expect(peer.getByLabel('Location', { exact: true })).toHaveValue('Unsaved location');
	await expect(peer.getByRole('button', { name: 'Save Draft', exact: true })).toBeDisabled();
	peer.on('dialog', (dialog) => dialog.accept());
	await peer.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(peer.getByLabel('Location', { exact: true })).toHaveCount(0);
	await peer.close();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.screenshot({ path: 'test-results/requisition-mobile.png', fullPage: true });
	await sign(page, 'Synthetic md');
	await expect(page.getByText('Awaiting Board Resolution', { exact: true })).toBeVisible();
});

test('read-only deep link denial and expired session clears edited content', async ({ page }) => {
	await login(page, 'readonly');
	await page.goto('/requisitions');
	await expect(page.getByRole('link', { name: '+ New Requisition' })).toHaveCount(0);
	await page.goto('/requisitions/new');
	await expect(page.getByText('Read-only reviewers cannot create requisitions.')).toBeVisible();
	await login(page);
	await page.goto('/requisitions/new');
	await fill(page, 'Synthetic expired-session draft');
	await page.context().clearCookies();
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByLabel('Vendor Name')).toHaveCount(0);
});

test('item prices show grouping, clear on focus and persist exact kobo', async ({ page }) => {
	await login(page);
	await page.goto('/requisitions/new');
	const title = 'Formatted price ' + randomUUID();
	await fill(page, title, '1234567.89');
	const price = page.getByLabel('Unit Price (₦)', { exact: true });
	await price.blur();
	await expect(price).toHaveValue('1,234,567.89');
	await price.focus();
	await expect(price).toHaveValue('');
	await price.blur();
	await expect(price).toHaveValue('1,234,567.89');
	await price.fill('248,000.15');
	await price.blur();
	await expect(price).toHaveValue('248,000.15');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText('₦248,000.15').first()).toBeVisible();
	await page.getByRole('button', { name: 'Edit Draft', exact: true }).click();
	await expect(price).toHaveValue('248,000.15');
});

test('bank fields require a complete ten-digit account and reveal invalid collapsed fields', async ({
	page
}) => {
	await login(page);
	await page.goto('/requisitions/new');
	const title = 'Bank validation ' + randomUUID();
	await fill(page, title);
	await page.locator('summary').filter({ hasText: 'Bank Details' }).click();
	await page.getByLabel('Bank Name', { exact: true }).fill('Synthetic bank');
	await page.getByLabel('Account Name', { exact: true }).fill('Synthetic beneficiary');
	const account = page.getByLabel('Account Number', { exact: true });
	await account.fill('123456789');
	await page.locator('summary').filter({ hasText: 'Bank Details' }).click();
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(account).toBeVisible();
	await expect(account).toBeFocused();
	await expect(page).toHaveURL(/\/requisitions\/new$/);
	await account.fill('01234abcde');
	expect(await account.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
	await account.fill('0000000123');
	await page.getByLabel('Account Name', { exact: true }).fill('');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByLabel('Account Name', { exact: true })).toBeFocused();
	await page.getByLabel('Account Name', { exact: true }).fill('Synthetic beneficiary');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await page.reload();
	await page.getByRole('button', { name: 'Edit Draft', exact: true }).click();
	await expect(account).toHaveValue('0000000123');
});

test('requester retracts to draft, edits and resubmits, then deletes a retracted draft', async ({
	page
}) => {
	await login(page);
	await page.goto('/requisitions/new');
	const title = 'Retractable request ' + randomUUID();
	await fill(page, title);
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	const url = page.url();
	await sign(page, 'Synthetic requester');
	await expect(page.getByRole('button', { name: 'Delete Draft', exact: true })).toHaveCount(0);
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Retract Requisition', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Edit Draft', exact: true })).toBeVisible();
	await page.reload();
	await page.getByRole('button', { name: 'Edit Draft', exact: true }).click();
	await page.getByLabel('Location', { exact: true }).fill('Revised location after retraction');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByText('Revised location after retraction', { exact: true })).toBeVisible();
	await sign(page, 'Synthetic requester');
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Retract Requisition', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Delete Draft', exact: true })).toBeVisible();
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Delete Draft', exact: true }).click();
	await expect(page).toHaveURL(/\/requisitions$/);
	await page.getByLabel('Search Requisitions').fill(title);
	await page.getByRole('button', { name: 'Apply Filters' }).click();
	await expect(page.getByText(title, { exact: true })).toHaveCount(0);
	const response = await page.request.get('/api/v1/requisitions/' + url.split('/').pop());
	expect(response.status()).toBe(404);
});

test('documents upload before the first draft save, support removal and persist after submission', async ({
	page
}) => {
	await login(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/requisitions/new');
	let draftsCreated = 0;
	page.on('request', (request) => {
		if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/requisitions')
			draftsCreated++;
	});
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII=',
		'base64'
	);
	const input = page.getByLabel('Supporting Document', { exact: true });
	await input.setInputFiles({ name: 'first-quotation.png', mimeType: 'image/png', buffer: png });
	await expect(page.getByRole('button', { name: 'View first-quotation.png' })).toBeVisible();
	expect(draftsCreated).toBe(0);
	await expect(page).toHaveURL(/\/requisitions\/new$/);
	await page.getByRole('button', { name: 'View first-quotation.png' }).click();
	await expect(
		page.getByRole('dialog', { name: 'Document Viewer' }).getByRole('img')
	).toBeVisible();
	await page.getByRole('button', { name: 'Close Document' }).click();
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Remove first-quotation.png' }).click();
	await expect(page.getByRole('button', { name: 'View first-quotation.png' })).toHaveCount(0);
	await input.setInputFiles({
		name: 'final-quotation-with-a-long-file-name-for-mobile.png',
		mimeType: 'image/png',
		buffer: png
	});
	await expect(
		page.getByRole('button', { name: 'View final-quotation-with-a-long-file-name-for-mobile.png' })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Upload document', exact: true })).toHaveCount(0);
	const title = 'Files before saving ' + randomUUID();
	await fill(page, title);
	await page.screenshot({ path: 'test-results/staged-upload-mobile.png', fullPage: true });
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
	).toBeTruthy();
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	expect(draftsCreated).toBe(1);
	await page.reload();
	await expect(
		page.getByRole('button', { name: 'View final-quotation-with-a-long-file-name-for-mobile.png' })
	).toBeVisible();
	await sign(page, 'Synthetic requester');
	await expect(
		page.getByRole('button', { name: 'View final-quotation-with-a-long-file-name-for-mobile.png' })
	).toBeVisible();
	await expect(
		page.getByRole('button', {
			name: 'Remove final-quotation-with-a-long-file-name-for-mobile.png'
		})
	).toHaveCount(0);
});

test('failed automatic upload can retry without duplicating documents or losing form entries', async ({
	page
}) => {
	await login(page);
	await page.goto('/requisitions/new');
	const title = 'Retry automatic upload ' + randomUUID();
	await fill(page, title);
	let fail = true;
	await page.route('**/api/v1/staged-attachments?*', async (route) => {
		if (route.request().method() === 'POST' && fail) {
			fail = false;
			await route.fulfill({
				status: 503,
				contentType: 'application/json',
				body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Synthetic upload outage' })
			});
		} else await route.continue();
	});
	await page.getByLabel('Supporting Document', { exact: true }).setInputFiles({
		name: 'retry.png',
		mimeType: 'image/png',
		buffer: Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII=',
			'base64'
		)
	});
	await expect(page.getByText('Synthetic upload outage', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Retry Upload', exact: true }).click();
	await expect(page.getByRole('button', { name: 'View retry.png' })).toHaveCount(1);
	await expect(page.getByLabel('Description of Work or Purchase')).toHaveValue(title);
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'View retry.png' })).toHaveCount(1);
});

test('administrator configures a department code while a requester preserves and retries the form', async ({
	page,
	browser
}) => {
	await page.setViewportSize({ width: 390, height: 900 });
	await login(page, 'code_requester');
	await page.goto('/requisitions/new');
	const title = 'Department code setup ' + randomUUID();
	await fill(page, title);
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText("department's three-letter code");
	await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeEnabled();
	await expect(page.getByLabel('Description of Work or Purchase')).toHaveValue(title);
	const context = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const admin = await context.newPage();
	await login(admin, 'admin');
	await admin.goto('/organisation?tab=departments&entity=' + fixture().request_entity);
	const card = admin.locator('article').filter({
		has: admin.getByRole('heading', {
			name: 'Legacy Department',
			exact: true
		})
	});
	await expect(card).toContainText('Set a three-letter code');
	async function setCode(code: string) {
		await card
			.getByRole('button', {
				name: 'Edit Department Legacy Department',
				exact: true
			})
			.click();
		const dialog = admin.getByRole('dialog');
		await dialog.getByLabel('Code', { exact: true }).fill(code);
		await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
		await expect(dialog).not.toBeVisible();
		await expect(card).toContainText(code.toUpperCase());
	}
	await setCode('fin');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page).toHaveURL(/\/requisitions\/[0-9a-f-]+$/);
	const reference = await page
		.getByText(/BNH-FIN-\d{6,}/)
		.first()
		.innerText();
	await setCode('adm');
	await page.reload();
	await expect(page.getByText(reference, { exact: true }).first()).toBeVisible();
	await page.goto('/requisitions/new');
	await fill(page, title + ' next');
	await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
	await expect(page.getByText(/BNH-ADM-\d{6,}/).first()).toBeVisible();
	await context.close();
});
