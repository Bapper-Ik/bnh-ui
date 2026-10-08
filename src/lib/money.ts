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
		PENDING_AUTHORITY: 'Awaiting approval',
		APPROVED: 'Approved',
		REJECTED: 'Rejected',
		RETURNED_FOR_REVISION: 'Returned for revision',
		AWAITING_BOARD_RESOLUTION: 'Awaiting Board resolution',
		AWAITING_CHAIRMAN_SIGNOFF: 'Awaiting Chairman sign-off',
		DEFERRED: 'Deferred',
		CONDITIONALLY_APPROVED: 'Conditional approval — on hold',
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
