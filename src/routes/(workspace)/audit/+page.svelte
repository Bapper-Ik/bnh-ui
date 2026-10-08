<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { AttachmentAccess } from '#lib/api/schema.js';
	import DocumentViewer from '#lib/components/ui/DocumentViewer.svelte';
	import { dateTime } from '#lib/money.js';
	let { data } = $props();
	let file = $state<AttachmentAccess | null>(null),
		failure = $state(''),
		opening = $state(false);
	function link(offset: number) {
		return (
			'/audit?' +
			new URLSearchParams({
				...Object.fromEntries(Object.entries(data.filters).filter(([, value]) => value)),
				offset: String(offset),
				before: data.events.before
			})
		);
	}
	async function view(id: string) {
		if (opening) return;
		opening = true;
		failure = '';
		file = null;
		try {
			file = await api<AttachmentAccess>('/access/attachments/' + id);
		} catch (e) {
			failure = e instanceof Error ? e.message : 'Unable to open document.';
			if (e instanceof ApiError && e.status === 401) await goto('/login', { invalidateAll: true });
			else if (e instanceof ApiError && [403, 404].includes(e.status)) await invalidateAll();
		} finally {
			opening = false;
		}
	}
</script>

<div class="page-header">
	<div>
		<p class="eyebrow">RECORDED ACTIVITY</p>
		<h1>Audit Log</h1>
		<p>Actions within your permitted scope, newest first. All times are Lagos time.</p>
	</div>
</div>
<p class="scope-note">
	Audit permission does not expand request or document access. Actor names reflect current profiles;
	signed names are preserved in request history. Read-access checks are recorded separately.
</p>
<form method="GET" class="card filters">
	<div class="filter-grid">
		<label
			>Search audit log<input
				name="search"
				value={data.filters.search}
				placeholder="Request reference or action"
				maxlength="250"
			/></label
		>
		<label
			>Exact action<input
				name="action"
				value={data.filters.action}
				placeholder="e.g. requisition.created"
				maxlength="100"
			/></label
		>
		<label>Actor<input name="actor" value={data.filters.actor} maxlength="180" /></label>
		<label>Company<input name="company" value={data.filters.company} maxlength="250" /></label>
		<label
			>Outcome<input
				name="outcome"
				value={data.filters.outcome}
				placeholder="e.g. success"
				maxlength="30"
			/></label
		>
		<label
			>Recorded from (Lagos)<input
				type="date"
				name="date_from"
				value={data.filters.date_from}
			/></label
		>
		<label
			>Recorded through (Lagos)<input
				type="date"
				name="date_to"
				value={data.filters.date_to}
			/></label
		>
	</div>
	<div class="actions">
		<button class="secondary">Apply filters</button><a href="/audit">Clear filters / refresh</a>
	</div>
</form>
{#if failure}<p class="error" role="alert">{failure}</p>{/if}
<div class="section-heading">
	<h2>Recorded actions <span class="count">{data.events.total}</span></h2>
	<small>As of {dateTime(data.events.before)}</small>
</div>
{#if !data.events.items.length}<div class="empty">
		<h2>No matching audit events</h2>
		<p>Change the filters or check that your review scope covers the relevant company.</p>
	</div>{:else}
	<ol class="events" aria-label="Audit events">
		{#each data.events.items as event (event.id)}
			<li class="card">
				<div class="event-top">
					<strong>{event.action}</strong><span class="status">{event.outcome}</span>
				</div>
				<p>
					{event.actor_name} ·
					<time datetime={event.at}>{dateTime(event.at)}</time>{#if event.company}
						· {event.company}{/if}
				</p>
				<div class="actions">
					{#if event.request_id}<a href={'/requisitions/' + event.request_id}
							>{event.reference ?? 'View request'}</a
						>{/if}
					{#if event.attachment_id}<button
							class="quiet"
							disabled={opening}
							onclick={() => view(event.attachment_id!)}
							>View {event.attachment_filename ?? 'document'}</button
						>{/if}
				</div>
				<details>
					<summary>Record references</summary>
					<dl>
						<div>
							<dt>Event</dt>
							<dd>{event.id}</dd>
						</div>
						{#if event.actor_id}<div>
								<dt>Actor identity</dt>
								<dd>{event.actor_id}</dd>
							</div>{/if}
						{#if event.revision_id}<div>
								<dt>Revision</dt>
								<dd>{event.revision_id}</dd>
							</div>{/if}
						{#if event.content_digest}<div>
								<dt>Content digest</dt>
								<dd>{event.content_digest}</dd>
							</div>{/if}
					</dl>
				</details>
			</li>
		{/each}
	</ol>
	<div class="pagination">
		<small
			>{data.events.offset + 1}–{Math.min(
				data.events.offset + data.events.items.length,
				data.events.total
			)} of {data.events.total}</small
		>
		<div class="actions">
			{#if data.events.offset > 0}<a
					class="button secondary"
					href={link(Math.max(0, data.events.offset - data.events.limit))}>Newer events</a
				>{/if}
			{#if data.events.offset + data.events.limit < data.events.total}<a
					class="button secondary"
					href={link(data.events.offset + data.events.limit)}>Older events</a
				>{/if}
		</div>
	</div>
{/if}
{#if file}<DocumentViewer {file} onClose={() => (file = null)} />{/if}

<style>
	.scope-note {
		max-width: 850px;
	}
	.filters {
		margin: 24px 0;
	}
	.filter-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
		gap: 16px;
		margin-bottom: 20px;
	}
	.events {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.events li {
		overflow-wrap: anywhere;
	}
	.event-top,
	.pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.event-top strong {
		font-size: 14px;
	}
	.events p {
		margin: 10px 0;
		font-size: 13px;
	}
	.events button {
		max-width: 100%;
		text-align: left;
		overflow-wrap: anywhere;
	}
	summary {
		cursor: pointer;
		font-size: 12px;
		margin-top: 16px;
	}
	dd {
		margin: 4px 0 12px;
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	dt {
		font-size: 12px;
		color: var(--body);
	}
	.count {
		font-size: 13px;
		padding: 4px 8px;
		background: var(--surface);
		border-radius: 4px;
	}
	.pagination {
		margin-top: 24px;
	}
</style>
