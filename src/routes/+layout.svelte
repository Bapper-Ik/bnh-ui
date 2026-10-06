<script lang="ts">
	import '#lib/styles/app.css';
	let { children } = $props();
</script>

<svelte:head
	><title>Custodian · BNH</title><meta
		name="description"
		content="BNH requisitions and approval workspace"
	/></svelte:head
>
{@render children()}
