<script lang="ts">
	import BoardWorkspace from '#lib/features/board/BoardWorkspace.svelte';
	let { data } = $props();
</script>

{#key data.board.request.version}<BoardWorkspace board={data.board} />{/key}
