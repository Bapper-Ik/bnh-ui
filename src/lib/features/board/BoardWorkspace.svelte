<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '#lib/api/client.js';
	import type { AttachmentView, BoardCase, BoardIntent, ResolutionData } from '#lib/api/schema.js';
	import { money, stateLabel, dateTime } from '#lib/money.js';
	import DocumentViewer from '#lib/components/ui/DocumentViewer.svelte';
	import SigningDialog from '#lib/features/requisitions/SigningDialog.svelte';
	let { board }: { board: BoardCase } = $props();
	const req = $derived(board.request);
	const last = $derived(board.records.at(-1));
	const actions = $derived(board.available_actions);
	// The parent remounts only after a saved server version changes.
	let form = $state<ResolutionData>(
		untrack(() =>
			structuredClone(
				board.records.at(-1)?.data ?? {
					board_name: board.request.entity_name + ' Board',
					meeting_date: null,
					reference: '',
					decision_text: '',
					outcome: 'APPROVE',
					authorised_amount: board.request.total,
					currency: 'NGN',
					conditions: '',
					attendance: '',
					quorum_attested: false,
					quorum_basis: '',
					evidence_type: 'resolution'
				}
			)
		)
	);
	let editing = $state(
		untrack(
			() => board.available_actions.includes('edit') || board.available_actions.includes('create')
		)
	);
	let dirty = $state(false),
		busy = $state(false),
		error = $state('');
	let viewed = $state<AttachmentView | null>(null);
	let signing = $state<BoardIntent['action'] | null>(null);
	let pendingSave = $state<string | null>(null);
	let pendingUpload = $state<{ file: File; key: string } | null>(null);
	async function failure(e: unknown) {
		error = e instanceof Error ? e.message : 'Unable to update the Board record.';
		if (e instanceof ApiError && e.status === 401) await goto('/login', { invalidateAll: true });
	}
	async function save() {
		if (busy) return;
		busy = true;
		error = '';
		pendingSave ??= JSON.stringify({
			expected_version: req.version,
			idempotency_key: crypto.randomUUID(),
			data: {
				...form,
				meeting_date: form.meeting_date || null,
				authorised_amount: form.authorised_amount || null
			}
		});
		try {
			await api('/requisitions/' + req.id + '/board-resolutions', {
				method: 'POST',
				body: pendingSave
			});
			pendingSave = null;
			await invalidateAll();
		} catch (e) {
			if (e instanceof ApiError && e.status < 500) pendingSave = null;
			await failure(e);
		} finally {
			busy = false;
		}
	}
	async function upload(file?: File) {
		if (busy || !last) return;
		if (file) pendingUpload = { file, key: crypto.randomUUID() };
		if (!pendingUpload) return;
		busy = true;
		error = '';
		try {
			const p = pendingUpload;
			await api(
				'/board-resolutions/' +
					last.id +
					'/attachments?' +
					new URLSearchParams({
						filename: p.file.name,
						upload_key: p.key,
						expected_version: String(req.version)
					}),
				{ method: 'POST', headers: { 'Content-Type': p.file.type }, body: p.file }
			);
			pendingUpload = null;
			await invalidateAll();
		} catch (e) {
			await failure(e);
		} finally {
			busy = false;
		}
	}
	function successor() {
		editing = true;
		dirty = true;
		if (actions.includes('later_resolution'))
			form = {
				...form,
				meeting_date: null,
				reference: '',
				decision_text: '',
				quorum_attested: false,
				conditions: ''
			};
	}
</script>

<a class="back" href={'/requisitions/' + req.id}>← Requisition details & supporting documents</a>
<div class="page-header">
	<div>
		<p class="eyebrow">{req.reference} · SIGNED REQUISITION REVISION {req.revision_number}</p>
		<h1>Board resolution</h1>
		<p>{req.entity_name} · {req.requester_name}</p>
	</div>
	<span class="status">{stateLabel(req.state)}</span>
</div>
<div class="overview card">
	<div><span>Request total</span><strong>{money(req.total)}</strong></div>
	<p>{req.content.description}</p>
	<a href={'/requisitions/' + req.id + '?revision=' + req.revision_number}
		>Review exact signed requisition →</a
	>
