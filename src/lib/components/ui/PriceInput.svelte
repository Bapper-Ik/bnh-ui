<script lang="ts">
	import { money } from '#lib/money.js';
	let { value = $bindable('0.00') }: { value: string } = $props();
	let editing = $state(false);
	let entry = $state('');
	function display(raw: string) {
		try {
			return money(raw).slice(1);
		} catch {
			return raw;
		}
	}
</script>

<input
	inputmode="decimal"
	required
	value={editing ? entry : display(value)}
	onfocus={() => {
		entry = '';
		editing = true;
	}}
	oninput={(event) => {
		entry = event.currentTarget.value;
		value = entry.replaceAll(',', '');
	}}
	onblur={() => (editing = false)}
/>
