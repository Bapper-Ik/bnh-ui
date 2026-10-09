import { expect, type Page } from '@playwright/test';

// Check content itself, not just the page width: hidden overflow can conceal broken layouts.
export async function contentFits(page: Page) {
	await expect
		.poll(async () =>
			page.evaluate(() => {
				const issues: string[] = [];
				if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page overflow');
				const modal = document.querySelector('dialog[open]');
				const scope = modal ?? document.querySelector('main')!;
				for (const element of [
					scope,
					...scope.querySelectorAll(
						'input, select, textarea, button, .button, .card, .item, .table-wrap, table, td, .numeric, .grand-total, .cost-footer, .actions, .document, .grid, .status'
					)
				]) {
					const box = element.getBoundingClientRect();
					if (!box.width || !box.height || element.closest('thead')) continue;
					const style = getComputedStyle(element);
					if (box.left < -1 || box.right > innerWidth + 1)
						issues.push(element.tagName + ' outside viewport: ' + element.className);
					if (
						!['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) &&
						element.scrollWidth > element.clientWidth + 2 &&
						style.display !== 'inline'
					)
						issues.push(
							element.tagName +
								' clipped content: ' +
								element.className +
								' (' +
								(element.getAttribute('aria-label') ?? '') +
								')'
						);
				}
				return issues;
			})
		)
		.toEqual([]);
}

export async function inspectWidths(page: Page, name: string) {
	const original = page.viewportSize()!;
	for (const width of [320, 390, 768, 1024, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		await contentFits(page);
		if (width === 390 || width === 1440) {
			await page.evaluate(() => {
				window.scrollTo(0, 0);
				const dialog = document.querySelector('dialog[open]');
				if (dialog) dialog.scrollTop = 0;
			});
			await page.screenshot({
				path: `test-results/content-${name}-${width}.png`,
				fullPage: (await page.locator('dialog[open]').count()) === 0
			});
		}
	}
	await page.setViewportSize(original);
}
