export function scaled(value: string, places: number): bigint {
	if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a positive decimal amount.');
	const [whole, fraction = ''] = value.split('.');
	if (fraction.length > places) throw new Error('Too many decimal places.');
	return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
}
export function lineKobo(quantity: string, unitPrice: string): bigint {
	const qty = scaled(quantity, 4);
	if (qty <= 0n) throw new Error('Quantity must be greater than zero.');
	return (qty * scaled(unitPrice, 2) + 5000n) / 10000n;
}
export function formatKobo(kobo: bigint): string {
	return (
		'₦' +
		new Intl.NumberFormat('en-NG').format(kobo / 100n) +
		'.' +
		(kobo % 100n).toString().padStart(2, '0')
	);
}
export function money(value: string): string {
	return formatKobo(scaled(value, 2));
}
export function stateLabel(value: string): string {
	const labels: Record<string, string> = {
		DRAFT: 'Draft',
		PENDING_AUTHORITY: 'Awaiting Approval',
		APPROVED: 'Approved',
		REJECTED: 'Rejected',
		RETURNED_FOR_REVISION: 'Returned for Revision',
		AWAITING_BOARD_RESOLUTION: 'Awaiting Board Resolution',
		AWAITING_CHAIRMAN_SIGNOFF: 'Awaiting Chairman Sign-Off',
		DEFERRED: 'Deferred',
		CONDITIONALLY_APPROVED: 'Conditional Approval — on Hold',
		RETURNED_TO_SECRETARY: 'Returned to Secretary'
	};
	return labels[value] ?? value;
}
export function dateTime(value: string): string {
	return new Intl.DateTimeFormat('en-NG', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Africa/Lagos'
	}).format(new Date(value));
}

export function authorityLabel(value: string): string {
	const labels: Record<string, string> = {
		hod: 'Head of Department (HOD)',
		chief_of_staff: 'Chief of Staff',
		md: 'Managing Director (MD)',
		board: 'Board of Directors'
	};
	return labels[value] ?? value;
}

// For application-generated headings only; never apply to entered names or signed text.
export function headingLabel(value: string): string {
	const minor = new Set([
		'a',
		'an',
		'and',
		'as',
		'at',
		'by',
		'for',
		'in',
		'of',
		'on',
		'or',
		'the',
		'to'
	]);
	return value.replace(/[A-Za-z]+/g, (word, offset: number) =>
		offset > 0 && minor.has(word.toLowerCase())
			? word.toLowerCase()
			: word[0].toUpperCase() + word.slice(1)
	);
}
