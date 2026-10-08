<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import NotificationDrawer from '#lib/features/notifications/NotificationDrawer.svelte';
	import { api } from '#lib/api/client.js';
	let { data, children } = $props();
	let error = $state('');
	async function signOut() {
		try {
			await api('/auth/logout', { method: 'POST' });
			await goto('/login', { invalidateAll: true });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to sign out.';
		}
	}
</script>

<div class="workspace">
	<aside>
		<a href="/vendors" class="brand"
			><span class="mark">C</span><span>Custodian<small>BY BRENDAN</small></span></a
		>
		<div class="group-label">WORKSPACE</div>
		<nav aria-label="Main navigation">
			<a
				href="/requisitions"
				class:active={page.url.pathname.startsWith('/requisitions') &&
					page.url.searchParams.get('inbox') !== 'true'}
				><span aria-hidden="true">▤</span> Requisitions</a
			>
			{#if data.user.can_access_approval_inbox}
				<a
					href="/requisitions?inbox=true"
					class:active={page.url.searchParams.get('inbox') === 'true'}
					><span aria-hidden="true">☷</span> My Tasks</a
				>
			{/if}
			<a href="/vendors" class:active={page.url.pathname === '/vendors'}
				><span aria-hidden="true">▦</span> Vendors</a
			>
			{#if data.user.permissions.includes('staff:manage') && !data.user.read_only}
				<a href="/staff" class:active={page.url.pathname === '/staff'}
					><span aria-hidden="true">♙</span> Staff & Access</a
				>
			{/if}
			{#if data.user.permissions.includes('organisation:manage') && !data.user.read_only}
				<a href="/organisation" class:active={page.url.pathname === '/organisation'}
					><span aria-hidden="true">▤</span> Organisation & Authority</a
				>
			{/if}
			{#if data.user.permissions.includes('audit:read')}
				<a href="/audit" class:active={page.url.pathname === '/audit'}
					><span aria-hidden="true">≡</span> Audit Log</a
				>
			{/if}
		</nav>
		<div class="sidebar-note">
			Brendan Nicholas Holdings
			<p>Requisitions & delegated authority</p>
		</div>
	</aside>
	<div class="body">
		<header>
			<span class="context">BNH / Staff workspace</span>
			<div class="identity">
				{#key data.user.id}<NotificationDrawer />{/key}
				<span>{data.user.name}<small>{data.user.email}</small></span><button
					class="quiet"
					onclick={signOut}>Sign out</button
				>
			</div>
		</header>
		<main id="main-content">
			{#if error}<div class="error" role="alert">{error}</div>{/if}{@render children()}
		</main>
		<footer>
			<span>Custodian by Brendan</span><span>All times shown in Lagos time · WAT</span>
		</footer>
	</div>
</div>

<style>
	.workspace {
		min-height: 100dvh;
		display: grid;
		grid-template-columns: 235px minmax(0, 1fr);
	}
	aside {
		border-right: 1px solid var(--rule);
		padding: 32px 20px;
		display: flex;
		flex-direction: column;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 11px;
		text-decoration: none;
		font-size: 21px;
		font-weight: 600;
		padding: 0 10px;
	}
	.brand small {
		display: block;
		font-size: 9px;
		font-weight: 400;
		margin-top: 4px;
	}
	.mark {
		width: 37px;
		height: 37px;
		border-radius: 4px;
		background: var(--ink);
		color: white;
		display: grid;
		place-items: center;
		font-size: 24px;
	}
	.group-label {
		color: var(--body);
		font-size: 10px;
		margin: 54px 12px 15px;
	}
	nav {
		display: grid;
		gap: 6px;
	}
	nav a {
		text-decoration: none;
		padding: 13px 14px;
		border-radius: 5px;
		font-size: 14px;
		color: var(--body);
		display: flex;
		gap: 12px;
	}
	nav a.active {
		color: var(--ink);
		background: var(--surface);
		font-weight: 600;
	}
	nav a:hover {
		background: var(--surface);
	}
	.sidebar-note {
		margin-top: auto;
		padding: 48px 12px 0;
		font-size: 11px;
		color: var(--body);
	}
	.sidebar-note p {
		margin: 8px 0 0;
		font-size: 11px;
	}
	.body {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	header {
		min-height: 92px;
		border-bottom: 1px solid var(--rule);
		padding: 20px 40px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
	}
	.context {
		color: var(--body);
		font-size: 12px;
	}
	.identity {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: 18px;
		font-size: 13px;
	}
	.identity span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.identity button {
		flex-shrink: 0;
	}
	.identity small {
		display: block;
		font-size: 11px;
		margin-top: 5px;
	}
	.identity button {
		font-size: 12px;
	}
	main {
		padding: 40px;
		max-width: 1400px;
		width: 100%;
		margin: 0 auto;
		flex: 1;
	}
	footer {
		display: flex;
		justify-content: space-between;
		gap: 15px;
		padding: 24px 40px;
		color: var(--body);
		font-size: 10px;
	}
	@media (max-width: 900px) {
		.workspace {
			grid-template-columns: 1fr;
		}
		aside {
			border-right: 0;
			border-bottom: 1px solid var(--rule);
			padding: 20px 24px;
		}
		.group-label,
		.sidebar-note {
			display: none;
		}
		nav {
			display: flex;
			margin-top: 20px;
			flex-wrap: wrap;
		}
		header {
			padding: 16px 24px;
		}
		main {
			padding: 28px 24px;
		}
		footer {
			padding: 24px;
		}
	}
	@media (max-width: 550px) {
		.context {
			display: none;
		}
		header {
			justify-content: flex-end;
		}
		footer {
			flex-direction: column;
		}
	}
</style>
