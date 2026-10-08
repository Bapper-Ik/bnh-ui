<script lang="ts">
	import { money, stateLabel, dateTime } from '#lib/money.js';
	let { data } = $props();
	function link(offset: number) {
		return (
			'/requisitions?' +
			new URLSearchParams({
				inbox: String(data.inbox),
				search: data.search,
				state: data.state,
				offset: String(offset)
			})
		);
	}
</script>

<div class="page-header">
	<div>
		<p class="eyebrow">REQUISITIONS & APPROVALS</p>
		<h1>{data.inbox ? 'Approval inbox' : 'Requisitions'}</h1>
		<p>
			{data.inbox
				? 'Review and decide requisitions assigned to you as HOD, Chief of Staff or Managing Director.'
				: 'Create requests and follow every decision.'}
		</p>
	</div>
	{#if !data.readOnly && !data.inbox}<a class="button" href="/requisitions/new">+ New requisition</a
		>{/if}
</div>
<form class="filters" method="GET">
	{#if data.inbox}<input type="hidden" name="inbox" value="true" />{/if}
	<label
		>Search requisitions<input
			name="search"
			value={data.search}
			placeholder="Reference or description"
			maxlength="250"
		/></label
	>
	{#if !data.inbox}<label
			>Status<select name="state" value={data.state}
				><option value="">All statuses</option
				>{#each ['DRAFT', 'PENDING_AUTHORITY', 'AWAITING_BOARD_RESOLUTION', 'APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION'] as state (state)}<option
						value={state}>{stateLabel(state)}</option
					>{/each}</select
			></label
		>
	{/if}<button class="secondary">Apply filters</button>
</form>
<div class="section-heading">
	<h2>
		{data.inbox ? 'Assigned to you' : 'All requests'}
		<span class="count">{data.requests.total}</span>
	</h2>
</div>
{#if data.requests.items.length === 0}
	<div class="empty">
		<h2>
			{data.search || data.state
				? 'No matching requisitions'
				: data.inbox
					? 'You’re all caught up'
					: 'No requisitions yet'}
		</h2>
		<p>
			{data.inbox
				? 'New requests assigned to your office will appear here.'
				: 'Start a requisition with the vendor, scope of work and cost breakdown. You can save it as a draft.'}
		</p>
		{#if !data.inbox && !data.readOnly && !data.search && !data.state}<a
				class="button secondary"
				href="/requisitions/new">Create your first requisition</a
			>{/if}
	</div>
{:else}
	<div class="table-wrap">
		<table>
			<thead
				><tr
					><th>Requisition</th><th>Requested by</th><th>Status</th><th class="numeric">Amount</th
					><th><span class="visually-hidden">Open request</span></th></tr
				></thead
			><tbody>
				{#each data.requests.items as req (req.id)}<tr
						><td
							><a class="request-link" href={'/requisitions/' + req.id}>{req.reference}</a><small
								class="description">{req.description || 'Untitled draft'}</small
							><small>{dateTime(req.created_at)}</small></td
						><td>{req.requester_name}</td><td
							><span class="status">{stateLabel(req.state)}</span></td
						><td class="numeric">{money(req.total)}</td><td
							><a href={'/requisitions/' + req.id} aria-label={'Open ' + req.reference}>View →</a
							></td
						></tr
					>{/each}
			</tbody>
		</table>
	</div>
	<div class="pagination">
		<span
			>{data.requests.offset + 1}–{Math.min(
				data.requests.offset + data.requests.limit,
				data.requests.total
			)} of {data.requests.total}</span
		>
		<div class="actions">
			{#if data.requests.offset > 0}<a
					class="button secondary"
					href={link(Math.max(0, data.requests.offset - data.requests.limit))}>Previous</a
				>{/if}{#if data.requests.offset + data.requests.limit < data.requests.total}<a
					class="button secondary"
					href={link(data.requests.offset + data.requests.limit)}>Next</a
				>{/if}
		</div>
	</div>
{/if}

<style>
	.filters {
		display: flex;
		gap: 16px;
		align-items: end;
		flex-wrap: wrap;
		margin-bottom: 28px;
	}
	.filters label {
		flex: 1;
		min-width: 180px;
	}
	.count {
		display: inline-block;
		padding: 4px 8px;
		background: var(--surface);
		border-radius: 4px;
		font-size: 12px;
		margin-left: 8px;
		vertical-align: middle;
	}
	.request-link {
		font-weight: 600;
		text-decoration: none;
	}
	.request-link:hover {
		text-decoration: underline;
	}
	.description {
		display: block;
		max-width: 360px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin: 6px 0;
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 24px;
		font-size: 12px;
		color: var(--body);
	}
</style>
