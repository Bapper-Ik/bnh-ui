<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { DashboardView } from '#lib/api/schema.js';
	import { dateTime, money, stateLabel } from '#lib/money.js';
	let { data } = $props();
	let dashboard = $state<DashboardView | null>(null),
		busy = $state(false),
		error = $state('');
	let stopped = false;
	const controller = new AbortController();
	async function refresh() {
		if (busy || stopped) return;
		busy = true;
		error = '';
		try {
			const result = await api<DashboardView>('/dashboard', { signal: controller.signal });
			if (!stopped) dashboard = result;
		} catch (e) {
			if (stopped) return;
			dashboard = null;
			error = e instanceof Error ? e.message : 'Unable to load your dashboard.';
			if (e instanceof ApiError && e.status === 401) await goto('/login', { invalidateAll: true });
		} finally {
			if (!stopped) busy = false;
		}
	}
	onMount(() => {
		void refresh();
		const onFocus = () => {
			if (document.visibilityState === 'visible') void refresh();
		};
		window.addEventListener('focus', onFocus);
		return () => window.removeEventListener('focus', onFocus);
	});
	onDestroy(() => {
		stopped = true;
		controller.abort();
	});
</script>

<svelte:head><title>Dashboard · Custodian</title></svelte:head>
<div class="page-header">
	<div>
		<p class="eyebrow">STAFF WORKSPACE</p>
		<h1>Dashboard</h1>
		<p>Welcome, {data.user.name}. Here is your current requisition activity.</p>
	</div>
	<button class="secondary" disabled={busy} onclick={refresh}
		>{busy ? 'Refreshing…' : 'Refresh dashboard'}</button
	>
</div>
{#if error}<p class="error" role="alert">{error} Use Refresh dashboard to try again.</p>{/if}
{#if !dashboard && busy}<p role="status">Loading your dashboard…</p>{/if}
{#if dashboard}
	<div class="shortcuts" aria-label="Dashboard shortcuts">
		{#if dashboard.can_create}<a class="button" href="/requisitions/new">Create requisition</a>{/if}
		<a class="button secondary" href="/requisitions?my_requests=true">My requisitions</a>
		{#if dashboard.can_access_approval_inbox}<a
				class="button secondary"
				href="/requisitions?inbox=true">Open My Tasks</a
			>{/if}
		{#if data.user.permissions.includes('staff:manage') && !data.user.read_only}<a
				class="button secondary"
				href="/staff">Manage staff</a
			>{/if}
		{#if data.user.permissions.includes('organisation:manage') && !data.user.read_only}<a
				class="button secondary"
				href="/organisation">Manage organisation</a
			>{/if}
		{#if data.user.permissions.includes('audit:read')}<a class="button secondary" href="/audit"
				>View Audit Log</a
			>{/if}
	</div>
	<div class="totals">
		<a class="card metric" href="/requisitions"
			><span>Visible requisitions</span><strong>{dashboard.total}</strong></a
		>
		<a class="card metric" href="/requisitions?my_requests=true"
			><span>Raised by you</span><strong>{dashboard.own_requests}</strong></a
		>
		{#if dashboard.can_access_approval_inbox}<a class="card metric" href="/requisitions?inbox=true"
				><span>Awaiting your action</span><strong>{dashboard.tasks.total}</strong></a
			>{/if}
	</div>
	<section class="card" aria-label="Request status counts">
		<h2>Requests by status</h2>
		<p>
			Counts include only requisitions you can currently access. Approved means authorised, not
			paid.
		</p>
		<div class="counts">
			{#each dashboard.counts as item (item.state)}<a
					href={'/requisitions?state=' + item.state}
					aria-label={`${stateLabel(item.state)}: ${item.count} requests`}
					><span>{stateLabel(item.state)}</span><strong>{item.count}</strong></a
				>{/each}
		</div>
	</section>
	<div class="panels">
		<div class="stack">
			{#if dashboard.can_access_approval_inbox}<section class="card" aria-label="Outstanding tasks">
					<h2>Awaiting your action</h2>
					{#if dashboard.tasks.items.length === 0}<p>
							No requisitions currently need your action.
						</p>{/if}
					<ul>
						{#each dashboard.tasks.items as request (request.id)}<li>
								<a href={'/requisitions/' + request.id}>{request.reference}</a>
								<p>{request.description || 'Untitled requisition'}</p>
								<small>{stateLabel(request.state)} · {money(request.total)}</small>
							</li>{/each}
					</ul>
					{#if dashboard.tasks.total > 5}<a href="/requisitions?inbox=true"
							>View all {dashboard.tasks.total} tasks</a
						>{/if}
				</section>{/if}
			<section class="card" aria-label="Latest requisitions">
				<h2>Latest requisitions</h2>
				{#if dashboard.recent_requests.items.length === 0}<p>
						No requisitions to display yet.
					</p>{/if}
				<ul>
					{#each dashboard.recent_requests.items as request (request.id)}<li>
							<div class="row">
								<a href={'/requisitions/' + request.id}>{request.reference}</a><span
									>{money(request.total)}</span
								>
							</div>
							<p>{request.description || 'Untitled requisition'}</p>
							<small
								>{stateLabel(request.state)} · {request.requester_name}<br />Created {dateTime(
									request.created_at
								)}</small
							>
						</li>{/each}
				</ul>
				{#if dashboard.total > 5}<a href="/requisitions">View all requisitions</a>{/if}
			</section>
		</div>
		<section class="card" aria-label="Recent activity">
			<h2>Recent activity</h2>
			<p>The latest recorded actions on requests you can access.</p>
			{#if dashboard.activity.length === 0}<p>No recent requisition activity.</p>{/if}
			<ul>
				{#each dashboard.activity as event (event.id)}<li>
						<a href={'/requisitions/' + event.request_id}>{event.reference}</a>
						<p>{event.label}</p>
						<small>{dateTime(event.at)}</small>
					</li>{/each}
			</ul>
		</section>
	</div>
	<p class="updated">Updated {dateTime(dashboard.refreshed_at)} · WAT</p>
{/if}

<style>
	.shortcuts {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-bottom: 24px;
	}
	.totals {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 18px;
		margin-bottom: 24px;
	}
	.metric {
		text-decoration: none;
		display: grid;
		gap: 16px;
	}
	.metric strong {
		font-size: 32px;
		color: var(--ink);
	}
	.counts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px 24px;
		margin-top: 20px;
	}
	.counts a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 0;
		text-decoration: none;
		border-top: 1px solid var(--rule);
	}
	.panels {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		gap: 24px;
		margin-top: 24px;
		align-items: start;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		padding: 16px 0;
		border-top: 1px solid var(--rule);
	}
	li p {
		margin: 8px 0;
		overflow-wrap: anywhere;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 12px;
	}
	.row span {
		font-weight: 600;
	}
	small,
	.updated {
		color: var(--body);
		font-size: 12px;
	}
	.updated {
		margin-top: 24px;
	}
	@media (max-width: 850px) {
		.panels {
			grid-template-columns: minmax(0, 1fr);
		}
		.counts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 450px) {
		.counts {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
