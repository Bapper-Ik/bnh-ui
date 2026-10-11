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

<AccessLayout title="Sign In to Custodian" login>
	{#if page.url.searchParams.get('reason') === 'password-changed'}<p role="status">
			Your password was changed. Sign in with your new password.
		</p>{:else if page.url.searchParams.get('reason') === 'signed-out'}<p role="status">
			Your selected sessions have been signed out.
		</p>{/if}
	<form onsubmit={signIn} class="login-form" aria-busy={busy}>
		<label
			>Staff Email<input
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
					placeholder="Enter your password"
					bind:value={password}
					required
					maxlength="1024"
				/>
				<button
					type="button"
					class="quiet"
					aria-label={showPassword ? 'Hide Password' : 'Show Password'}
					aria-pressed={showPassword}
					onclick={() => (showPassword = !showPassword)}>{showPassword ? 'Hide' : 'Show'}</button
				>
			</div>
		</div>
		{#if error}<div class="error" role="alert">{error}</div>{/if}
		<button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
		<a class="forgot-password" href="/forgot-password">Forgot Password?</a>
	</form>
</AccessLayout>

<style>
	.login-form {
		display: grid;
		gap: 24px;
	}
	.login-form input {
		min-height: 52px;
		border-radius: 8px;
		font-size: 16px;
	}
	.login-form button[type='submit'] {
		min-height: 52px;
		border-radius: 8px;
		width: 100%;
	}
	.password-control {
		display: grid;
		gap: 9px;
	}
	.forgot-password {
		justify-self: center;
		font-size: 14px;
		color: var(--body);
	}
	.password-field {
		position: relative;
	}
	.password-field input {
		padding-right: 72px;
	}
	.password-field button {
		position: absolute;
		inset: 4px 4px 4px auto;
		padding: 8px 12px;
		font-size: 13px;
		border-radius: 6px;
	}
	.password-field button:hover {
		background: var(--surface);
		color: var(--ink);
	}
	[role='status'] {
		font-size: 14px;
		padding: 12px;
		background: var(--surface);
		border-radius: 8px;
	}
</style>
