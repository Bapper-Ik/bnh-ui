import { error, redirect } from '@sveltejs/kit';
import { api, ApiError } from '#lib/api/client.js';
import type { MembershipView } from '#lib/api/schema.js';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent }) => {
	const { user } = await parent();
	if (user.read_only) error(403, 'Read-only reviewers cannot create requisitions.');
	try {
		return { memberships: await api<MembershipView[]>('/organisation/memberships') };
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) redirect(303, '/login');
		error(
			e instanceof ApiError ? e.status : 503,
			e instanceof Error ? e.message : 'Unable to load your department.'
		);
	}
};
