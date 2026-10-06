<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '#lib/api/client.js';
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
			await goto('/vendors');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to sign in.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="login">
	<header>
		<a href="/login" class="brand"
			><span class="mark">C</span><span>Custodian<small>BY BRENDAN</small></span></a
		><span class="company">Brendan Nicholas Holdings</span>
	</header>
	<main>
		<div class="intro">
			<span class="eyebrow">BNH STAFF WORKSPACE</span>
			<h1>Sign in to Custodian</h1>
			<p>
				One place to raise requisitions, review requests and keep a clear record of every decision.
			</p>
		</div>
		<form onsubmit={signIn} class="stack">
			<label for="email"
				>Work email<input
					id="email"
					type="email"
					autocomplete="username"
					bind:value={email}
					required
					placeholder="you@company.com"
				/></label
			>
			<label for="password"
				>Password<input
					id="password"
					type="password"
					autocomplete="current-password"
					bind:value={password}
					required
				/></label
			>
			{#if error}<div class="error" role="alert">{error}</div>{/if}
			<button type="submit" disabled={busy}
				>{busy ? 'Signing in…' : 'Sign in'}<span aria-hidden="true">→</span></button
			>
			<p class="access-note">
				Access is provided by your administrator. Contact them if you need an account or help
				signing in.
			</p>
		</form>
	</main>
	<footer>
		<span>Custodian · Requisitions & approvals</span><span>For authorised BNH staff</span>
	</footer>
</div>

<style>
	.login {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		padding: 36px 48px;
	}
	header,
	footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
	}
	.brand {
		text-decoration: none;
		display: flex;
		align-items: center;
		gap: 13px;
		font-size: 21px;
		font-weight: 600;
	}
	.brand small {
		display: block;
		font-size: 10px;
		font-weight: 400;
		margin-top: 4px;
	}
	.mark {
		display: grid;
		place-items: center;
		background: var(--ink);
		color: white;
		width: 43px;
		height: 43px;
		border-radius: 4px;
		font-size: 27px;
	}
	.company {
		font-size: 13px;
		color: var(--body);
	}
	main {
		width: 100%;
		max-width: 410px;
		margin: auto;
		padding: 70px 0 90px;
	}
	.intro {
		margin-bottom: 34px;
	}
	h1 {
		margin: 17px 0 14px;
		font-size: 31px;
	}
	.intro p {
		font-size: 15px;
	}
	form button {
		justify-content: space-between;
		margin-top: 4px;
	}
	.access-note {
		font-size: 12px;
		text-align: center;
		margin: 0;
	}
	footer {
		font-size: 11px;
		color: var(--body);
		border-top: 1px solid var(--rule);
		padding-top: 21px;
	}
	@media (max-width: 600px) {
		.login {
			padding: 25px 24px;
		}
		.company {
			display: none;
		}
		footer {
			flex-direction: column;
			align-items: flex-start;
			gap: 8px;
		}
		main {
			padding: 60px 0;
		}
	}
</style>
