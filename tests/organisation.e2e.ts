import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

function fixture() {
	return JSON.parse(readFileSync('test-results/vendor-fixture.json', 'utf8')) as {
		people: { role: string; email: string }[];
		password: string;
		entity: string;
		entity_name: string;
		department: string;
	};
}
async function login(page: Page, role = 'admin') {
	const f = fixture();
	await page.goto('/login');
	await page.getByLabel('Work email').fill(f.people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(f.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
	await page.goto('/vendors');
}
async function command(page: Page, path: string, body?: Record<string, unknown>) {
	return page.evaluate(
		async ({ path, body }) => {
			const csrf =
				document.cookie
					.split('; ')
					.find((x) => x.startsWith('custodian_csrf='))
					?.slice('custodian_csrf='.length) ?? '';
			const r = await fetch('/api/v1' + path, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf) },
				body: body ? JSON.stringify(body) : undefined
			});
			return { status: r.status, body: await r.json().catch(() => null) };
		},
		{ path, body }
	);
}

test('organisation creates and updates companies and departments with explicit state changes', async ({
	page
}) => {
	await login(page);
	await page.getByRole('link', { name: 'Organisation & Authority', exact: true }).click();
	const company = 'Synthetic screen company ' + randomUUID();
	await page.getByRole('button', { name: 'Add company', exact: true }).click();
	const drawer = page.getByRole('dialog');
	await drawer.getByLabel('Name', { exact: true }).fill(company);
	await drawer.getByLabel('Code', { exact: true }).fill('ORG_' + randomUUID().slice(0, 8));
	await drawer.getByLabel('Company type').selectOption('holding');
	await drawer.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(drawer).not.toBeVisible();
	const card = page
		.locator('article')
		.filter({ has: page.getByRole('heading', { name: company, exact: true }) });
	await expect(card).toContainText('Holding company');
	await card.getByRole('link', { name: 'Departments', exact: true }).click();
	await expect(page.getByText('No departments yet', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add department', exact: true }).click();
	await drawer.getByLabel('Name', { exact: true }).fill('Technology');
	await drawer.getByLabel('Code', { exact: true }).fill('TECH');
	await drawer.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(drawer).not.toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Technology', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Edit department Technology', exact: true }).click();
	await drawer.getByLabel('Name', { exact: true }).fill('Engineering');
	await drawer.getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Engineering', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Disable department Engineering', exact: true }).click();
	await expect(drawer).toContainText('Historical records will remain');
	await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(page.locator('article')).toContainText('Disabled');
	await page.getByRole('button', { name: 'Enable department Engineering', exact: true }).click();
	await expect(drawer).toContainText(
		'may make retained memberships and appointments effective again'
	);
	await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(page.locator('article')).toContainText('Enabled');
	await page.getByRole('link', { name: 'Companies', exact: true }).click();
	await card.getByRole('button', { name: 'Disable company ' + company, exact: true }).click();
	await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(card).toContainText('Disabled');
	await card.getByRole('link', { name: 'Departments', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Add department', exact: true })).toBeDisabled();
	await expect(
		page.getByText('Unavailable while the company is disabled.', { exact: true })
	).toBeVisible();
	await page.screenshot({ path: 'test-results/organisation-desktop.png', fullPage: true });
});

