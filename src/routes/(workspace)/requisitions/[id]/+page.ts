import { error, redirect } from '@sveltejs/kit';
import { api, ApiError } from '#lib/api/client.js';
import type { RequestView } from '#lib/api/schema.js';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ params, parent, url }) => {
	await parent();
	try {
		return {
			request: await api<RequestView>(
				'/requisitions/' +
					params.id +
					(url.searchParams.has('revision')
						? '?revision=' + encodeURIComponent(url.searchParams.get('revision')!)
						: '')
			)
		};
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) redirect(303, '/login');
		error(
			e instanceof ApiError ? e.status : 503,
			e instanceof Error ? e.message : 'Unable to load requisition.'
		);
	}
};
