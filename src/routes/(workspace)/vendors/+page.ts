import { api, ApiError } from '#lib/api/client.js';
import type { MembershipView, VendorPage } from '#lib/api/schema.js';

export async function load({ url, parent }: { url: URL; parent: () => Promise<unknown> }) {
	await parent();
	try {
		const memberships = await api<MembershipView[]>('/organisation/memberships');
		const requested = url.searchParams.get('entity');
		const entity = memberships.find((item) => item.entity_id === requested) ?? memberships[0];
		const search = (url.searchParams.get('search') ?? '').slice(0, 250);
		const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset')) || 0));
		const query = new URLSearchParams({
			entity_id: entity?.entity_id ?? '',
			search,
			offset: String(offset)
		});
		const vendors = entity ? await api<VendorPage>('/vendors?' + query) : null;
		return { memberships, entity, search, vendors, error: '' };
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) throw error;
		return {
			memberships: [],
			entity: undefined,
			search: '',
			vendors: null,
			error: error instanceof Error ? error.message : 'Unable to load vendors.'
		};
	}
}
