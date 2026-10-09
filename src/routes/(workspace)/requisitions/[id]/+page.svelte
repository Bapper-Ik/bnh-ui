<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '#lib/api/client.js';
	import type { Intent } from '#lib/api/schema.js';
	import { money, stateLabel, dateTime, lineKobo, formatKobo } from '#lib/money.js';
	import RequisitionForm from '#lib/features/requisitions/RequisitionForm.svelte';
	import Attachments from '#lib/features/requisitions/Attachments.svelte';
	import HistoryTimeline from '#lib/features/requisitions/HistoryTimeline.svelte';
	import SigningDialog from '#lib/features/requisitions/SigningDialog.svelte';
	let { data } = $props();
	let editing = $state(false);
	let correctionBusy = $state(false),
		correctionError = $state('');
	let correctionCommand: string | null = null;
	async function startCorrection() {
		if (correctionBusy) return;
		correctionBusy = true;
		correctionError = '';
		correctionCommand ??= JSON.stringify({
			expected_version: req.version,
			idempotency_key: crypto.randomUUID()
		});
		try {
			await api('/requisitions/' + req.id + '/revisions', {
				method: 'POST',
				body: correctionCommand
			});
			correctionCommand = null;
			await invalidateAll();
			editing = true;
		} catch (e) {
			correctionError = e instanceof Error ? e.message : 'Unable to start correction.';
			if (e instanceof ApiError && e.status < 500) correctionCommand = null;
			if (e instanceof ApiError && e.status === 401) await goto('/login', { invalidateAll: true });
		} finally {
			correctionBusy = false;
		}
	}

	let signing = $state<Intent['action'] | null>(null);
	const req = $derived(data.request);
	const vendor = $derived(req.content.vendor);
	const actionLabels: Record<string, string> = {
		submit: 'Review & submit',
		approve: 'Approve',
		reject: 'Reject',
		return: 'Return for revision'
	};
	async function saved() {
		editing = false;
		signing = null;
		await invalidateAll();
	}
</script>

<a class="back" href="/requisitions">← Requisitions</a>
<div class="page-header">
	<div>
		<p class="eyebrow">{req.reference} · REVISION {req.revision_number || 'DRAFT'}</p>
		<h1>{editing ? 'Edit requisition' : req.content.description || 'Untitled requisition'}</h1>
		<p>{req.requester_name} · {req.department_name} · {req.entity_name}</p>
	</div>
	<span class="status">{stateLabel(req.state)}</span>
