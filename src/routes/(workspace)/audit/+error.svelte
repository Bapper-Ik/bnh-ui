<script lang="ts">
	import { page } from '$app/state';
</script>

<section class="card stack">
	<h1>{page.status === 403 ? 'Audit Log access restricted' : 'Unable to load the Audit Log'}</h1>
	<p role="alert">{page.error?.message ?? 'Please try again.'}</p>
	<div class="actions">
		<button onclick={() => window.location.reload()}>Retry</button><a href="/requisitions"
			>Back to requisitions</a
		>
	</div>
</section>
