<script lang="ts">
	import { api } from '#lib/api/client.js';
	import AccessLayout from '#lib/features/account/AccessLayout.svelte';
	import type { Message } from '#lib/api/schema.js';
	let email = $state('');
	let error = $state('');
	let message = $state('');
	let busy = $state(false);
	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			const result = await api<Message>('/auth/forgot-password', {
				method: 'POST',
				body: JSON.stringify({ email })
			});
			message = result.message;
			email = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to request a link. Please retry.';
		} finally {
			busy = false;
		}
	}
</script>

<AccessLayout
	title={message ? 'Check your email' : 'Forgot your password?'}
	description={message
		? 'Follow the link to choose your password.'
		: 'Enter your work email to request a secure password link. You can also request a new account activation link here.'}
>
	{#if message}<div class="stack">
			<p role="status">{message}</p>
			<p>Links expire after 30 minutes. If you requested more than one, use the latest email.</p>
			<a href="/login" class="button">Back to sign in</a><button
				class="quiet"
				onclick={() => (message = '')}>Use another email</button
			>
		</div>
	{:else}<form onsubmit={send} class="stack" aria-busy={busy}>
			<label
				>Work email<input
					type="email"
					autocomplete="email"
					bind:value={email}
					required
					maxlength="254"
					placeholder="you@company.com"
				/></label
			>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button type="submit" disabled={busy}
				>{busy ? 'Requesting link…' : 'Send password link'}</button
			>
			<a href="/login">Back to sign in</a>
		</form>{/if}
</AccessLayout>
