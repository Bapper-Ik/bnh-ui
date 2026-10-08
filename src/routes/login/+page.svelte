<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '#lib/api/client.js';
	import AccessLayout from '#lib/features/account/AccessLayout.svelte';
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
			password = '';
			await goto('/', { invalidateAll: true });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to sign in.';
		} finally {
			busy = false;
		}
	}
</script>

<AccessLayout
	title="Sign in to Custodian"
	description="One place to raise requisitions, review requests and keep a clear record of every decision."
>
	<form onsubmit={signIn} class="stack" aria-busy={busy}>
		<label
			>Work email<input
				type="email"
				autocomplete="username"
				bind:value={email}
				required
				maxlength="254"
				placeholder="you@company.com"
			/></label
		>
		<label
			>Password<input
				type="password"
				autocomplete="current-password"
				bind:value={password}
				required
				maxlength="1024"
			/></label
		>
		<a href="/forgot-password">Forgot password?</a>
		{#if error}<div class="error" role="alert">{error}</div>{/if}
		<button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
		<p class="note">Access is by invitation. Contact your administrator if you need an account.</p>
	</form>
</AccessLayout>

<style>
	.note {
		font-size: 12px;
		text-align: center;
		margin: 0;
	}
</style>
