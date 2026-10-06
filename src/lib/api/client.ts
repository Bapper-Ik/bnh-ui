export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string
	) {
		super(message);
	}
}

function csrfToken(): string {
	const cookie = document.cookie.split('; ').find((entry) => entry.startsWith('custodian_csrf='));
	return cookie ? decodeURIComponent(cookie.slice('custodian_csrf='.length)) : '';
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (init.body && !(init.body instanceof FormData))
		headers.set('Content-Type', 'application/json');
	if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase()))
		headers.set('X-CSRF-Token', csrfToken());
	const response = await fetch('/api/v1' + path, { ...init, headers, credentials: 'same-origin' });
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		throw new ApiError(
			response.status,
			body?.code ?? 'REQUEST_FAILED',
			body?.message ?? 'The service could not complete this action. Please try again.'
		);
	}
	return body as T;
}
