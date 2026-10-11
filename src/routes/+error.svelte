<script lang="ts">
	import { page } from '$app/state';
	import AccessLayout from '#lib/features/account/AccessLayout.svelte';
</script>

<AccessLayout
	title={page.status === 404 ? 'Page Unavailable' : 'Unable to Load This Page'}
	description={page.status === 404
		? 'This page could not be found. Return to sign in to open your workspace.'
		: 'The service is temporarily unavailable. Please retry in a moment.'}
>
	<div class="stack">
		<p role="alert">
			{page.status === 404
				? 'Check the address or use the link below.'
				: 'Your request could not be completed.'}
		</p>
		{#if page.status !== 404}<button onclick={() => window.location.reload()}>Retry</button>{/if}<a
			href="/login">Back to Sign In</a
		>
	</div>
</AccessLayout>
