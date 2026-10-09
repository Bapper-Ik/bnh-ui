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
	await page.getByLabel('Work email').fill(f.people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(f.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
	await page.goto('/vendors');
}
async function fill(page: Page, title: string, amount = '71640') {
	await page.getByLabel('Vendor name', { exact: true }).fill('Synthetic request supplier');
	await page.getByLabel('Description of work or purchase').fill(title);
	await page.getByLabel('Location', { exact: true }).fill('Abuja');
	await page.getByRole('button', { name: '+ Add item', exact: true }).click();
	await page.getByLabel('Item 1', { exact: true }).fill('Office materials');
	await page.getByLabel('Unit price (₦)', { exact: true }).fill(amount);
}
async function sign(page: Page, name: string) {
	await page.getByRole('button', { name: 'Review & submit', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Sign requisition' });
	await dialog.getByLabel('Your password').fill(fixture().password);
	await dialog.getByRole('button', { name: 'Continue to signature' }).click();
	await dialog.getByLabel('Confirm your full name').fill(name);
	await dialog.getByLabel('Draw your signature').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await dialog.getByRole('checkbox').check();
	await dialog.getByRole('button', { name: 'Submit requisition', exact: true }).click();
	await expect(dialog).not.toBeVisible();
}

test('saved draft survives refresh during detail loading without an HOD', async ({ page }) => {
	await login(page, 'draft_requester');
	await page.goto('/requisitions');
	await page.getByRole('link', { name: '+ New requisition' }).click();
	const title = 'Draft before submission ' + randomUUID();
	await fill(page, title);
	for (const [name, price] of [
		['Delivery', '5000'],
		['Installation', '20000']
	]) {
		await page.getByRole('button', { name: '+ Add item', exact: true }).click();
		await page
			.getByLabel(/^Item [0-9]+$/)
			.last()
			.fill(name);
		await page.getByLabel('Unit price (₦)', { exact: true }).last().fill(price);
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
		await page.getByRole('button', { name: 'Save draft', exact: true }).click();
		const response = await savedResponse;
		expect(response.status()).toBe(201);
		const savedId = new URL(await detailRequest).pathname.split('/').pop()!;
		await expect(page).toHaveURL(new RegExp('/requisitions/' + savedId + '$'));
		await page.reload();
		releaseDetail();
		await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
		await expect(page.getByText(/BNH-\d{4}-\d{6}/).first()).toBeVisible();
		await expect(
			page.getByText('Draft saved. You can return to it before submitting.')
		).toBeVisible();
		await expect(page.getByText('₦96,640.00').first()).toBeVisible();
		await expect(page.getByRole('cell').filter({ hasText: /^Delivery$/ })).toBeVisible();
		await expect(page.getByRole('cell').filter({ hasText: /^Installation$/ })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Review & submit', exact: true })).toBeDisabled();
		await expect(page.getByText(/A unique active hod appointment is required/)).toBeVisible();
		// Saving replaces the empty creation form in history with the permanent URL.
		await page.goBack();
		await expect(page).toHaveURL(/\/requisitions$/);
		await expect(page.getByText(title, { exact: true })).toBeVisible();
		await page.goForward();
		await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Edit draft' }).click();
		await expect(page.getByLabel('Description of work or purchase')).toHaveValue(title);
		await page.getByLabel('Location', { exact: true }).fill('Updated saved location');
		await page.getByRole('button', { name: 'Save draft', exact: true }).click();
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
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	const draftUrl = page.url();
	await page.getByRole('link', { name: '← Requisitions', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Requisitions', exact: true })).toBeVisible();
	await page.reload();
	await page.getByLabel('Search requisitions').fill(title);
	await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('DRAFT');
	await page.getByRole('button', { name: 'Apply filters' }).click();
	await expect(page).toHaveURL(/state=DRAFT/);
	await expect(page.getByText(title, { exact: true })).toBeVisible();
	await page.reload();
	const row = page.getByRole('row').filter({ hasText: title });
	await expect(row).toContainText('Draft');
	await row.getByRole('link', { name: /^Open / }).click();
	await expect(page).toHaveURL(draftUrl);
	await page.getByRole('button', { name: 'Edit draft' }).click();
	await expect(page.getByLabel('Description of work or purchase')).toHaveValue(title);
	await expect(page.getByLabel('Vendor name', { exact: true })).toHaveValue(
		'Synthetic request supplier'
	);
	await page.getByLabel('Location', { exact: true }).fill('Saved revised location');
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
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
	await page.getByRole('link', { name: '+ New requisition' }).click();
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Untitled requisition', exact: true })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Review & submit' })).toBeDisabled();
	await page.getByRole('button', { name: 'Edit draft' }).click();
	const title = 'Synthetic requisition ' + randomUUID();
	await fill(page, title);
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await expect(page.getByText('₦71,640.00').first()).toBeVisible();
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII=',
		'base64'
	);
	await page
		.getByLabel('Supporting document', { exact: true })
		.setInputFiles({ name: 'quote.png', mimeType: 'image/png', buffer: png });
	await page.getByRole('button', { name: 'Upload document', exact: true }).click();
	await expect(page.getByRole('button', { name: 'View quote.png' })).toBeVisible();
	await page.getByRole('button', { name: 'View quote.png' }).click();
	await expect(
		page.getByRole('dialog', { name: 'Document viewer' }).getByRole('img')
	).toBeVisible();
	await page.getByRole('button', { name: 'Close document' }).click();
	await page.screenshot({ path: 'test-results/requisition-desktop.png', fullPage: true });
	await sign(page, 'Synthetic requester');
	await expect(page.getByText('Awaiting approval', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Edit draft' })).toHaveCount(0);
	await expect(page.getByText(/Submitted evidence/)).toBeVisible();
	const link = page.url();
	const ctx = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const other = await ctx.newPage();
	await login(other, 'peer');
	await other.goto(link);
	await expect(other.getByRole('heading', { name: 'Requisition unavailable' })).toBeVisible();
	await login(other, 'hod');
	await other.goto(link);
	await expect(other.getByRole('heading', { name: title, exact: true })).toBeVisible();
	await ctx.close();
	await page.goto('/requisitions');
	await page.getByLabel('Search requisitions').fill(title);
	await page.getByRole('button', { name: 'Apply filters' }).click();
	await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test('vendor snapshot, stale draft preservation, cancelled edits and mobile board routing', async ({
	page
}) => {
	await login(page, 'md');
	await page.getByRole('button', { name: '+ Add vendor', exact: true }).click();
	const supplier = 'Synthetic linked vendor ' + randomUUID();
	const drawer = page.getByRole('dialog');
	await drawer.getByLabel('Vendor name').fill(supplier);
	await drawer.getByRole('button', { name: 'Save vendor', exact: true }).click();
	await expect(drawer.getByRole('heading', { name: supplier, exact: true })).toBeVisible();
	await drawer.getByRole('button', { name: 'Close vendor drawer' }).click();
	await page.goto('/requisitions/new');
	await page.getByLabel('Find an existing vendor').fill(supplier);
	await page.getByRole('button', { name: 'Search vendors', exact: true }).click();
	await page.getByRole('button', { name: supplier, exact: true }).click();
	await expect(page.getByLabel('Vendor name', { exact: true })).toBeDisabled();
	await page.getByLabel('Description of work or purchase').fill('Synthetic Board stationery');
	await page.getByLabel('Location', { exact: true }).fill('Abuja');
	await page.getByRole('button', { name: '+ Add item' }).click();
	await page.getByLabel('Item 1', { exact: true }).fill('Stationery');
	await page.getByLabel('Unit price (₦)', { exact: true }).fill('1.00');
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Synthetic Board stationery', exact: true })
	).toBeVisible();
	await expect(page.getByText('board', { exact: true })).toBeVisible();
	const peer = await page.context().newPage();
	await peer.goto(page.url());
	await peer.getByRole('button', { name: 'Edit draft' }).click();
	await peer.getByLabel('Location', { exact: true }).fill('Unsaved location');
	await page.getByRole('button', { name: 'Edit draft' }).click();
	await page.getByLabel('Location', { exact: true }).fill('Current location');
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Synthetic Board stationery', exact: true })
	).toBeVisible();
	await peer.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(peer.getByRole('alert')).toContainText('newer version');
	await expect(peer.getByLabel('Location', { exact: true })).toHaveValue('Unsaved location');
	await expect(peer.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
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
	await expect(page.getByText('Awaiting Board resolution', { exact: true })).toBeVisible();
});

test('read-only deep link denial and expired session clears edited content', async ({ page }) => {
	await login(page, 'readonly');
	await page.goto('/requisitions');
	await expect(page.getByRole('link', { name: '+ New requisition' })).toHaveCount(0);
	await page.goto('/requisitions/new');
	await expect(page.getByText('Read-only reviewers cannot create requisitions.')).toBeVisible();
	await login(page);
	await page.goto('/requisitions/new');
	await fill(page, 'Synthetic expired-session draft');
	await page.context().clearCookies();
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByLabel('Vendor name')).toHaveCount(0);
});
