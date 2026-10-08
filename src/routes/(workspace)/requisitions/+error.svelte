<script lang="ts">
	import { page } from '$app/state';
</script>

<section class="card stack">
	<h1>
		{page.status === 403 || page.status === 404
			? 'Requisition unavailable'
			: 'Unable to load requisitions'}
	</h1>
	<p role="alert">{page.error?.message ?? 'Try again or return to your requisitions.'}</p>
	<div class="actions">
		<button onclick={() => window.location.reload()}>Retry</button><a href="/requisitions"
			>Back to requisitions</a
		>
	</div>
</section>
