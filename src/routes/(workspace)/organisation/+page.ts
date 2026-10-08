import { redirect } from '@sveltejs/kit';
import { api, ApiError } from '#lib/api/client.js';
import type { OrganisationWorkspace } from '#lib/api/schema.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
	const { user } = await parent();
	const requested = url.searchParams.get('tab') ?? 'companies';
	const tab = ['companies', 'departments', 'offices', 'authority'].includes(requested)
		? requested
		: 'companies';
	const base = {
		tab,
		workspace: null as OrganisationWorkspace | null,
		error: '',
		forbidden: false
	};
	if (!user.permissions.includes('organisation:manage') || user.read_only)
		return { ...base, forbidden: true };
	const query = new URLSearchParams();
	const entity = url.searchParams.get('entity');
	if (entity) query.set('entity_id', entity);
	try {
		return {
			...base,
			workspace: await api<OrganisationWorkspace>('/organisation/workspace?' + query)
		};
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) redirect(303, '/login');
		return {
			...base,
			forbidden: e instanceof ApiError && e.status === 403,
			error: e instanceof Error ? e.message : 'Unable to load organisation.'
		};
	}
};
