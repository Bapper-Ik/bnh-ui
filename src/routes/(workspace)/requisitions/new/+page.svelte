<script lang="ts">
	import { goto } from '$app/navigation';
	import RequisitionForm from '#lib/features/requisitions/RequisitionForm.svelte';
	let { data } = $props();
</script>

<div class="page-header">
	<div>
		<p class="eyebrow">NEW REQUEST</p>
		<h1>Create a requisition</h1>
		<p>Start with the details you have. You can return to your draft.</p>
	</div>
</div>
{#if data.memberships.length}<RequisitionForm
		memberships={data.memberships}
		onSaved={(req) => goto('/requisitions/' + req.id)}
	/>{:else}<div class="empty">
		<h2>Your department hasn’t been assigned</h2>
		<p>
			Contact your administrator to link your account to a company and department before raising a
			requisition.
		</p>
		<a class="button secondary" href="/requisitions">Back to requisitions</a>
	</div>{/if}
