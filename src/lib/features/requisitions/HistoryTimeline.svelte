<script lang="ts">
	import { authorityLabel } from '#lib/money.js';
	import { onMount } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { HistoryPage } from '#lib/api/schema.js';
	import { dateTime } from '#lib/money.js';
	let { requestId, revision }: { requestId: string; revision?: number | null } = $props();
	let result = $state<HistoryPage | null>(null);
	let busy = $state(false),
		failure = $state(''),
		lastOffset = $state(0);
	const labels: Record<string, string> = {
		'requisition.export.success': 'PDF generated',
		'requisition.created': 'Draft Created',
		'requisition.updated': 'Draft Updated',
		'requisition.revision_created': 'Correction Started',
		'requisition.retracted': 'Retracted to Draft',
		submission: 'Requisition Submitted',
		approve: 'Approval Signed',
		reject: 'Rejection Signed',
		return: 'Returned to Requester',
		board_recorded: 'Board Record Created',
		board_submitted: 'Board Record Signed by Secretary',
		board_return: 'Returned to Secretary',
		board_approve: 'Board Approval Confirmed',
		board_reject: 'Board Rejection Confirmed',
		board_defer: 'Board Deferment Confirmed',
		board_conditional_approve: 'Conditional Board Approval Confirmed'
	};
	async function load(offset = 0) {
		if (busy) return;
		busy = true;
		failure = '';
		lastOffset = offset;
		const query = new SvelteURLSearchParams({ limit: '10', offset: String(offset) });
		if (revision) query.set('revision', String(revision));
		try {
			result = await api<HistoryPage>(`/requisitions/${requestId}/history?${query}`);
		} catch (e) {
			result = null;
			failure = e instanceof Error ? e.message : 'Unable to load history.';
			if (e instanceof ApiError && e.status === 401) await goto('/login', { invalidateAll: true });
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		void load();
	});
</script>

<section class="card" aria-busy={busy} aria-label="Request History">
	<h2>Request History</h2>
	<p>Recorded actions in chronological order. Times are shown in Lagos time.</p>
	{#if failure}<div class="error" role="alert">
			{failure} <button class="quiet" onclick={() => load(lastOffset)}>Retry History</button>
		</div>{/if}
	{#if busy}<p role="status">Loading history…</p>{/if}
	{#if result}
		{#if !result.items.length}<p>No recorded actions for this view.</p>{:else}
			<ol class="timeline" start={result.offset + 1}>
				{#each result.items as event (event.id)}
					<li>
						<strong>{labels[event.type] ?? event.type.replaceAll('_', ' ')}</strong>
						<p>
							{event.actor}{#if event.revision}
								· Revision {event.revision}{/if}
						</p>
						<time datetime={event.at}>{dateTime(event.at)}</time>
						{#if event.authority}<p>Authority: {authorityLabel(event.authority)}</p>{/if}
						{#if event.routing_explanation}<p>{event.routing_explanation}</p>{/if}
						{#if event.reason}<p class="reason">{event.reason}</p>{/if}
						{#if event.type === 'submission'}<p>
								<a href={`/requisitions/${requestId}?revision=${event.revision}`}
									>View Signed Revision {event.revision}</a
								>
							</p>{/if}
						{#if event.meeting_date}<p>
								Board meeting date: {event.meeting_date} (separate from recording and signing)
							</p>{/if}
						{#if event.resolution_id}<p>
								<a href={`/requisitions/${requestId}/board#record-${event.resolution_id}`}
									>Board Record {event.resolution_number}: {event.resolution_reference}</a
								>
							</p>{/if}
						{#if event.evidence_filename}<p>Resolution evidence: {event.evidence_filename}</p>{/if}
						{#if event.signature_id || event.digest}<details>
								<summary>Signing Evidence</summary>
								{#if event.signature_id}<p>
										Signature reference <code>{event.signature_id}</code>
									</p>{/if}
								{#if event.digest}<p>Content digest <code>{event.digest}</code></p>{/if}
								{#if event.policy_version}<p>Policy version: {event.policy_version}</p>{/if}
							</details>{/if}
					</li>
				{/each}
			</ol>
		{/if}
		<div class="pagination">
			<small
				>{result.total ? result.offset + 1 : 0}–{Math.min(
					result.offset + result.items.length,
					result.total
				)} of {result.total} actions</small
			>
			<div class="actions">
				{#if result.offset > 0}<button
						class="secondary"
						disabled={busy}
						onclick={() => load(Math.max(0, result!.offset - result!.limit))}
						>Earlier Actions</button
					>{/if}
				{#if result.offset + result.limit < result.total}<button
						class="secondary"
						disabled={busy}
						onclick={() => load(result!.offset + result!.limit)}>Later Actions</button
					>{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.timeline {
		list-style: none;
		padding: 0;
		margin: 24px 0;
	}
	li {
		border-left: 2px solid var(--rule);
		padding: 0 0 24px 20px;
		overflow-wrap: anywhere;
	}
	li:last-child {
		padding-bottom: 0;
	}
	li p {
		margin: 8px 0;
	}
	time {
		color: var(--body);
		font-size: 12px;
	}
	summary {
		cursor: pointer;
		font-size: 13px;
		margin-top: 12px;
	}
	code {
		display: block;
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.reason {
		white-space: pre-wrap;
	}
	.pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
</style>
