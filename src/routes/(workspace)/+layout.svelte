<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { afterNavigate, goto } from '$app/navigation';
	import NotificationDrawer from '#lib/features/notifications/NotificationDrawer.svelte';
	import { api } from '#lib/api/client.js';
	let { data, children } = $props();
	let navigation: HTMLDialogElement;
	let accountMenu: HTMLDivElement;
	let accountTrigger: HTMLElement;
	let navigationOpen = $state(false);
	let accountOpen = $state(false);
	let signingOut = $state(false);
	let error = $state('');
	const initials = $derived(
		data.user.name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((name: string) => name[0])
			.join('')
			.toUpperCase()
	);
	const links = $derived([
		{ href: '/', label: 'Dashboard', icon: '⌂', visible: true },
		{ href: '/requisitions', label: 'Requisitions', icon: '▤', visible: true },
		{
			href: '/requisitions?inbox=true',
			label: 'My Tasks',
			icon: '☷',
			visible: data.user.can_access_approval_inbox
		},
		{ href: '/vendors', label: 'Vendors', icon: '▦', visible: true },
		{
			href: '/staff',
			label: 'Staff & Access',
			icon: '♙',
			visible: data.user.permissions.includes('staff:manage') && !data.user.read_only
		},
		{
			href: '/organisation',
			label: 'Organisation & Authority',
			icon: '▤',
			visible: data.user.permissions.includes('organisation:manage') && !data.user.read_only
		},
		{
			href: '/audit',
			label: 'Audit Log',
			icon: '≡',
			visible: data.user.permissions.includes('audit:read')
		},
		{ href: '/account', label: 'My Account & Security', icon: '♙', visible: true }
	]);
	function active(href: string) {
		if (href === '/requisitions?inbox=true')
			return page.url.pathname === '/requisitions' && page.url.searchParams.get('inbox') === 'true';
		if (href === '/requisitions')
			return page.url.pathname.startsWith(href) && page.url.searchParams.get('inbox') !== 'true';
		return page.url.pathname === href;
	}
	function openNavigation() {
		accountOpen = false;
		navigation.showModal();
		navigationOpen = true;
	}
	function dismissAccount(event: MouseEvent) {
		if (accountOpen && event.target instanceof Node && !accountMenu.contains(event.target))
			accountOpen = false;
	}
	function escapeAccount(event: KeyboardEvent) {
		if (event.key === 'Escape' && accountOpen) {
			accountOpen = false;
			accountTrigger.focus();
		}
	}
	function navigationKeys(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const controls = navigation.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
		const first = controls[0],
			last = controls[controls.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	}
	function dismissBackdrop(event: MouseEvent) {
		const bounds = navigation.getBoundingClientRect();
		if (
			event.target === navigation &&
			(event.clientX < bounds.left ||
				event.clientX > bounds.right ||
				event.clientY < bounds.top ||
				event.clientY > bounds.bottom)
		)
			navigation.close();
	}
	afterNavigate(() => {
		navigation?.close();
		accountOpen = false;
	});
	onMount(() => {
		const desktop = window.matchMedia('(min-width: 901px)');
		const changed = () => {
			if (desktop.matches) navigation.close();
		};
		desktop.addEventListener('change', changed);
		return () => desktop.removeEventListener('change', changed);
	});
	$effect(() => {
		if (!navigationOpen) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});
	async function signOut() {
		if (signingOut) return;
		signingOut = true;
		error = '';
		try {
			await api('/auth/logout', { method: 'POST' });
			await goto('/login', { invalidateAll: true });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to sign out.';
		} finally {
			signingOut = false;
		}
	}
</script>

<svelte:window onclick={dismissAccount} onkeydown={escapeAccount} />

{#snippet navigationLinks()}
	<nav aria-label="Main navigation">
		{#each links.filter((link) => link.visible) as link (link.href)}
			<a
				href={link.href}
				class:active={active(link.href)}
				aria-current={active(link.href) ? 'page' : undefined}
				onclick={() => navigation?.close()}
			>
				<span aria-hidden="true">{link.icon}</span>{link.label}
			</a>
		{/each}
	</nav>
{/snippet}

<a class="skip-link" href="#main-content">Skip to content</a>
<div class="workspace">
	<aside class="desktop-sidebar">
		<a href="/" class="brand"
			><span class="mark">C</span><span>Custodian<small>BY BRENDAN</small></span></a
		>
		<div class="group-label">WORKSPACE</div>
		{@render navigationLinks()}
		<div class="sidebar-note">
			Brendan Nicholas Holdings
			<p>Requisitions & delegated authority</p>
		</div>
	</aside>
	<div class="body">
		<header class="workspace-header">
			<button
				class="quiet menu-toggle"
				aria-label="Open navigation"
				aria-haspopup="dialog"
				aria-controls="mobile-navigation"
				aria-expanded={navigationOpen}
				onclick={openNavigation}
			>
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.7"
					aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg
				>
			</button>
			<a href="/" class="mobile-brand">Custodian</a>
			<span class="context">BNH / Staff workspace</span>
			<div class="header-actions">
				{#key data.user.id}<NotificationDrawer />{/key}
				<div class="account-menu" class:account-open={accountOpen} bind:this={accountMenu}>
					<button
						class="quiet account-trigger"
						onclick={() => (accountOpen = !accountOpen)}
						aria-controls="account-panel"
						bind:this={accountTrigger}
						aria-expanded={accountOpen}
						aria-label="Account menu"
						title={data.user.name}
					>
						<span class="avatar" aria-hidden="true">{initials}</span>
						<span class="account-name">{data.user.name}</span>
						<svg
							class="chevron"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
						>
					</button>
					{#if accountOpen}<div id="account-panel" class="account-panel">
							<div class="account-details">
								<strong>{data.user.name}</strong><small>{data.user.email}</small>
							</div>
							<a href="/account" onclick={() => (accountOpen = false)}>My Account &amp; Security</a>
							<button class="quiet" onclick={signOut} disabled={signingOut}
								>{signingOut ? 'Signing out…' : 'Sign out'}</button
							>
							{#if error}<div class="error" role="alert">{error}</div>{/if}
						</div>{/if}
				</div>
			</div>
		</header>
		<main id="main-content" tabindex="-1">{@render children()}</main>
		<footer>
			<span>Custodian by Brendan</span><span>All times shown in Lagos time · WAT</span>
		</footer>
	</div>
</div>
<dialog
	id="mobile-navigation"
	class="navigation-panel"
	bind:this={navigation}
	aria-labelledby="navigation-title"
	onclose={() => (navigationOpen = false)}
	onpointerdown={dismissBackdrop}
	onkeydown={navigationKeys}
>
	<div class="drawer-heading">
		<div>
			<p class="eyebrow">CUSTODIAN BY BRENDAN</p>
			<h2 id="navigation-title">Workspace</h2>
		</div>
		<button class="quiet" aria-label="Close navigation" onclick={() => navigation.close()}>✕</button
		>
	</div>
	{@render navigationLinks()}
	<div class="sidebar-note">
		Brendan Nicholas Holdings
		<p>Requisitions & delegated authority</p>
	</div>
</dialog>

<style>
	.workspace {
		min-height: 100dvh;
		display: grid;
		grid-template-columns: 235px minmax(0, 1fr);
	}
	.desktop-sidebar {
		position: sticky;
		top: 0;
		height: 100dvh;
		overflow-y: auto;
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
		min-height: 46px;
		padding: 13px 14px;
		border-radius: 5px;
		font-size: 14px;
		color: var(--body);
		display: flex;
		align-items: center;
		gap: 12px;
	}
	nav a span {
		width: 16px;
		flex-shrink: 0;
		text-align: center;
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
	.workspace-header {
		position: sticky;
		top: 0;
		z-index: 10;
		min-height: 80px;
		border-bottom: 1px solid var(--rule);
		background: var(--white);
		padding: 14px 32px;
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.context {
		color: var(--body);
		font-size: 12px;
		min-width: 0;
	}
	.header-actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.account-menu {
		position: relative;
		min-width: 0;
	}
	.account-trigger {
		font-weight: 400;
		color: var(--ink);
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		min-height: 44px;
		padding: 4px;
		border-radius: 5px;
		font-size: 13px;
	}
	.account-trigger:hover,
	.account-menu.account-open .account-trigger {
		background: var(--surface);
	}
	.avatar {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		border: 1px solid var(--rule);
		border-radius: 50%;
		background: var(--surface);
		font-size: 12px;
		font-weight: 600;
	}
	.account-name {
		max-width: 180px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chevron {
		flex-shrink: 0;
	}
	.account-panel {
		position: absolute;
		top: calc(100% + 12px);
		right: 0;
		width: min(300px, calc(100vw - 32px));
		max-height: calc(100dvh - 88px);
		overflow-y: auto;
		padding: 8px;
		background: var(--white);
		border: 1px solid var(--rule);
		border-radius: 8px;
		box-shadow: 0 8px 28px rgb(0 0 0 / 0.1);
	}
	.account-details {
		padding: 12px;
		margin-bottom: 6px;
		border-bottom: 1px solid var(--rule);
		overflow-wrap: anywhere;
	}
	.account-details strong {
		font-size: 14px;
		font-weight: 600;
	}
	.account-details small {
		display: block;
		margin-top: 5px;
		font-size: 12px;
	}
	.account-panel a,
	.account-panel button {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		text-decoration: none;
		min-height: 44px;
		padding: 12px;
		border-radius: 4px;
		font-size: 13px;
		color: var(--ink);
	}
	.account-panel a:hover,
	.account-panel button:hover {
		background: var(--surface);
	}
	.account-panel .error {
		margin: 8px 0 0;
	}
	main {
		padding: 40px;
		max-width: 1400px;
		width: 100%;
		min-width: 0;
		margin: 0 auto;
		flex: 1;
		scroll-margin-top: 96px;
	}
	footer {
		display: flex;
		justify-content: space-between;
		gap: 15px;
		padding: 24px 40px;
		color: var(--body);
		font-size: 10px;
	}
	.menu-toggle,
	.mobile-brand {
		display: none;
	}
	.navigation-panel {
		position: fixed;
		inset: 0 auto 0 0;
		margin: 0;
		width: min(320px, calc(100vw - 32px));
		max-width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		border: 0;
		border-right: 1px solid var(--rule);
		padding: max(20px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.navigation-panel::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	.drawer-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 0 22px 12px;
	}
	.drawer-heading p {
		margin: 0 0 6px;
		font-size: 10px;
	}
	.drawer-heading h2 {
		margin: 0;
	}
	.drawer-heading button {
		padding: 10px;
		width: 44px;
		flex-shrink: 0;
	}
	.skip-link {
		position: fixed;
		top: 8px;
		left: 8px;
		transform: translateY(-200%);
		z-index: 20;
		padding: 12px;
		background: var(--white);
		border: 1px solid var(--ink);
	}
	.skip-link:focus {
		transform: translateY(0);
	}
	@media (max-width: 1100px) {
		.context {
			display: none;
		}
	}
	@media (max-width: 900px) {
		.workspace {
			grid-template-columns: minmax(0, 1fr);
		}
		.desktop-sidebar {
			display: none;
		}
		.workspace-header {
			min-height: 64px;
			padding: 10px 16px;
			gap: 8px;
			padding-top: max(10px, env(safe-area-inset-top));
		}
		.menu-toggle {
			display: inline-flex;
			width: 44px;
			height: 44px;
			padding: 10px;
			flex-shrink: 0;
		}
		.mobile-brand {
			display: block;
			font-size: 18px;
			font-weight: 600;
			text-decoration: none;
		}
		.header-actions {
			gap: 6px;
		}
		.account-name,
		.chevron {
			display: none;
		}
		.account-trigger {
			width: 44px;
			justify-content: center;
		}
		main {
			padding: 28px 24px;
			scroll-margin-top: 80px;
		}
		footer {
			padding: 24px;
		}
	}
	@media (max-width: 550px) {
		.workspace-header {
			padding-right: 12px;
			padding-left: 12px;
		}
		main {
			padding: 24px 16px;
		}
		footer {
			padding: 24px 16px;
			flex-direction: column;
		}
	}
</style>
