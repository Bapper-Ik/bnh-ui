<script lang="ts">
	import { untrack } from 'svelte';
	import Attachments from './Attachments.svelte';
	import PriceInput from '#lib/components/ui/PriceInput.svelte';
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type {
		Content,
		MembershipView,
		RequestView,
		VendorInfo,
		VendorPage,
		VendorView,
		VendorSelection
	} from '#lib/api/schema.js';
	import { formatKobo, lineKobo } from '#lib/money.js';
	let {
		memberships = [],
		request,
		onSaved,
		onCancel
	}: {
		memberships?: MembershipView[];
		request?: RequestView;
		onSaved: (value: RequestView) => void | Promise<void>;
		onCancel?: () => void;
	} = $props();
	type FormContent = Required<Content> & { vendor: Required<VendorInfo> };
	const emptyVendor: Required<VendorInfo> = {
		name: '',
		contact_person: '',
		phone: '',
		email: '',
		address: '',
		registration_id: '',
		bank_name: '',
		account_number: '',
		account_name: ''
	};
	let content = $state<FormContent>(
		untrack(() => ({
			description: request?.content.description ?? '',
			location: request?.content.location ?? '',
			start_date: request?.content.start_date ?? null,
			completion_date: request?.content.completion_date ?? null,
			payment_terms: request?.content.payment_terms ?? '',
			warranty: request?.content.warranty ?? '',
			currency: 'NGN',
			vendor: { ...emptyVendor, ...request?.content.vendor },
			lines: request?.content.lines?.map((line) => ({ ...line })) ?? []
		}))
	);
	let entityId = $state(untrack(() => request?.entity_id ?? memberships[0]?.entity_id ?? ''));
	let busy = $state(false);
	let error = $state('');
	const creationKey = crypto.randomUUID();
	let stagedIds = $state<string[]>([]);
	let uploading = $state(false);
	let uploadRefresh = $state(0);
	let conflict = $state(false),
		denied = $state(false),
		dirty = $state(false);
	let pendingBody = $state<string | null>(null);
	let vendorSelection = $state<VendorSelection | null>(null);
	let vendorSearch = $state('');
	let vendorChoices = $state<VendorPage | null>(null);
	let vendorNote = $state('');
	const hasBankDetails = $derived(
		[content.vendor.bank_name, content.vendor.account_name, content.vendor.account_number].some(
			(value) => value.trim()
		)
	);
	beforeNavigate(({ cancel }) => {
		if (dirty && !denied && !window.confirm('Discard unsaved requisition changes?')) cancel();
	});
	async function failure(e: unknown) {
		error = e instanceof Error ? e.message : 'Unable to complete this action.';
		if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
			denied = true;
			dirty = false;
			pendingBody = null;
			vendorChoices = null;
			if (e.status === 401) await goto('/login', { invalidateAll: true });
		}
	}
	async function findVendors() {
		busy = true;
		error = '';
		try {
			vendorChoices = await api<VendorPage>(
				'/vendors?' + new URLSearchParams({ entity_id: entityId, search: vendorSearch })
			);
		} catch (e) {
			await failure(e);
		} finally {
			busy = false;
		}
	}
	async function chooseVendor(id: string) {
		busy = true;
		error = '';
		try {
			const v = await api<VendorView>('/vendors/' + id);
			vendorSelection = { id: v.id, expected_version: v.version };
			content.vendor = {
				...emptyVendor,
				name: v.data.name,
				contact_person: v.data.contact_person ?? '',
				address: v.data.address ?? '',
				registration_id: v.data.registration_id ?? '',
				email: v.data.email ?? '',
				phone: (v.data.phones ?? []).join(', '),
				...v.data.bank
			};
			vendorNote =
				v.bank_details_state === 'restricted'
					? 'Bank details are hidden here. The saved vendor account will be included for approval and in your signed payment letter.'
					: 'A snapshot of this vendor will be saved with the request.';
			vendorChoices = null;
			dirty = true;
		} catch (e) {
			await failure(e);
		} finally {
			busy = false;
		}
	}
	let total = $derived.by(() => {
		try {
			return formatKobo(
				content.lines.reduce((sum, line) => sum + lineKobo(line.quantity, line.unit_price), 0n)
			);
		} catch {
			return 'Check item amounts';
		}
	});
	function preview(quantity: string, price: string) {
		try {
			return formatKobo(lineKobo(quantity, price));
		} catch {
			return '—';
		}
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || uploading) return;
		const form = event.currentTarget as HTMLFormElement;
		for (const field of form.querySelectorAll(':invalid'))
			field.closest('details')?.setAttribute('open', '');
		if (!form.reportValidity()) return;
		for (const [index, line] of content.lines.entries()) {
			try {
				lineKobo(line.quantity, line.unit_price);
			} catch (e) {
				error = `Item ${index + 1}: ${e instanceof Error ? e.message : 'Check the quantity and price.'}`;
				return;
			}
		}
		busy = true;
		error = '';
		try {
			const payload = {
				...content,
				start_date: content.start_date || null,
				completion_date: content.completion_date || null
			};
			pendingBody ??= JSON.stringify(
				request
					? {
							expected_version: request.version,
							content: payload,
							vendor_selection: vendorSelection
						}
					: {
							entity_id: entityId,
							creation_key: creationKey,
							staged_upload_ids: stagedIds,
							content: payload,
							vendor_selection: vendorSelection
						}
			);
			const result = await api<RequestView>(
				request ? '/requisitions/' + request.id + '/draft' : '/requisitions',
				{ method: request ? 'PUT' : 'POST', body: pendingBody }
			);
			dirty = false;
			pendingBody = null;

			await onSaved(result);
		} catch (e) {
			if (e instanceof ApiError && e.status < 500) {
				pendingBody = null;
				if (e.code === 'DOCUMENTS_CHANGED' && !request) uploadRefresh += 1;
				else if (e.status === 409 && e.code !== 'DEPARTMENT_CODE_REQUIRED') conflict = true;
			}
			await failure(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty && !denied) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>
{#if denied}<div class="error" role="alert">
		Your session or access has changed. Reopen the request after signing in.
	</div>{:else}
	<form class="stack" novalidate onsubmit={save} oninput={() => (dirty = true)}>
		<fieldset class="form-fields stack" disabled={busy || !!pendingBody}>
			{#if !request}<section class="card">
					<div class="section-heading">
						<h2>Requesting Department</h2>
						<span class="eyebrow">01</span>
					</div>
					<label
						>Company & Department<select
							bind:value={entityId}
							disabled={uploading || stagedIds.length > 0}
							onchange={() => {
								vendorSelection = null;
								vendorChoices = null;
								content.vendor = { ...emptyVendor };
							}}
							required
							><option value="" disabled>Select Your Department</option
							>{#each memberships as membership (membership.entity_id)}<option
									value={membership.entity_id}
									>{membership.entity_name} · {membership.department_name}</option
								>{/each}</select
						></label
					>
				</section>{/if}
			<section class="card">
				<div class="section-heading">
					<h2>Vendor Information</h2>
					<span class="eyebrow">02</span>
				</div>
				<div class="vendor-lookup">
					<div class="vendor-search">
						<label
							>Find an Existing Vendor<input
								bind:value={vendorSearch}
								maxlength="250"
								placeholder="Search by vendor name"
							/></label
						>
						<button type="button" class="secondary" onclick={findVendors} disabled={!entityId}
							>Search Vendors</button
						>
					</div>
					{#if vendorChoices}
						{#each vendorChoices.items as v (v.id)}<button
								type="button"
								class="secondary"
								onclick={() => chooseVendor(v.id)}>{v.name}</button
							>{/each}
						<p>
							{vendorChoices.total
								? 'Showing up to 25 matches. Refine your search if needed.'
								: 'No matching vendors. Enter details below.'}
						</p>
					{/if}
					{#if vendorSelection}<p>{vendorNote}</p>
						<button
							class="quiet"
							type="button"
							onclick={() => {
								vendorSelection = null;
								dirty = true;
							}}>Use These Details as Manual Entry</button
						>{/if}
				</div>
				<fieldset class="form-fields" disabled={!!vendorSelection}>
					<div class="grid">
						<label>Vendor Name<input bind:value={content.vendor.name} maxlength="250" /></label>
						<label
							>Contact Person<input
								bind:value={content.vendor.contact_person}
								maxlength="180"
							/></label
						>
						<label
							>Phone Number<input
								type="tel"
								bind:value={content.vendor.phone}
								maxlength="1024"
							/></label
						>
						<label>Email Address<input type="email" bind:value={content.vendor.email} /></label>
						<label
							>Business Address<input bind:value={content.vendor.address} maxlength="1000" /></label
						>
						<label
							>RC Number / ID<input
								bind:value={content.vendor.registration_id}
								maxlength="150"
							/></label
						>
					</div>
					<details>
						<summary>Bank Details <span>Optional until supplied</span></summary>
						<p class="hint">
							Enter all three fields to generate a bank transfer letter after approval. If they are
							unknown, leave them empty; the letter will be unavailable.
						</p>
						<div class="grid">
							<label
								>Bank Name<input
									bind:value={content.vendor.bank_name}
									required={hasBankDetails}
									maxlength="150"
									pattern={/.*\S.*/.source}
								/></label
							><label
								>Account Number<input
									inputmode="numeric"
									bind:value={content.vendor.account_number}
									required={hasBankDetails}
									minlength="10"
									maxlength="10"
									pattern={/[0-9]{10}/.source}
									title="Enter exactly 10 digits, including any leading zeroes."
								/></label
							><label
								>Account Name<input
									bind:value={content.vendor.account_name}
									required={hasBankDetails}
									maxlength="250"
									pattern={/.*\S.*/.source}
								/></label
							>
						</div>
					</details>
				</fieldset>
			</section>
			<section class="card">
				<div class="section-heading">
					<h2>Scope of Work</h2>
					<span class="eyebrow">03</span>
				</div>
				<div class="stack">
					<label
						>Description of Work or Purchase<textarea
							bind:value={content.description}
							maxlength="5000"
							placeholder="Describe what is needed and why."></textarea></label
					>
					<div class="grid">
						<label>Location<input bind:value={content.location} maxlength="500" /></label><label
							>Warranty / Guarantee<input
								bind:value={content.warranty}
								placeholder="Enter terms, or leave blank if not applicable."
							/></label
						><label>Planned Start Date<input type="date" bind:value={content.start_date} /></label
						><label
							>Planned Completion Date<input
								type="date"
								bind:value={content.completion_date}
								min={content.start_date || undefined}
							/></label
						>
					</div>
					<label
						>Payment Terms<textarea
							bind:value={content.payment_terms}
							placeholder="Leave empty if not yet agreed."></textarea></label
					>
				</div>
			</section>
			<section class="card">
				<div class="section-heading">
					<h2>Cost Breakdown</h2>
					<span class="eyebrow">NGN</span>
				</div>
				<p class="hint">Include delivery and any applicable taxes as separate items.</p>
				<div class="items">
					{#each content.lines as line, index (line)}<div class="item">
							<label
								>Item {index + 1}<input
									bind:value={line.description}
									required
									maxlength="500"
									placeholder="Description"
								/></label
							>
							<label
								>Quantity<input
									inputmode="decimal"
									bind:value={line.quantity}
									pattern={/[0-9]+(\.[0-9]{1,4})?/.source}
									maxlength="40"
									required
								/></label
							>
							<label>Unit Price (₦)<PriceInput bind:value={line.unit_price} /></label>
							<div class="line-total">
								<span>Total</span><strong>{preview(line.quantity, line.unit_price)}</strong>
							</div>
							<button
								type="button"
								class="quiet remove"
								aria-label={'Remove Item ' + (index + 1)}
								onclick={() => content.lines.splice(index, 1)}>×</button
							>
						</div>{/each}
				</div>
				<div class="cost-footer">
					<button
						type="button"
						class="secondary"
						onclick={() =>
							content.lines.push({ description: '', quantity: '1', unit_price: '0.00' })}
						>+ Add Item</button
					>
					<div><small>Grand Total</small><strong>{total}</strong></div>
				</div>
			</section>
		</fieldset>
		{#if error}<div class="error" role="alert">{error}</div>{/if}
		{#if pendingBody}<p role="status">
				The save result is uncertain. Retry the same save before changing the draft.
			</p>{/if}
		{#if conflict}<button
				type="button"
				class="secondary"
				onclick={async () => {
					if (window.confirm('Discard your entries and load the latest version?')) {
						dirty = false;
						await invalidateAll();
						window.location.reload();
					}
				}}>Discard Changes and Reload</button
			>{/if}
		{#if !request && entityId}
			{#key entityId + ':' + uploadRefresh}<Attachments
					{entityId}
					{creationKey}
					disabled={busy || !!pendingBody}
					onChanged={async () => {}}
					onStaged={(ids) => {
						stagedIds = ids;
						if (ids.length) dirty = true;
					}}
					onBusy={(value) => (uploading = value)}
				/>{/key}
		{/if}
		<div class="actions">
			<button disabled={busy || uploading || conflict}
				>{busy ? 'Saving…' : pendingBody ? 'Retry Save' : 'Save Draft'}</button
			><button
				type="button"
				class="secondary"
				disabled={busy}
				onclick={() => {
					if (dirty && !window.confirm('Discard unsaved requisition changes?')) return;
					dirty = false;
					if (onCancel) onCancel();
					else goto('/requisitions');
				}}>Cancel</button
			>
			<small>You’ll review and sign before submitting.</small>
		</div>
	</form>
{/if}

<style>
	.form-fields {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	.vendor-lookup {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
		min-width: 0;
		margin-bottom: 24px;
		padding-bottom: 24px;
		border-bottom: 1px solid var(--rule);
	}
	.vendor-search {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 12px;
	}
	.vendor-search label {
		min-width: 0;
	}
	.vendor-search button {
		min-height: 45px;
		font-size: 14px;
		white-space: nowrap;
	}
	.vendor-lookup > p {
		margin: 0;
		font-size: 13px;
	}
	.vendor-lookup > button {
		min-width: 0;
		font-size: 14px;
		overflow-wrap: anywhere;
		justify-content: flex-start;
		text-align: left;
	}
	.vendor-lookup > .quiet {
		justify-self: start;
		text-align: left;
	}
	@media (max-width: 600px) {
		.vendor-search {
			grid-template-columns: minmax(0, 1fr);
		}
		.vendor-search button {
			justify-self: end;
		}
	}

	details {
		margin-top: 28px;
		border-top: 1px solid var(--rule);
		padding-top: 20px;
	}
	summary {
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
	}
	summary span {
		font-size: 12px;
		font-weight: 400;
		color: var(--body);
		margin-left: 8px;
	}
	.hint {
		font-size: 13px;
		margin-bottom: 20px;
	}
	details .hint {
		margin-top: 16px;
	}
	.items {
		display: grid;
		gap: 18px;
	}
	.item {
		display: grid;
		grid-template-columns:
			minmax(160px, 3fr) minmax(70px, 1fr) minmax(100px, 1.3fr) minmax(100px, 1.3fr)
			44px;
		align-items: end;
		gap: 12px;
	}
	.line-total {
		display: grid;
		gap: 9px;
		text-align: right;
		font-size: 13px;
		padding-bottom: 13px;
	}
	.line-total span {
		color: var(--body);
		font-size: 12px;
	}
	strong {
		font-weight: 600;
	}
	.remove {
		font-size: 20px;
		padding: 8px;
	}
	.cost-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-top: 1px solid var(--rule);
		padding-top: 22px;
		margin-top: 24px;
		gap: 20px;
	}
	.cost-footer div {
		text-align: right;
		display: grid;
		gap: 7px;
	}
	.cost-footer strong {
		font-size: 23px;
	}
	@container panel (max-width: 720px) {
		.item {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			border-bottom: 1px solid var(--rule);
			padding-bottom: 20px;
		}
		.item label:first-child {
			grid-column: 1/-1;
		}
		.line-total {
			text-align: left;
		}
		.remove {
			justify-self: end;
		}
		.cost-footer strong {
			font-size: 19px;
		}
	}

	.line-total,
	.cost-footer > div {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	@container panel (max-width: 420px) {
		.vendor-search {
			grid-template-columns: minmax(0, 1fr);
		}
		.vendor-search button {
			width: 100%;
		}
		.item {
			gap: 16px 12px;
		}
		.item label {
			grid-column: 1 / -1;
		}
		.line-total {
			padding-bottom: 0;
		}
		.cost-footer {
			flex-direction: column;
			align-items: stretch;
		}
		.cost-footer div {
			text-align: left;
			padding-top: 8px;
		}
		.cost-footer strong {
			font-size: 22px;
		}
		summary span {
			display: block;
			margin: 8px 0 0;
		}
	}
</style>
