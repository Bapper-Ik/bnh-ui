import { describe, expect, it } from 'vitest';
import { lineKobo, money, scaled } from './money.js';
describe('Exact NGN previews', () => {
	it('rounds each line half up to the kobo', () => {
		expect(lineKobo('0.5', '0.01')).toBe(1n);
		expect(lineKobo('1.5', '0.01')).toBe(2n);
	});
	it('preserves amounts above floating point precision', () => {
		expect(money('999999999999999.99')).toBe('₦999,999,999,999,999.99');
	});
	it('rejects malformed money and nonpositive quantities', () => {
		expect(() => scaled('1.001', 2)).toThrow();
		expect(() => scaled('Infinity', 2)).toThrow();
		expect(() => lineKobo('0', '1')).toThrow();
	});
});
