import { error, redirect } from '@sveltejs/kit';
import { api, ApiError } from '#lib/api/client.js';
import type { BoardCase } from '#lib/api/schema.js';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ params, parent }) => {
	await parent();
	try {
		return { board: await api<BoardCase>('/requisitions/' + params.id + '/board') };
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) redirect(303, '/login');
		error(
			e instanceof ApiError ? e.status : 503,
			e instanceof Error ? e.message : 'Unable to load Board case.'
		);
	}
};
