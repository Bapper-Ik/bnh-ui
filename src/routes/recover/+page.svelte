<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { LinkStatus } from '#lib/api/schema.js';
	import AccessLayout from '#lib/features/account/AccessLayout.svelte';
	let token = '';
	let viewState = $state<'checking' | 'ready' | 'invalid' | 'unavailable' | 'success'>('checking');
	let purpose = $state<'reset' | 'activate'>('reset');
	let password = $state('');
	let confirmation = $state('');
	let error = $state('');
	let busy = $state(false);
	let showPassword = $state(false);
	const title = $derived(
		viewState === 'success'
			? 'Your password is set'
			: viewState === 'invalid'
				? 'This link is unavailable'
				: purpose === 'activate'
					? 'Activate your account'
					: 'Set your password'
	);
	async function validateLink() {
		if (!token) {
			viewState = 'invalid';
			return;
		}
		viewState = 'checking';
		error = '';
		try {
			const result = await api<LinkStatus>('/auth/link-status', {
				method: 'POST',
				body: JSON.stringify({ token })
			});
			purpose = result.purpose;
			viewState = 'ready';
		} catch (e) {
			viewState =
				e instanceof ApiError && [400, 422].includes(e.status) ? 'invalid' : 'unavailable';
			error = viewState === 'unavailable' ? 'We could not check your link. Please retry.' : '';
		}
	}
	onMount(() => {
		async function readLink() {
			token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
			// Keep the bearer secret only in memory, never URL history/storage.
			await goto('/recover', { replaceState: true });
			password = '';
			confirmation = '';
			await validateLink();
		}
		void readLink();
		window.addEventListener('hashchange', readLink);
		return () => {
			token = '';
			window.removeEventListener('hashchange', readLink);
		};
	});
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		error = '';
		if (password !== confirmation) {
			error = 'The passwords do not match.';
			return;
		}
		busy = true;
		try {
			await api('/auth/recover', { method: 'POST', body: JSON.stringify({ token, password }) });
			token = '';
			password = '';
			confirmation = '';
			viewState = 'success';
		} catch (e) {
			if (e instanceof ApiError && e.code === 'RECOVERY_INVALID') viewState = 'invalid';
			else error = e instanceof Error ? e.message : 'Unable to set your password. Please retry.';
		} finally {
			busy = false;
		}
	}
</script>

<AccessLayout
	{title}
	description={viewState === 'success'
		? 'Sign in using your new password. Previous sessions have been signed out.'
		: 'Choose a password only you know. Your department and access are managed by your administrator.'}
>
	{#if viewState === 'checking'}<p role="status">Checking your secure link…</p>
	{:else if viewState === 'invalid'}<div class="stack">
			<p role="alert">
				This link is invalid, expired, or has already been used. Request a new link to continue.
			</p>
			<a href="/forgot-password" class="button">Request a new link</a><a href="/login"
				>Back to sign in</a
			>
		</div>
	{:else if viewState === 'unavailable'}<div class="stack">
			<p class="error" role="alert">{error}</p>
			<button onclick={validateLink}>Retry</button>
		</div>
	{:else if viewState === 'success'}<div class="stack">
			<p role="status">
				{purpose === 'activate' ? 'Your account is ready.' : 'Your password has been updated.'}
			</p>
			<a class="button" href="/login">Sign in</a>
		</div>
	{:else}<form class="stack" onsubmit={save} aria-busy={busy}>
			<label
				>New password<input
					type={showPassword ? 'text' : 'password'}
					autocomplete="new-password"
					minlength="12"
					maxlength="1024"
					required
					bind:value={password}
					aria-describedby="password-help"
				/></label
			>
			<small id="password-help">Use at least 12 characters.</small>
			<label
				>Confirm new password<input
					type={showPassword ? 'text' : 'password'}
					autocomplete="new-password"
					minlength="12"
					maxlength="1024"
					required
					bind:value={confirmation}
				/></label
			>
			<label class="toggle"
				><input type="checkbox" bind:checked={showPassword} />Show passwords</label
			>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button disabled={busy} type="submit"
				>{busy
					? 'Saving password…'
					: purpose === 'activate'
						? 'Activate account'
						: 'Set password'}</button
			>
			<a href="/login">Back to sign in</a>
		</form>{/if}
</AccessLayout>

<style>
	.toggle {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 400;
	}
	.toggle input {
		width: 18px;
		min-height: 18px;
	}
</style>
