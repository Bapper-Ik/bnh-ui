import { redirect } from '@sveltejs/kit';
import { api, ApiError } from '#lib/api/client.js';
import type { StaffOptions, StaffPage } from '#lib/api/schema.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
	const { user } = await parent();
	const search = (url.searchParams.get('search') ?? '').slice(0, 180);
	const requested = url.searchParams.get('status') ?? '';
	const status = ['active', 'invited', 'disabled'].includes(requested) ? requested : '';
	const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset')) || 0));
	const empty: StaffOptions = { entities: [], departments: [], email_enabled: false };
	const base = {
		search,
		status,
		offset,
		staff: null as StaffPage | null,
		options: empty,
		error: '',
		forbidden: false
	};
	if (!user.permissions.includes('staff:manage') || user.read_only)
		return { ...base, forbidden: true };
	const query = new URLSearchParams({ search, offset: String(offset) });
	if (status) query.set('status', status);
	try {
		const [staff, options] = await Promise.all([
			api<StaffPage>('/staff?' + query),
			api<StaffOptions>('/staff/options')
		]);
		return { ...base, staff, options };
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) redirect(303, '/login');
		return {
			...base,
			forbidden: e instanceof ApiError && e.status === 403,
			error: e instanceof Error ? e.message : 'Unable to load staff.'
		};
	}
};
