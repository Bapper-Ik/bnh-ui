<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { NotificationPage, NotificationView } from '#lib/api/schema.js';
	import { dateTime } from '#lib/money.js';
	let dialog: HTMLDialogElement;
	let result = $state<NotificationPage | null>(null),
		failure = $state('');
	let open = $state(false),
		loading = $state(false),
		unread = $state(false),
		offset = $state(0);
	let acting = $state<string | null>(null);
	let alive = false,
		refreshQueued = false,
		controller: AbortController | undefined;
	const deliveryLabels: Record<string, string> = {
		pending: 'Email pending',
		sending: 'Email being sent',
		accepted: 'Email accepted by provider',
		failed: 'Email delivery failed; this alert remains available',
		cancelled: 'Email cancelled after the work or recipient changed',
		disabled: 'Email was not enabled for this alert',
		skipped: 'Historical alert — no email sent'
	};
	async function refresh() {
		if (!alive) return;
		// A browser abort does not cancel a database read already running on the server.
		// Coalesce focus/navigation refreshes so they cannot pile up behind mutations.
		if (loading) {
			refreshQueued = true;
			return;
		}
		const query = `/notifications?unread=${unread}&limit=10&offset=${offset}`;
		const current = new AbortController();
		controller = current;
		loading = true;
		failure = '';
		try {
			const next = await api<NotificationPage>(query, { signal: current.signal });
			if (!alive || current.signal.aborted) return;
			if (query !== `/notifications?unread=${unread}&limit=10&offset=${offset}`) return;
			result = next;
			if (offset > 0 && !next.items.length) {
				offset = 0;
				void refresh();
			}
		} catch (e) {
			if (!alive || current.signal.aborted) return;
			result = null;
			failure = e instanceof Error ? e.message : 'Unable to load notifications.';
			if (e instanceof ApiError && e.status === 401) {
				dialog?.close();
				await goto('/login', { invalidateAll: true });
			}
		} finally {
			if (alive && !current.signal.aborted) {
				loading = false;
				if (refreshQueued) {
					refreshQueued = false;
					void refresh();
				}
			}
		}
	}
	$effect(() => {
		if (!open) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});
	function show() {
		open = true;
		dialog.showModal();
		void refresh();
	}
	function focusRefresh() {
		if (document.visibilityState === 'visible') void refresh();
	}
	afterNavigate(() => {
		if (alive) void refresh();
	});
	onMount(() => {
		alive = true;
		void refresh();
		const timer = setInterval(focusRefresh, 30000);
		window.addEventListener('focus', focusRefresh);
		document.addEventListener('visibilitychange', focusRefresh);
		return () => {
			clearInterval(timer);
			window.removeEventListener('focus', focusRefresh);
			document.removeEventListener('visibilitychange', focusRefresh);
		};
	});
	onDestroy(() => {
		alive = false;
		controller?.abort();
		result = null;
	});
	async function read(row: NotificationView, navigate = false) {
		if (acting) return;
		acting = row.id;
		failure = '';
		try {
			const current = await api<NotificationView>(`/notifications/${row.id}/read`, {
				method: 'POST'
			});
			if (!alive) return;
			if (navigate) {
				dialog.close();
				await goto(current.href);
			}
			await refresh();
		} catch (e) {
			if (!alive) return;
			result = null;
			failure = e instanceof Error ? e.message : 'Unable to update this notification.';
			if (e instanceof ApiError && e.status === 401) {
				dialog.close();
				await goto('/login', { invalidateAll: true });
			}
		} finally {
			acting = null;
		}
	}
</script>

<button
	class="quiet trigger"
	onclick={show}
	aria-haspopup="dialog"
	aria-expanded={open}
	aria-label="Notifications"
