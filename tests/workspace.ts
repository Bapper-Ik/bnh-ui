import type { Page } from '@playwright/test';

export async function openNavigation(page: Page) {
	const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
	if ((page.viewportSize()?.width ?? 1280) <= 900) await trigger.click();
}
