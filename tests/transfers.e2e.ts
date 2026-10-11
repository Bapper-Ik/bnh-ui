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
	await page.getByLabel('Staff Email').fill(fixture().people.find((p) => p.role === role)!.email);
	await page.getByLabel('Password', { exact: true }).fill(fixture().password);
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}
async function prepare(page: Page) {
	const dialog = page.getByRole('dialog', { name: 'Sign Requisition' });
	await dialog.getByLabel('Your Password').fill(fixture().password);
	await dialog.getByRole('button', { name: 'Continue to Signature' }).click();
	return dialog;
}
async function sign(page: Page, role: string, action: string) {
	const dialog = page.getByRole('dialog', { name: 'Sign Requisition' });
	await dialog.getByLabel('Confirm Your Full Name').fill('Synthetic ' + role);
	await dialog.getByLabel('Draw Your Signature').focus();
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
			await company.getByRole('button', { name: /Bank Details for/ }).click();
			const settings = admin.getByRole('dialog', { name: 'Company Debit Account' });
			await expect(settings.getByLabel('Debit Bank', { exact: true })).toBeEnabled();
			await settings.getByLabel('Debit Bank', { exact: true }).fill('Synthetic source bank');
			await settings.getByLabel('Company Account Name').fill('Synthetic company');
			await settings.getByLabel('Company Account Number').fill('0001234567');
			await settings.getByLabel('Bank Branch Address').fill('Synthetic branch, Abuja');
			await expect
				.poll(() => admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
				.toBe(true);
			await admin.screenshot({ path: 'test-results/transfer-account-mobile.png' });
			await settings.getByRole('button', { name: 'Save Bank Details' }).click();
			await expect(settings).not.toBeVisible();
			await company.getByRole('button', { name: /Bank Details for/ }).click();
			await expect(settings.getByLabel('Company Account Number')).toHaveValue('0001234567');
			await settings.getByRole('button', { name: 'Close Bank Account' }).click();

			const vendorName = 'Shared payment supplier ' + randomUUID();
			if (sharedVendor) {
				const creator = await approverContext.newPage();
				await login(creator, 'draft_requester');
				await creator.goto('/vendors');
				await creator.getByRole('button', { name: 'Add Vendor' }).click();
				const vendor = creator.getByRole('dialog');
				await vendor.getByLabel('Vendor Name').fill(vendorName);
				await vendor
					.getByRole('combobox', { name: 'Bank Details', exact: true })
					.selectOption({ label: 'Supply Bank Details' });
				await vendor.getByLabel('Bank Name', { exact: true }).fill('Synthetic recipient bank');
				await vendor.getByLabel('Account Name', { exact: true }).fill('Synthetic supplier');
				await vendor.getByLabel('Account Number', { exact: true }).fill('0012345678');
				await vendor.getByRole('button', { name: 'Save Vendor' }).click();
				await expect(vendor.getByText('0012345678', { exact: true })).toBeVisible();
				await creator.close();
			}
			const requester = await requesterContext.newPage();
			await login(requester, 'requester');
			await requester.goto('/requisitions/new');
			const title = 'Signed transfer ' + randomUUID();
			if (sharedVendor) {
				await requester.getByLabel('Find an Existing Vendor').fill(vendorName);
				await requester.getByRole('button', { name: 'Search Vendors', exact: true }).click();
				await requester.getByRole('button', { name: vendorName, exact: true }).click();
				await expect(
					requester.getByText(/The saved vendor account will be included/)
				).toBeVisible();
				await expect(requester.getByLabel('Account Number', { exact: true })).toHaveValue('');
			} else {
				await requester
					.getByLabel('Vendor Name', { exact: true })
					.fill('Synthetic transfer supplier');
				await requester.getByText('Bank Details', { exact: false }).click();
				await requester.getByLabel('Bank Name', { exact: true }).fill('Synthetic recipient bank');
				await requester.getByLabel('Account Name', { exact: true }).fill('Synthetic supplier');
				await requester.getByLabel('Account Number', { exact: true }).fill('0012345678');
			}
			await requester.getByLabel('Description of Work or Purchase').fill(title);
			await requester.getByLabel('Location', { exact: true }).fill('Abuja');
			await requester.getByRole('button', { name: '+ Add Item', exact: true }).click();
			await requester.getByLabel('Item 1', { exact: true }).fill('Materials');
			await requester.getByLabel('Unit Price (₦)', { exact: true }).fill('248000.15');
			await requester.getByRole('button', { name: 'Save Draft', exact: true }).click();
			await expect(requester.getByRole('heading', { name: title, exact: true })).toBeVisible();
			const url = requester.url();
			await requester.getByRole('button', { name: 'Review & Submit', exact: true }).click();
			await prepare(requester);
			await sign(requester, 'requester', 'Submit Requisition');

			const approver = await approverContext.newPage();
			await login(approver, 'hod');
			await approver.goto(url);
			await approver.getByRole('button', { name: 'Approve', exact: true }).click();
			const approval = await prepare(approver);
			const transfer = approval.getByRole('region', { name: 'Bank Transfer Request' });
			await expect(transfer.getByText(/0001234567/)).toBeVisible();
			await expect(transfer.getByText(/0012345678/)).toBeVisible();
			await expect(
				approval.getByText(/I authorise the system to place this approval signature/)
			).toBeVisible();
			await expect
				.poll(() => approver.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
				.toBe(true);
			await approver.screenshot({ path: 'test-results/transfer-signing-mobile.png' });
			await sign(approver, 'hod', 'Approve Requisition');
			await requester.reload();
			const documents = requester.getByRole('region', { name: 'PDF Exports', exact: true });
			await expect(documents.getByRole('button', { name: 'View Transfer Letter' })).toBeVisible({
				timeout: 25000
			});
			const directDownload = requester.waitForEvent('download');
			await documents
				.getByRole('button', { name: 'Download Transfer Letter', exact: true })
				.click();
			const letter = await directDownload;
			expect(letter.suggestedFilename()).toMatch(/bank-transfer\.pdf$/);
			expect(await letter.failure()).toBeNull();
			const file = await letter.path();
			expect(readFileSync(file!).subarray(0, 5).toString()).toBe('%PDF-');
			await documents.getByRole('button', { name: 'View Transfer Letter' }).click();
			const viewer = requester.getByRole('dialog', { name: 'Document Viewer' });
			await expect(viewer.getByRole('img', { name: 'PDF page 1 of 1', exact: true })).toBeVisible();
			await viewer.getByText('Page Text', { exact: true }).click();
			await expect(viewer.getByText(/PAYMENT INSTRUCTION/)).toBeVisible();
			await expect(viewer.getByText(/Synthetic hod/)).toBeVisible();
			await expect(viewer.getByText(/0012345678/)).toBeVisible();
			await expect(viewer.getByText(/Synthetic recipient bank/)).toBeVisible();
			const downloadPromise = requester.waitForEvent('download');
			await viewer.getByRole('link', { name: 'Download', exact: true }).click();
			expect((await downloadPromise).suggestedFilename()).toMatch(/bank-transfer\.pdf$/);
			await requester.screenshot({ path: 'test-results/transfer-letter-desktop.png' });
			await viewer.getByRole('button', { name: 'Close Document' }).click();
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

test('HOD signs own low-value requisition separately and downloads the department-funded letter', async ({
	browser
}) => {
	test.setTimeout(120000);
	const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const hodContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
	try {
		const admin = await adminContext.newPage();
		await login(admin, 'admin');
		await admin.goto(`/organisation?tab=departments&entity=${fixture().request_entity}`);
		const department = admin
			.locator('article')
			.filter({ has: admin.getByRole('heading', { name: 'Requisition Operations', exact: true }) });
		await department
			.getByRole('button', { name: 'Sub-Account for Requisition Operations', exact: true })
			.click();
		const settings = admin.getByRole('dialog', { name: 'Department Sub-Account', exact: true });
		await settings.getByLabel('Debit Bank', { exact: true }).fill('Synthetic department bank');
		await settings.getByLabel('Department Account Name').fill('Synthetic Operations');
		await settings.getByLabel('Department Account Number').fill('0076543210');
		await settings.getByLabel('Bank Branch Address').fill('Synthetic department branch');
		await settings.getByRole('button', { name: 'Save Bank Details' }).click();
		await expect(settings).not.toBeVisible();
		await admin.reload();
		await department
			.getByRole('button', { name: 'Sub-Account for Requisition Operations', exact: true })
			.click();
		await expect(settings.getByLabel('Department Account Number')).toHaveValue('0076543210');
		await expect
			.poll(() => admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
			.toBe(true);
		await admin.screenshot({ path: 'test-results/department-account-mobile.png', fullPage: true });
		await settings.getByRole('button', { name: 'Close Bank Account' }).click();

		const hod = await hodContext.newPage();
		await login(hod, 'hod');
		await hod.goto('/requisitions/new');
		const title = 'HOD department purchase ' + randomUUID();
		await hod.getByLabel('Vendor Name', { exact: true }).fill('Synthetic HOD supplier');
		await hod.getByText('Bank Details', { exact: false }).click();
		await hod.getByLabel('Bank Name', { exact: true }).fill('Synthetic beneficiary bank');
		await hod.getByLabel('Account Name', { exact: true }).fill('Synthetic beneficiary');
		await hod.getByLabel('Account Number', { exact: true }).fill('0012345678');
		await hod.getByLabel('Description of Work or Purchase').fill(title);
		await hod.getByLabel('Location', { exact: true }).fill('Abuja');
		await hod.getByRole('button', { name: '+ Add Item', exact: true }).click();
		await hod.getByLabel('Item 1', { exact: true }).fill('Department materials');
		await hod.getByLabel('Unit Price (₦)', { exact: true }).fill('5000000');
		await hod.getByRole('button', { name: 'Save Draft', exact: true }).click();
		await expect(hod.getByRole('heading', { name: title, exact: true })).toBeVisible();
		await hod.getByRole('button', { name: 'Review & Submit', exact: true }).click();
		await prepare(hod);
		await sign(hod, 'hod', 'Submit Requisition');
		await expect(hod.getByText('Awaiting Approval', { exact: true })).toBeVisible();
		await expect(hod.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
		await expect(hod.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
		await hod.goto('/requisitions?inbox=true');
		await hod
			.getByRole('row')
			.filter({ hasText: title })
			.getByRole('link', { name: /^Open / })
			.click();
		await hod.getByRole('button', { name: 'Approve', exact: true }).click();
		const approval = await prepare(hod);
		const transfer = approval.getByRole('region', { name: 'Bank Transfer Request' });
		await expect(transfer.getByText('Department Sub-Account', { exact: true })).toBeVisible();
		await expect(transfer.getByText(/0076543210/)).toBeVisible();
		await expect(transfer.getByText(/0012345678/)).toBeVisible();
		await expect
			.poll(() => hod.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
			.toBe(true);
		await hod.screenshot({ path: 'test-results/hod-self-approval-mobile.png', fullPage: true });
		await sign(hod, 'hod', 'Approve Requisition');
		await hod.reload();
		await expect(hod.getByText('Approved', { exact: true })).toBeVisible();
		const documents = hod.getByRole('region', { name: 'PDF Exports', exact: true });
		await expect(documents.getByRole('button', { name: 'Download Transfer Letter' })).toBeVisible({
			timeout: 25000
		});
		const downloaded = hod.waitForEvent('download');
		await documents.getByRole('button', { name: 'Download Transfer Letter' }).click();
		expect(await (await downloaded).failure()).toBeNull();
		await hod.goto('/requisitions?inbox=true');
		await expect(hod.getByRole('row').filter({ hasText: title })).toHaveCount(0);
	} finally {
		await adminContext.close();
		await hodContext.close();
	}
});