>
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.7"
		aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg
	>
	<span class="trigger-label">Notifications</span>
	{#if result && result.unread_total > 0}<span
			class="badge"
			aria-label={`${result.unread_total} unread`}
			>{result.unread_total > 99 ? '99+' : result.unread_total}</span
		>{/if}
	{#if failure}<span class="unavailable" aria-label="Notifications unavailable">!</span>{/if}
</button>
<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="notification-title">
	<div class="heading">
		<div>
			<p class="eyebrow">YOUR UPDATES</p>
			<h2 id="notification-title">Notifications</h2>
		</div>
		<button class="quiet" aria-label="Close notifications" onclick={() => dialog.close()}>✕</button>
	</div>
	<p>Review updates and work assigned to you. Reading an alert does not approve a requisition.</p>
	<div class="controls">
		<label
			><input
				type="checkbox"
				bind:checked={unread}
				onchange={() => {
					offset = 0;
					void refresh();
				}}
			/> Unread only</label
		><button class="quiet" disabled={loading || !!acting} onclick={() => refresh()}
			>Refresh notifications</button
		>
	</div>
	{#if failure}<div class="error" role="alert">
			{failure}<button class="quiet" onclick={() => refresh()}>Retry notifications</button>
		</div>{/if}
	{#if loading && !result}<p role="status">Loading notifications…</p>{/if}
	{#if result}
		{#if !result.email_enabled}<p class="email-note" role="status">
				Email alerts are currently off. Your in-app notifications remain available.
			</p>{/if}
		<p class="count" aria-live="polite">
			{result.unread_total} unread · {result.total}
			{unread ? 'unread alerts' : 'available alerts'}
		</p>
		{#if !result.items.length}<div class="empty">
				<h3>{unread ? 'No unread notifications' : 'No notifications yet'}</h3>
				<p>Request updates and eligible assigned work will appear here.</p>
			</div>{:else}
			<ol aria-label="Your notifications" aria-busy={loading}>
				{#each result.items as row (row.id)}<li class:unread={!row.read_at}>
						<div class="item-heading">
							<h3>{row.title}</h3>
							{#if !row.read_at}<span class="unread-label">Unread</span>{/if}
						</div>
						<p class="reference">{row.reference} · {dateTime(row.created_at)} WAT</p>
						<p>{row.message}</p>
						<div class="actions">
							<button class="secondary" disabled={!!acting} onclick={() => read(row, true)}
								>{row.href.endsWith('/board') ? 'Open Board workspace' : 'Open requisition'}</button
							>
							{#if !row.read_at}<button class="quiet" disabled={!!acting} onclick={() => read(row)}
									>Mark as read</button
								>{/if}
						</div>
						<small>{deliveryLabels[row.email_status] ?? 'Email status unavailable'}</small>
						{#if row.attempts > 0}<small>
								· {row.attempts} delivery {row.attempts === 1 ? 'attempt' : 'attempts'}</small
							>{/if}
					</li>{/each}
			</ol>
			<div class="pagination">
				<small
					>{result.offset + 1}–{Math.min(result.offset + result.items.length, result.total)} of {result.total}</small
				>
				<div class="actions">
					{#if result.offset > 0}<button
							class="secondary"
							disabled={loading || !!acting}
							onclick={() => {
								offset = Math.max(0, offset - result!.limit);
								void refresh();
							}}>Newer alerts</button
						>{/if}
					{#if result.offset + result.limit < result.total}<button
							class="secondary"
							disabled={loading || !!acting}
							onclick={() => {
								offset += result!.limit;
								void refresh();
							}}>Older alerts</button
						>{/if}
				</div>
			</div>
		{/if}
	{/if}
</dialog>

<style>
	.trigger {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		flex-shrink: 0;
	}
	.badge {
		min-width: 22px;
		border-radius: 12px;
		padding: 3px 6px;
		background: var(--ink);
		color: white;
		font-size: 11px;
	}
	dialog {
		position: fixed;
		inset: 0 0 0 auto;
		margin: 0;
		width: min(520px, 100vw);
		max-width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		border: 0;
		border-left: 1px solid var(--rule);
		padding: 28px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	.heading,
	.item-heading,
	.controls,
	.pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.heading h2,
	.item-heading h3 {
		margin-bottom: 0;
	}
	.heading {
		margin-bottom: 22px;
	}
	.controls,
	.pagination {
		flex-wrap: wrap;
	}
	.controls label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.controls input {
		width: auto;
		min-height: auto;
	}
	.controls button {
		font-size: 12px;
	}
	.count,
	.email-note {
		margin-top: 18px;
		font-size: 13px;
	}
	.email-note {
		padding: 12px;
		background: var(--surface);
	}
	ol {
		list-style: none;
		padding: 0;
		margin: 0 0 20px;
	}
	li {
		padding: 22px 0;
		border-bottom: 1px solid var(--rule);
		overflow-wrap: anywhere;
	}
	li.unread {
		border-left: 3px solid var(--ink);
		padding-left: 14px;
	}
	.item-heading {
		align-items: flex-start;
	}
	h3 {
		font-size: 15px;
		line-height: 1.45;
	}
	.unread-label {
		font-size: 11px;
		background: var(--surface);
		padding: 4px 6px;
		flex-shrink: 0;
	}
	li p {
		font-size: 13px;
		margin: 12px 0;
	}
	.reference {
		font-size: 12px;
	}
	li .actions {
		margin-bottom: 12px;
	}
	li button {
		font-size: 12px;
	}
	li small {
		font-size: 11px;
	}
	@media (max-width: 900px) {
		.trigger {
			width: 44px;
			height: 44px;
			padding: 10px;
		}
		.trigger-label {
			display: none;
		}
		.badge,
		.unavailable {
			position: absolute;
			top: -2px;
			right: -2px;
			min-width: 18px;
			padding: 2px 4px;
			font-size: 9px;
			line-height: 14px;
		}
		.unavailable {
			background: var(--surface);
			border-radius: 50%;
		}
	}
	@media (max-width: 550px) {
		dialog {
			padding: max(20px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
		}
	}
</style>