</div>
{#if req.oversight_only}<p role="status">
		Administrative oversight · This requisition is read-only. Supporting documents and confidential
		Board records require separate access.
	</p>{/if}
{#if req.viewing_revision}
	<p role="status">
		Viewing signed revision {req.viewing_revision}. This record is read-only.
		<a href={'/requisitions/' + req.id}>Back to current request</a>
	</p>
{:else if req.state === 'RETURNED_FOR_REVISION' && !req.oversight_only}
	<p role="status">
		Returned for correction. Start a correction to prepare a new draft; the earlier signed revision
		stays unchanged.
	</p>
{:else if req.state === 'DRAFT' && req.revision_number > 0}
	<p role="status">
		Correction draft for revision {req.revision_number + 1}. Resubmission requires a new signature
		and recalculates the approval route.
	</p>
{/if}
{#if req.state === 'DRAFT' && !editing && !req.oversight_only}
	<p role="status">Draft saved. You can return to it before submitting.</p>
{/if}
{#if editing}<RequisitionForm
		request={req}
		onSaved={saved}
		onCancel={() => (editing = false)}
	/>{:else}
	<div class="detail-grid">
		<div class="stack">
			<section class="card">
				<div class="section-heading"><h2>Vendor information</h2></div>
				<dl class="grid">
					<div>
						<dt>Vendor</dt>
						<dd>{vendor?.name || 'Not supplied'}</dd>
					</div>
					<div>
						<dt>Contact person</dt>
						<dd>{vendor?.contact_person || 'Not supplied'}</dd>
					</div>
					<div>
						<dt>Phone</dt>
						<dd>{vendor?.phone || 'Not supplied'}</dd>
					</div>
					<div>
						<dt>Email</dt>
						<dd>{vendor?.email || 'Not supplied'}</dd>
					</div>
					<div>
						<dt>Business address</dt>
						<dd>{vendor?.address || 'Not supplied'}</dd>
					</div>
					<div>
						<dt>RC number / ID</dt>
						<dd>{vendor?.registration_id || 'Not supplied'}</dd>
					</div>
				</dl>
				<details>
					<summary>Bank details</summary>
					<dl class="grid">
						<div>
							<dt>Bank</dt>
							<dd>
								{req.redacted_fields?.includes('vendor.bank_details')
									? 'Restricted'
									: vendor?.bank_name || 'Not yet supplied'}
							</dd>
						</div>
						<div>
							<dt>Account number</dt>
							<dd>
								{req.redacted_fields?.includes('vendor.bank_details')
									? 'Restricted'
									: vendor?.account_number || 'Not yet supplied'}
							</dd>
						</div>
						<div>
							<dt>Account name</dt>
							<dd>
								{req.redacted_fields?.includes('vendor.bank_details')
									? 'Restricted'
									: vendor?.account_name || 'Not yet supplied'}
							</dd>
						</div>
					</dl>
				</details>
			</section>
			<section class="card">
				<h2>Scope of work</h2>
				<p>{req.content.description || 'Not supplied'}</p>
				<dl class="grid">
					<div>
						<dt>Location</dt>
						<dd>{req.content.location || 'Not supplied'}</dd>
					</div>
					<div>
						<dt>Planned dates</dt>
						<dd>
							{req.content.start_date || 'Not specified'} → {req.content.completion_date ||
								'Not specified'}
						</dd>
					</div>
					<div>
						<dt>Payment terms</dt>
						<dd>{req.content.payment_terms || 'Not yet agreed'}</dd>
					</div>
					<div>
						<dt>Warranty / guarantee</dt>
						<dd>{req.content.warranty || 'Not specified'}</dd>
					</div>
				</dl>
			</section>
			<section class="card">
				<h2>Cost breakdown</h2>
				<div class="table-wrap">
					<!-- svelte-ignore a11y_no_redundant_roles (Explicit table roles preserve semantics when rows become cards.) -->
					<table class="responsive-table" role="table">
						<thead role="rowgroup"
							><tr role="row"
								><th scope="col" role="columnheader">Item</th><th
									scope="col"
									role="columnheader"
									class="numeric">Qty</th
								><th scope="col" role="columnheader" class="numeric">Unit price</th><th
									scope="col"
									role="columnheader"
									class="numeric">Total</th
								></tr
							></thead
						><tbody role="rowgroup"
							>{#each req.content.lines ?? [] as line, i (i)}<tr role="row"
									><td role="cell" data-label="Item">{line.description}</td><td
										role="cell"
										data-label="Quantity"
										class="numeric">{line.quantity}</td
									><td role="cell" data-label="Unit price" class="numeric"
										>{money(line.unit_price)}</td
									><td role="cell" data-label="Total" class="numeric"
										>{formatKobo(lineKobo(line.quantity, line.unit_price))}</td
									></tr
								>{/each}</tbody
						>
					</table>
				</div>
				<div class="grand-total"><span>Grand total</span><strong>{money(req.total)}</strong></div>
			</section>
			{#key `${req.version}:${req.viewing_revision ?? 'current'}`}<Attachments
					request={req}
					onChanged={saved}
				/>{/key}
			{#key `${req.id}:${req.version}:${req.viewing_revision ?? 'current'}`}<HistoryTimeline
					requestId={req.id}
					revision={req.viewing_revision}
				/>{/key}
		</div>
		<aside class="summary card">
			<p class="eyebrow">REQUEST SUMMARY</p>
			<div class="amount">{money(req.total)}</div>
			<p class="approval-note">Approval authorises this request. It does not confirm payment.</p>
			<hr />
			{#if req.next_action && !req.viewing_revision}
				<section class="next-action" aria-label="Next action">
					<h2>Next action</h2>
					<p>{req.next_action.label}</p>
					{#if req.next_action.actor_name}<p>
							With: <strong>{req.next_action.actor_name}</strong>
						</p>{/if}
					{#if req.next_action.blocked_reason}<p class="error" role="status">
							{req.next_action.blocked_reason}
						</p>{/if}
				</section>
				<hr />
			{/if}
			<dl>
				<div>
					<dt>Created</dt>
					<dd>{dateTime(req.created_at)}</dd>
				</div>
				<div>
					<dt>Required authority</dt>
					<dd>{req.required_authority?.replaceAll('_', ' ') || 'Determined at submission'}</dd>
				</div>
			</dl>
			{#if req.routing_explanation}<p class="route">{req.routing_explanation}</p>{/if}
			{#if req.submission_blocker}<p class="error" role="status">
					Before submitting: {req.submission_blocker}
				</p>{/if}
			{#if req.decision_blocker}<p class="error" role="status">{req.decision_blocker}</p>{/if}
			{#if correctionError}<p class="error" role="alert">
					{correctionError}
					<button class="quiet" onclick={() => invalidateAll()}>Reload request</button>
				</p>{/if}
			<div class="stack action-stack">
				{#if req.available_actions.includes('board_workspace')}<a
						class="button"
						href={'/requisitions/' + req.id + '/board'}>Open Board workspace</a
					>{/if}
				{#if req.available_actions.includes('revise')}<button
						disabled={correctionBusy}
						onclick={startCorrection}>{correctionBusy ? 'Starting…' : 'Start correction'}</button
					>{/if}
				{#if req.available_actions.includes('edit')}<button
						class="secondary"
						onclick={() => (editing = true)}>Edit draft</button
					>{/if}{#each req.available_actions.filter( (a: string) => ['submit', 'approve', 'reject', 'return'].includes(a) ) as action (action)}<button
						disabled={!!req.submission_blocker}
						onclick={() => (signing = action as Intent['action'])}
						>{actionLabels[action] || action}</button
					>{/each}
			</div>
		</aside>
	</div>
{/if}
{#if signing}<SigningDialog
		request={req}
		action={signing}
		name={page.data.user.name}
		onComplete={saved}
		onCancel={() => (signing = null)}
	/>{/if}

<style>
	.back {
		display: inline-block;
		text-decoration: none;
		font-size: 12px;
		color: var(--body);
		margin-bottom: 26px;
	}
	.detail-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 280px;
		gap: 24px;
		align-items: start;
	}
	.detail-grid > .stack {
		min-width: 0;
		grid-template-columns: minmax(0, 1fr);
	}
	dl {
		margin: 0;
	}
	dt {
		font-size: 12px;
		color: var(--body);
		margin-bottom: 8px;
	}
	dd {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	details {
		border-top: 1px solid var(--rule);
		margin-top: 96px;
		padding-top: 20px;
	}
	summary {
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
	}
	details dl {
		margin-top: 20px;
	}
	.grand-total {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		padding-top: 25px;
		font-size: 14px;
	}
	.grand-total strong {
		font-size: 23px;
		font-weight: 600;
	}
	.summary {
		position: sticky;
		top: 96px;
		padding: 24px;
	}
	.amount {
		font-size: 25px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.approval-note,
	.route {
		font-size: 12px;
		margin: 12px 0 0;
	}
	hr {
		border: 0;
		border-top: 1px solid var(--rule);
		margin: 24px 0;
	}
	.summary dl {
		display: grid;
		gap: 20px;
	}
	.summary dd {
		text-transform: capitalize;
	}
	.action-stack {
		gap: 10px;
		margin-top: 25px;
	}
	@media (max-width: 1150px) {
		.detail-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.summary {
			position: static;
			order: -1;
		}
		.action-stack {
			display: flex;
			flex-wrap: wrap;
		}
	}

	@container panel (max-width: 420px) {
		.grand-total {
			flex-direction: column;
			align-items: flex-start;
			gap: 8px;
		}
		.grand-total strong {
			overflow-wrap: anywhere;
			max-width: 100%;
		}
		.action-stack {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
