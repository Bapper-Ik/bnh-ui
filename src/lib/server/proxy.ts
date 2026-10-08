/**
 * Forward only to the operator-configured backend. Cookies stay on the UI origin.
 * No user-provided host, redirect following or arbitrary upstream URL is accepted.
 */
export async function proxyApi(request: Request, url: URL, backend: string): Promise<Response> {
	let base: URL;
	try {
		base = new URL(backend);
		if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
			throw new Error();
	} catch {
		return Response.json(
			{ code: 'SERVICE_UNAVAILABLE', message: 'The backend connection is not configured.' },
			{ status: 503 }
		);
	}
	const target = new URL(base.origin);
	target.pathname = url.pathname;
	target.search = url.search;
	const headers = new Headers();
	for (const name of ['content-type', 'cookie', 'x-csrf-token', 'origin', 'accept']) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	try {
		const upstream = await fetch(target, {
			method: request.method,
			headers,
			body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
			redirect: 'manual',
			signal: AbortSignal.timeout(30_000)
		});
		const responseHeaders = new Headers();
		for (const name of [
			'content-type',
			'content-disposition',
			'content-security-policy',
			'cache-control',
			'x-request-id',
			'retry-after'
		]) {
			const value = upstream.headers.get(name);
			if (value) responseHeaders.set(name, value);
		}
		for (const cookie of upstream.headers.getSetCookie())
			responseHeaders.append('set-cookie', cookie);
		responseHeaders.set('cache-control', 'no-store');
		responseHeaders.set('x-content-type-options', 'nosniff');
		return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
	} catch {
		return Response.json(
			{
				code: 'SERVICE_UNAVAILABLE',
				message: 'The service is temporarily unavailable. Please retry.'
			},
			{ status: 503 }
		);
	}
}
