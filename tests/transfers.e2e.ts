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
async function login(page: Page, role: string) {
	await page.goto('/login');
	await page.getByLabel('Work email').fill(fixture().people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(fixture().password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}
async function prepare(page: Page) {
	const dialog = page.getByRole('dialog', { name: 'Sign requisition' });
	await dialog.getByLabel('Your password').fill(fixture().password);
	await dialog.getByRole('button', { name: 'Continue to signature' }).click();
	return dialog;
}
async function sign(page: Page, role: string, action: string) {
	const dialog = page.getByRole('dialog', { name: 'Sign requisition' });
	await dialog.getByLabel('Confirm your full name').fill('Synthetic ' + role);
	await dialog.getByLabel('Draw your signature').focus();
	for (const key of ['Enter', 'ArrowRight', 'ArrowDown', 'Enter']) await page.keyboard.press(key);
	await dialog.getByRole('checkbox').check();
	await dialog.getByRole('button', { name: action, exact: true }).click();
	await expect(dialog).not.toBeVisible();
}

for (const sharedVendor of [false, true]) {
	test(`approval creates a downloadable signed transfer letter with ${sharedVendor ? 'another staff member’s vendor' : 'manual bank details'}`, async ({
		browser
	}) => {
		test.setTimeout(120000);
		const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const requesterContext = await browser.newContext();
		const approverContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
		try {
			const admin = await adminContext.newPage();
			await login(admin, 'admin');
			await admin.goto('/organisation?tab=companies');
			const company = admin
				.locator('article')
				.filter({ has: admin.locator(`a[href*="entity=${fixture().request_entity}"]`) });
			await company.getByRole('button', { name: /Bank details for/ }).click();
			const settings = admin.getByRole('dialog', { name: 'Company debit account' });
			await expect(settings.getByLabel('Debit bank', { exact: true })).toBeEnabled();
			await settings.getByLabel('Debit bank', { exact: true }).fill('Synthetic source bank');
			await settings.getByLabel('Company account name').fill('Synthetic company');
			await settings.getByLabel('Company account number').fill('0001234567');
			await settings.getByLabel('Bank branch address').fill('Synthetic branch, Abuja');
			await expect
				.poll(() => admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
				.toBe(true);
			await admin.screenshot({ path: 'test-results/transfer-account-mobile.png' });
			await settings.getByRole('button', { name: 'Save bank details' }).click();
			await expect(settings).not.toBeVisible();
			await company.getByRole('button', { name: /Bank details for/ }).click();
			await expect(settings.getByLabel('Company account number')).toHaveValue('0001234567');
			await settings.getByRole('button', { name: 'Close bank account' }).click();

			const vendorName = 'Shared payment supplier ' + randomUUID();
			if (sharedVendor) {
				const creator = await approverContext.newPage();
				await login(creator, 'draft_requester');
				await creator.goto('/vendors');
				await creator.getByRole('button', { name: 'Add vendor' }).click();
				const vendor = creator.getByRole('dialog');
				await vendor.getByLabel('Vendor name').fill(vendorName);
				await vendor
					.getByRole('combobox', { name: 'Bank details', exact: true })
					.selectOption({ label: 'Supply bank details' });
				await vendor.getByLabel('Bank name', { exact: true }).fill('Synthetic recipient bank');
				await vendor.getByLabel('Account name', { exact: true }).fill('Synthetic supplier');
				await vendor.getByLabel('Account number', { exact: true }).fill('0012345678');
				await vendor.getByRole('button', { name: 'Save vendor' }).click();
				await expect(vendor.getByText('0012345678', { exact: true })).toBeVisible();
				await creator.close();
			}
			const requester = await requesterContext.newPage();
			await login(requester, 'requester');
			await requester.goto('/requisitions/new');
			const title = 'Signed transfer ' + randomUUID();
			if (sharedVendor) {
				await requester.getByLabel('Find an existing vendor').fill(vendorName);
				await requester.getByRole('button', { name: 'Search vendors', exact: true }).click();
				await requester.getByRole('button', { name: vendorName, exact: true }).click();
				await expect(
					requester.getByText(/The saved vendor account will be included/)
				).toBeVisible();
				await expect(requester.getByLabel('Account number', { exact: true })).toHaveValue('');
			} else {
				await requester
					.getByLabel('Vendor name', { exact: true })
					.fill('Synthetic transfer supplier');
				await requester.getByText('Bank details', { exact: false }).click();
				await requester.getByLabel('Bank name', { exact: true }).fill('Synthetic recipient bank');
				await requester.getByLabel('Account name', { exact: true }).fill('Synthetic supplier');
				await requester.getByLabel('Account number', { exact: true }).fill('0012345678');
			}
			await requester.getByLabel('Description of work or purchase').fill(title);
			await requester.getByLabel('Location', { exact: true }).fill('Abuja');
			await requester.getByRole('button', { name: '+ Add item', exact: true }).click();
			await requester.getByLabel('Item 1', { exact: true }).fill('Materials');
			await requester.getByLabel('Unit price (₦)', { exact: true }).fill('248000.15');
			await requester.getByRole('button', { name: 'Save draft', exact: true }).click();
			await expect(requester.getByRole('heading', { name: title, exact: true })).toBeVisible();
			const url = requester.url();
			await requester.getByRole('button', { name: 'Review & submit', exact: true }).click();
			await prepare(requester);
			await sign(requester, 'requester', 'Submit requisition');

			const approver = await approverContext.newPage();
			await login(approver, 'hod');
			await approver.goto(url);
			await approver.getByRole('button', { name: 'Approve', exact: true }).click();
			const approval = await prepare(approver);
			const transfer = approval.getByRole('region', { name: 'Bank transfer instruction' });
			await expect(transfer.getByText(/0001234567/)).toBeVisible();
			await expect(transfer.getByText(/0012345678/)).toBeVisible();
			await expect(
				approval.getByText(/I authorise the system to place this approval signature/)
			).toBeVisible();
			await expect
				.poll(() => approver.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
				.toBe(true);
			await approver.screenshot({ path: 'test-results/transfer-signing-mobile.png' });
			await sign(approver, 'hod', 'Approve requisition');
			await requester.reload();
			const documents = requester.getByRole('region', { name: 'PDF exports', exact: true });
			await expect(documents.getByRole('button', { name: 'View transfer letter' })).toBeVisible({
				timeout: 25000
			});
			const directDownload = requester.waitForEvent('download');
			await documents
				.getByRole('button', { name: 'Download transfer letter', exact: true })
				.click();
			const letter = await directDownload;
			expect(letter.suggestedFilename()).toMatch(/bank-transfer\.pdf$/);
			expect(await letter.failure()).toBeNull();
			const file = await letter.path();
			expect(readFileSync(file!).subarray(0, 5).toString()).toBe('%PDF-');
			await documents.getByRole('button', { name: 'View transfer letter' }).click();
			const viewer = requester.getByRole('dialog', { name: 'Document viewer' });
			await expect(viewer.getByRole('img', { name: 'PDF page 1 of 1', exact: true })).toBeVisible();
			await viewer.getByText('Page text', { exact: true }).click();
			await expect(viewer.getByText(/PAYMENT INSTRUCTION/)).toBeVisible();
			await expect(viewer.getByText(/Synthetic hod/)).toBeVisible();
			await expect(viewer.getByText(/0012345678/)).toBeVisible();
			await expect(viewer.getByText(/Synthetic recipient bank/)).toBeVisible();
			const downloadPromise = requester.waitForEvent('download');
			await viewer.getByRole('link', { name: 'Download', exact: true }).click();
			expect((await downloadPromise).suggestedFilename()).toMatch(/bank-transfer\.pdf$/);
			await requester.screenshot({ path: 'test-results/transfer-letter-desktop.png' });
			await viewer.getByRole('button', { name: 'Close document' }).click();
			await requester.setViewportSize({ width: 390, height: 844 });
			await documents.scrollIntoViewIfNeeded();
			await expect
				.poll(() => requester.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
				.toBe(true);
			await requester.screenshot({ path: 'test-results/transfer-documents-mobile.png' });
		} finally {
			await adminContext.close();
			await requesterContext.close();
			await approverContext.close();
		}
	});
}
