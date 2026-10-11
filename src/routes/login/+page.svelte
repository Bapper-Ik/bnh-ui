<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api } from '#lib/api/client.js';
	import AccessLayout from '#lib/features/account/AccessLayout.svelte';
	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
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

<AccessLayout title="Sign in to Custodian">
	{#if page.url.searchParams.get('reason') === 'password-changed'}<p role="status">
			Your password was changed. Sign in with your new password.
		</p>{:else if page.url.searchParams.get('reason') === 'signed-out'}<p role="status">
			Your selected sessions have been signed out.
		</p>{/if}
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
		<div class="password-control">
			<label for="login-password">Password</label>
			<div class="password-field">
				<input
					id="login-password"
					type={showPassword ? 'text' : 'password'}
					autocomplete="current-password"
					bind:value={password}
					required
					maxlength="1024"
				/>
				<button
					type="button"
					class="quiet"
					aria-label={showPassword ? 'Hide password' : 'Show password'}
					aria-pressed={showPassword}
					onclick={() => (showPassword = !showPassword)}>{showPassword ? 'Hide' : 'Show'}</button
				>
			</div>
		</div>
		<a href="/forgot-password">Forgot password?</a>
		{#if error}<div class="error" role="alert">{error}</div>{/if}
		<button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
		<p class="note">Access is by invitation. Contact your administrator if you need an account.</p>
	</form>
</AccessLayout>

<style>
	.password-control {
		display: grid;
		gap: 9px;
	}
	.password-field {
		position: relative;
	}
	.password-field input {
		padding-right: 72px;
	}
	.password-field button {
		position: absolute;
		inset: 2px 2px 2px auto;
		padding: 8px 12px;
		font-size: 13px;
	}

	.note {
		font-size: 12px;
		text-align: center;
		margin: 0;
	}
</style>
