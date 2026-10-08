import { error, redirect } from '@sveltejs/kit';
import { api, ApiError } from '#lib/api/client.js';
import type { AuditPage } from '#lib/api/schema.js';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ url, parent }) => {
	const { user } = await parent();
	if (!user.permissions.includes('audit:read'))
		error(403, 'Audit Log access requires an explicit audit permission.');
	const filters = Object.fromEntries(
		['search', 'action', 'actor', 'company', 'outcome', 'date_from', 'date_to'].map((key) => [
			key,
			url.searchParams.get(key) ?? ''
		])
	);
	const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
	query.set(
		'offset',
		String(Math.max(0, Math.floor(Number(url.searchParams.get('offset') ?? 0) || 0)))
	);
	if (url.searchParams.get('before')) query.set('before', url.searchParams.get('before')!);
	try {
		return { events: await api<AuditPage>('/audit-events?' + query), filters };
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) redirect(303, '/login');
		error(
			e instanceof ApiError ? e.status : 503,
			e instanceof Error ? e.message : 'Unable to load the Audit Log.'
		);
	}
};