test('organisation stale edits preserve input and expired sessions clear the drawer', async ({
	page,
	browser
}) => {
	await login(page);
	const other = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const peer = await other.newPage();
	await login(peer, 'admin_peer');
	const name = fixture().entity_name;
	await page.goto('/organisation');
	await peer.goto('/organisation');
	for (const p of [page, peer])
		await p.getByRole('button', { name: 'Edit company ' + name, exact: true }).click();
	await page
		.getByRole('dialog')
		.getByLabel('Name', { exact: true })
		.fill(name + ' first');
	await peer
		.getByRole('dialog')
		.getByLabel('Name', { exact: true })
		.fill(name + ' unsaved');
	await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect(page.getByRole('dialog')).not.toBeVisible();
	await peer.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect(peer.getByRole('alert')).toContainText('Your entries are preserved');
	await expect(peer.getByRole('dialog').getByLabel('Name', { exact: true })).toHaveValue(
		name + ' unsaved'
	);
	await peer.getByRole('button', { name: 'Discard and reload', exact: true }).click();
	await expect(peer.getByRole('heading', { name: name + ' first', exact: true })).toBeVisible();
	await peer.getByRole('button', { name: 'Edit company ' + name + ' first', exact: true }).click();
	await peer.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name);
	await peer.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect(peer.getByRole('dialog')).not.toBeVisible();
	await page.reload();
	await page.getByRole('button', { name: 'Edit company ' + name, exact: true }).click();
	await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Must not save');
	expect((await command(page, '/auth/logout')).status).toBe(200);
	// Notification refresh may detect revocation before the attempted save does.
	await Promise.race([
		page.waitForURL(/\/login$/),
		page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click()
	]);
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await other.close();
});

test('organisation office history, readonly matrix, restricted links and narrow layout', async ({
	page,
	browser
}) => {
	await login(page);
	const f = fixture();
	const account = await command(page, '/auth/accounts', {
		name: 'Synthetic organisation officeholder',
		email: randomUUID() + '@example.com',
		initial_password: 'Synthetic-officeholder-password'
	});
	expect(account.status).toBe(201);
	expect(
		(
			await command(page, '/organisation/memberships', {
				identity_id: account.body.id,
				entity_id: f.entity,
				department_id: f.department
			})
		).status
	).toBe(201);
	const office = await command(page, '/organisation/offices', {
		identity_id: account.body.id,
		entity_id: f.entity,
		department_id: f.department,
		role: 'hod',
		authorisation_reference: 'Synthetic organisation approval'
	});
	expect(office.status).toBe(201);
	await page.goto('/organisation?tab=offices&entity=' + f.entity);
	const card = page.locator('article').filter({ hasText: 'Synthetic organisation officeholder' });
	await expect(card).toContainText('Effective');
	await expect(card).toContainText('Operations');
	await expect(card).toContainText('Synthetic organisation approval');
	expect((await command(page, '/organisation/offices/' + office.body.id + '/revoke')).status).toBe(
		200
	);
	await page.reload();
	await expect(card).toContainText('Revoked');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.screenshot({ path: 'test-results/organisation-office-mobile.png', fullPage: true });
	await page.getByRole('link', { name: 'Approval matrix', exact: true }).click();
	await expect(page.getByText('Read-only · NGN', { exact: true })).toBeVisible();
	await expect(page.getByRole('row', { name: /Ordinary staff/ })).toContainText(
		'Own department HOD'
	);
	await expect(
		page.getByRole('row', { name: /Managing Director Board Board Board Board/ })
	).toBeVisible();
	await expect(page.getByRole('button', { name: /Edit|Save/ })).toHaveCount(0);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	await page.getByRole('region', { name: 'Approval matrix', exact: true }).focus();
	await page.keyboard.press('ArrowRight');
	await page.screenshot({ path: 'test-results/organisation-matrix-mobile.png', fullPage: true });
	const context = await browser.newContext({
		baseURL: 'http://127.0.0.1:4173',
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const staff = await context.newPage();
	await login(staff, 'owner');
	await expect(
		staff.getByRole('link', { name: 'Organisation & Authority', exact: true })
	).toHaveCount(0);
	await staff.goto('/organisation?tab=offices&entity=' + f.entity);
	await expect(
		staff.getByRole('heading', { name: 'Access restricted', exact: true })
	).toBeVisible();
	await expect(staff.getByText('Synthetic organisation officeholder', { exact: true })).toHaveCount(
		0
	);
	await context.close();
});
