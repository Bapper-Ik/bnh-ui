import type { Handle } from '@sveltejs/kit/hooks';
import { proxyApi } from '#lib/server/proxy.js';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname === '/health') {
		return Response.json({ status: 'alive' });
	}
	if (event.url.pathname.startsWith('/api/v1/')) {
		return proxyApi(event.request, event.url, process.env.BACKEND_URL ?? 'http://127.0.0.1:8000');
	}
	const response = await resolve(event);
	if (['/login', '/forgot-password', '/recover'].includes(event.url.pathname)) {
		response.headers.set('Cache-Control', 'no-store');
		response.headers.set('Referrer-Policy', 'no-referrer');
	}
	return response;
};