</div>
{#if ['DEFERRED', 'CONDITIONALLY_APPROVED'].includes(req.state)}<p class="notice" role="status">
		This requisition remains on hold. A later Board resolution must be recorded by the Secretary and
		confirmed by the Chairman before this outcome changes.
	</p>{/if}
{#if last?.return_reason}<p class="notice" role="status">
		<strong>Returned to Secretary:</strong>
		{last.return_reason} The requisition stays unchanged.
	</p>{/if}
{#if error}<div class="error" role="alert">
		{error}<button class="quiet" onclick={() => invalidateAll()}>Reload case</button>
	</div>{/if}
{#if editing}
	<form
		novalidate
		class="card stack"
		oninput={() => {
			dirty = true;
		}}
		onsubmit={(e) => {
			e.preventDefault();
			save();
		}}
	>
		<div>
			<h2>
				{actions.includes('later_resolution')
					? 'Record a later Board decision'
					: actions.includes('correct')
						? 'Correct the returned record'
						: 'Meeting record'}
			</h2>
			<p>
				Record the actual meeting outcome. Save your draft before attaching evidence or signing.
			</p>
		</div>
		<fieldset disabled={busy || !!pendingSave}>
			<div class="grid">
				<label>Company / Board<input bind:value={form.board_name} maxlength="250" required /></label
				>
				<label
					>Actual meeting date<input type="date" bind:value={form.meeting_date} required /></label
				>
				<label
					>Resolution reference<input bind:value={form.reference} maxlength="200" required /></label
				>
				<label
					>Meeting outcome<select bind:value={form.outcome}
						><option value="APPROVE">Approve</option><option value="REJECT">Reject</option><option
							value="DEFER">Defer</option
						><option value="CONDITIONAL_APPROVE">Conditional approval — hold</option></select
					></label
				>
			</div>
			{#if actions.includes('correct') || (actions.includes('edit') && last?.kind === 'correction')}<label
					>Correction summary<textarea
						bind:value={form.correction_summary}
						maxlength="2000"
						required></textarea></label
				>{/if}
			<label
				>Decision text<textarea bind:value={form.decision_text} maxlength="10000" required rows="4"
				></textarea></label
			>
			{#if form.outcome === 'APPROVE' || form.outcome === 'CONDITIONAL_APPROVE'}<label
					>Authorised amount (NGN)<input
						bind:value={form.authorised_amount}
						inputmode="decimal"
						required
					/><span class="help">Must equal the signed requisition total: {money(req.total)}.</span
					></label
				>{/if}
			<label
				>Conditions / follow-up<textarea
					bind:value={form.conditions}
					required={form.outcome === 'CONDITIONAL_APPROVE'}
					maxlength="5000"
					rows="3"></textarea></label
			>
			<label
				>Attendance / participants<textarea bind:value={form.attendance} maxlength="5000" required
				></textarea></label
			>
			<label
				>Quorum basis / policy reference<textarea
					bind:value={form.quorum_basis}
					maxlength="2000"
					required></textarea></label
			>
			<label class="checkbox"
				><input type="checkbox" bind:checked={form.quorum_attested} /><span
					>I attest that the meeting met the applicable quorum requirements, supported by the formal
					evidence.</span
				></label
			>
			<label
				>Formal evidence type<select bind:value={form.evidence_type}
					><option value="resolution">Formal resolution</option><option value="minutes_extract"
						>Authenticated minutes extract</option
					></select
				></label
			>
		</fieldset>
		<div class="actions">
			<button disabled={busy}
				>{busy ? 'Saving…' : pendingSave ? 'Retry save' : 'Save resolution draft'}</button
			><span class="help"
				>{dirty
					? 'Unsaved changes'
					: actions.includes('create')
						? 'Not saved yet'
						: 'Draft saved'}</span
			>
		</div>
	</form>
{/if}
{#if last && actions.includes('edit')}
	<section class="card evidence">
		<h2>Formal meeting evidence</h2>
		<p>
			A signed resolution or authenticated minutes extract is required before submission. PDF, PNG
			or JPEG, up to 5 MB.
		</p>
		{#if last.evidence}<div class="file">
				<span title={last.evidence.filename}>{last.evidence.filename}</span><button
					class="secondary"
					onclick={() => (viewed = last?.evidence ?? null)}>View</button
				>
			</div>{/if}
		<label
			>{last.evidence ? 'Replace evidence' : 'Attach evidence'}<input
				type="file"
				accept="application/pdf,image/png,image/jpeg"
				disabled={busy || dirty || !board.uploads_enabled}
				onchange={(e) => upload(e.currentTarget.files?.[0])}
			/></label
		>
		{#if dirty}<p class="help">Save your changes before uploading or signing.</p>{/if}
		{#if !board.uploads_enabled}<p class="error">
				Private file storage is unavailable. Contact your administrator.
			</p>{/if}
		{#if pendingUpload && error}<button
				class="secondary"
				disabled={busy || dirty}
				onclick={() => upload()}>Retry evidence upload</button
			>{/if}
	</section>
{/if}
<div class="actions record-actions">
	{#if !editing && (actions.includes('correct') || actions.includes('later_resolution'))}<button
			onclick={successor}
			>{actions.includes('correct') ? 'Start record correction' : 'Record later resolution'}</button
		>{/if}
	{#each actions.filter( (a) => ['board_submit', 'board_confirm', 'board_return'].includes(a) ) as action (action)}<button
			disabled={busy || dirty || (action === 'board_submit' && !last?.evidence)}
			onclick={() => (signing = action as BoardIntent['action'])}
			>{action === 'board_submit'
				? 'Review & submit to Chairman'
				: action === 'board_confirm'
					? 'Confirm Board decision'
					: 'Return record to Secretary'}</button
		>{/each}
</div>
{#if !actions.length}<p role="status">
		{last?.status === 'AWAITING_CHAIRMAN_SIGNOFF'
			? 'The signed record is awaiting the Chairman’s review.'
			: 'There is no action assigned to you at this stage.'}
	</p>{/if}
<section class="history">
	<h2>Resolution history</h2>
	<p>Meeting dates and system recording times are separate. Times below are Africa/Lagos.</p>
	{#if !board.records.length}<p>No meeting record yet.</p>{/if}
	{#each [...board.records].reverse() as record (record.id)}
		<details id={'record-' + record.id} class="card" open={record.id === last?.id}>
			<summary
				>Record {record.number} · {record.kind.replaceAll('_', ' ')} · {stateLabel(
					record.status
				)}</summary
			>
			<dl class="grid">
				<div>
					<dt>Meeting / reference</dt>
					<dd>
						{record.data.meeting_date || 'Not entered'} · {record.data.reference || 'Not entered'}
					</dd>
				</div>
				<div>
					<dt>Board</dt>
					<dd>{record.data.board_name}</dd>
				</div>
				<div>
					<dt>Recorded outcome</dt>
					<dd>{record.data.outcome?.replaceAll('_', ' ')}</dd>
				</div>
				<div>
					<dt>Authorised amount</dt>
					<dd>
						{record.data.authorised_amount
							? money(record.data.authorised_amount)
							: 'Not applicable'}
					</dd>
				</div>
				<div>
					<dt>Recorded at</dt>
					<dd>{dateTime(record.recorded_at)}</dd>
				</div>
				<div>
					<dt>Predecessor</dt>
					<dd>
						{record.predecessor_id
							? 'Record ' + board.records.find((r) => r.id === record.predecessor_id)?.number
							: 'Initial resolution'}
					</dd>
				</div>
			</dl>
			{#if record.data.correction_summary}<h3>Correction summary</h3>
				<p>{record.data.correction_summary}</p>{/if}
			<h3>Decision</h3>
			<p class="preserve">{record.data.decision_text}</p>
			{#if record.data.conditions}<h3>Conditions / follow-up</h3>
				<p class="preserve">{record.data.conditions}</p>{/if}
			<h3>Attendance & quorum attestation</h3>
			<p class="preserve">{record.data.attendance}</p>
			<p>
				{record.data.quorum_attested ? 'Attested' : 'Not yet attested'} · {record.data.quorum_basis}
			</p>
			{#if record.evidence}<div class="file">
					<span title={record.evidence.filename}>{record.evidence.filename}</span><button
						class="secondary"
						onclick={() => (viewed = record.evidence)}>View evidence</button
					>
				</div>{/if}
			{#if record.submitted_at}<p class="signature">
					Secretary: {record.secretary_name} · signed {dateTime(record.submitted_at)}
				</p>{/if}
			{#if record.decided_at}<p class="signature">
					Chairman: {record.chairman_name} · signed {dateTime(record.decided_at)}
				</p>{/if}
			{#if record.return_reason}<p>
					<strong>Correction required:</strong>
					{record.return_reason}
				</p>{/if}
		</details>
	{/each}
</section>
{#if signing && last}<SigningDialog
		request={req}
		action={signing}
		signingTarget={'/board-resolutions/' + last.id}
		name={page.data.user.name}
		onCancel={() => (signing = null)}
		onComplete={async () => {
			signing = null;
			await invalidateAll();
		}}
	/>{/if}

{#if viewed}<DocumentViewer file={viewed} onClose={() => (viewed = null)} />{/if}

<style>
	.back {
		display: inline-block;
		margin-bottom: 24px;
		font-size: 13px;
	}
	.overview {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 24px;
		margin-bottom: 24px;
	}
	.overview div {
		display: grid;
		gap: 8px;
	}
	.overview strong {
		font-size: 24px;
	}
	.overview p {
		flex: 1;
		min-width: 180px;
	}
	.overview span,
	.help {
		font-size: 12px;
		color: var(--body);
	}
	.notice {
		padding: 18px;
		background: var(--surface);
		border-left: 3px solid var(--ink);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 22px;
		min-width: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 22px;
	}
	.checkbox {
		display: flex;
		gap: 12px;
		align-items: start;
		font-weight: 400;
	}
	.checkbox input {
		width: 18px;
		min-height: 18px;
		margin-top: 3px;
	}
	.card {
		margin-bottom: 24px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.record-actions {
		margin: 24px 0;
	}
	.file {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 12px 0;
	}
	.file span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}
	.file button {
		flex: 0 0 auto;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
		line-height: 1.6;
	}
	dl {
		margin-top: 24px;
	}
	dt {
		font-size: 12px;
		color: var(--body);
		margin-bottom: 6px;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	h3 {
		font-size: 14px;
		margin-top: 24px;
	}
	.preserve {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.signature {
		font-size: 13px;
		border-top: 1px solid var(--rule);
		padding-top: 16px;
	}
	@media (max-width: 650px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.overview {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
