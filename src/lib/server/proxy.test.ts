import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyApi } from './proxy.js';

afterEach(() => vi.unstubAllGlobals());
describe('Production API proxy', () => {
	it('forwards origin, cookies and CSRF to the fixed backend and preserves both session cookies', async () => {
		const fetchMock = vi.fn<typeof fetch>(async () => {
			const headers = new Headers({ 'content-type': 'application/json' });
			headers.append('set-cookie', 'custodian_session=synthetic; Path=/; HttpOnly; Secure');
			headers.append('set-cookie', 'custodian_csrf=synthetic-csrf; Path=/; Secure');
			return new Response('{"ok":true}', { headers });
		});
		vi.stubGlobal('fetch', fetchMock);
		const request = new Request('https://ui.example.com/api/v1/auth/login', {
			method: 'POST',
			headers: {
				origin: 'https://ui.example.com',
				'content-type': 'application/json',
				cookie: 'custodian_session=old',
				'x-csrf-token': 'csrf'
			},
			body: '{"email":"synthetic@example.com"}'
		});
		const response = await proxyApi(request, new URL(request.url), 'https://backend.example.com');
		expect(fetchMock.mock.calls[0][0].toString()).toBe(
			'https://backend.example.com/api/v1/auth/login'
		);
		const init = fetchMock.mock.calls[0][1];
		expect(new Headers(init?.headers).get('origin')).toBe('https://ui.example.com');
		expect(new Headers(init?.headers).get('x-csrf-token')).toBe('csrf');
		expect(init?.redirect).toBe('manual');
		expect(response.headers.getSetCookie()).toHaveLength(2);
	});
	it('returns a safe unavailable response when the upstream fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('private internal connection details');
			})
		);
		const request = new Request('https://ui.example.com/api/v1/auth/me');
		const response = await proxyApi(request, new URL(request.url), 'https://backend.example.com');
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private');
	});
	it('does not accept a configured URL containing embedded credentials', async () => {
		const request = new Request('https://ui.example.com/api/v1/auth/me');
		const response = await proxyApi(
			request,
			new URL(request.url),
			'https://user:password@backend.example.com'
		);
		expect(response.status).toBe(503);
	});
});
