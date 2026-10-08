import { error, redirect } from '@sveltejs/kit';
import { api, ApiError } from '#lib/api/client.js';
import type { Page } from '#lib/api/schema.js';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ url, parent }) => {
	const { user } = await parent();
	const inbox = url.searchParams.get('inbox') === 'true';
	if (inbox && !user.can_access_approval_inbox) redirect(303, '/requisitions');
	const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset') ?? 0) || 0));
	const search = url.searchParams.get('search') ?? '';
	const state = url.searchParams.get('state') ?? '';
	const query = new URLSearchParams({
		inbox: String(inbox),
		offset: String(offset),
		search,
		state
	});
	try {
		return {
			requests: await api<Page>((inbox ? '/approvals/inbox?' : '/requisitions?') + query),
			inbox,
			search,
			state,
			readOnly: user.read_only
		};
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) redirect(303, '/login');
		error(
			e instanceof ApiError ? e.status : 503,
			e instanceof Error ? e.message : 'Unable to load requisitions.'
		);
	}
};
