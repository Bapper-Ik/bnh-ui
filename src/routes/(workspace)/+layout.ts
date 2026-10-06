import { redirect } from '@sveltejs/kit';
import { api, ApiError } from '#lib/api/client.js';
import type { UserView } from '#lib/api/schema.js';
export async function load() {
	try {
		return { user: await api<UserView>('/auth/me') };
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) redirect(303, '/login');
		throw error;
	}
}
