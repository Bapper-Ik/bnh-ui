<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { VendorData, VendorView } from '#lib/api/schema.js';
	let { data } = $props();
	let drawer: HTMLDialogElement;
	let mode = $state<'detail' | 'create' | 'edit'>('detail');
	let selected = $state<VendorView | null>(null);
	let form = $state<VendorData>({ name: '' });
	let phones = $state('');
	let bankKnown = $state(false);
	let bankName = $state('');
	let accountName = $state('');
	let accountNumber = $state('');
	let busy = $state(false);
	let loading = $state(false);
	let error = $state('');
	let conflict = $state(false);
	let notice = $state('');
	let discard = $state(false);

	function populate(value: VendorData) {
		form = structuredClone($state.snapshot(value));
		phones = value.phones?.join('\n') ?? '';
		bankKnown = !!value.bank;
		bankName = value.bank?.bank_name ?? '';
		accountName = value.bank?.account_name ?? '';
		accountNumber = value.bank?.account_number ?? '';
		error = '';
		conflict = false;
		discard = false;
	}
	function create() {
		selected = null;
		mode = 'create';
		notice = '';
		populate({ name: '' });
		drawer.showModal();
	}
	async function open(id: string) {
		mode = 'detail';
		selected = null;
		error = '';
		conflict = false;
		discard = false;
		loading = true;
		if (!drawer.open) drawer.showModal();
		try {
			selected = await api<VendorView>('/vendors/' + id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to load vendor.';
		} finally {
			loading = false;
		}
	}
	function edit() {
		if (selected) {
			populate(selected.data);
			mode = 'edit';
		}
	}
	function close() {
		if (busy) return;
		if (mode !== 'detail' && !discard) {
			discard = true;
			return;
		}
		drawer.close();
		selected = null;
		populate({ name: '' });
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || conflict || !data.entity) return;
		busy = true;
		error = '';
		const payload: VendorData = {
			...form,
			email: form.email?.trim() || null,
			phones: phones
				.split('\n')
				.map((phone) => phone.trim())
				.filter(Boolean),
			bank: bankKnown
				? { bank_name: bankName, account_name: accountName, account_number: accountNumber }
				: null
		};
		try {
			selected = await api<VendorView>(
				mode === 'create' ? '/vendors' : '/vendors/' + selected!.id,
				{
					method: mode === 'create' ? 'POST' : 'PATCH',
					body: JSON.stringify(
						mode === 'create'
							? { entity_id: data.entity.entity_id, data: payload }
							: { expected_version: selected!.version, data: payload }
					)
				}
			);
			mode = 'detail';
			notice = 'Vendor saved.';
			discard = false;
			await invalidateAll();
		} catch (e) {
			conflict = e instanceof ApiError && e.code === 'REVISION_CONFLICT';
			error = conflict
				? 'This vendor was changed by someone else. Your entries are still here. Close this edit and reload the current record before trying again.'
				: e instanceof Error
					? e.message
					: 'Unable to save vendor.';
		} finally {
			busy = false;
		}
	}
	function listLink(offset: number) {
		return (
			'/vendors?' +
			new URLSearchParams({
				entity: data.entity?.entity_id ?? '',
				search: data.search,
				offset: String(offset)
			})
		);
	}
</script>

<svelte:head><title>Vendors · Custodian</title></svelte:head>
<div class="page-header">
	<div>
		<p class="eyebrow">VENDOR DIRECTORY</p>
		<h1>Vendors</h1>
		<p>Reusable contact and bank details for your requisitions.</p>
	</div>
	{#if data.entity && !data.user.read_only}<button onclick={create}>+ Add vendor</button>{/if}
</div>
{#if notice}<p role="status">{notice}</p>{/if}
{#if data.error}
	<div class="error" role="alert">
		{data.error} <button class="secondary" onclick={() => invalidateAll()}>Retry</button>
	</div>
{:else if !data.entity}
	<div class="empty">
		<h2>No active company membership</h2>
		<p>
			Ask your administrator to assign your company and department before using the vendor
			directory.
		</p>
	</div>
{:else}
	<form class="filters" action="/vendors" method="GET">
		<label
			>Company<select name="entity" value={data.entity.entity_id}
				>{#each data.memberships as membership (membership.entity_id)}<option
						value={membership.entity_id}>{membership.entity_name}</option
					>{/each}</select
			></label
		>
		<label
			>Search vendors<input
				name="search"
				value={data.search}
				maxlength="250"
				placeholder="Vendor name"
				type="search"
			/></label
		>
		<button type="submit" class="secondary">Search</button>
	</form>
	{#if data.vendors?.items.length}
		<div class="table-wrap">
			<table>
				<thead
					><tr
						><th>Vendor</th><th>Registration / ID</th><th>Bank details</th><th
							><span class="visually-hidden">View vendor</span></th
						></tr
					></thead
				><tbody>
					{#each data.vendors.items as vendor (vendor.id)}<tr
							><td
								><strong>{vendor.name}</strong><small class="version"
									>Version {vendor.version}</small
								></td
							><td>{vendor.registration_id || '—'}</td><td
								>{vendor.bank_details_state === 'unknown'
									? 'Not supplied'
									: 'Recorded · restricted access'}</td
							><td
								><button
									class="secondary"
									onclick={() => open(vendor.id)}
									aria-label={'View ' + vendor.name}>View</button
								></td
							></tr
						>{/each}
				</tbody>
			</table>
		</div>
		<div class="pagination">
			<small
				>{data.vendors.offset + 1}–{Math.min(
					data.vendors.offset + data.vendors.limit,
					data.vendors.total
				)} of {data.vendors.total}</small
			>
			<div class="actions">
				{#if data.vendors.offset > 0}<a
						class="button secondary"
						href={listLink(Math.max(0, data.vendors.offset - data.vendors.limit))}>Previous</a
					>{/if}{#if data.vendors.offset + data.vendors.limit < data.vendors.total}<a
						class="button secondary"
						href={listLink(data.vendors.offset + data.vendors.limit)}>Next</a
					>{/if}
			</div>
		</div>
	{:else}<div class="empty">
			<h2>{data.search ? 'No matching vendors' : 'No vendors yet'}</h2>
			<p>
				{data.search
					? 'Try another name or company.'
					: 'Add a vendor to keep reusable contact and bank details.'}
			</p>
		</div>{/if}
{/if}

<dialog
	bind:this={drawer}
	aria-labelledby="drawer-title"
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
>
	<div class="drawer-heading">
		<h2 id="drawer-title">
			{mode === 'create' ? 'Add vendor' : mode === 'edit' ? 'Edit vendor' : 'Vendor details'}
		</h2>
		<button class="quiet" onclick={close} disabled={busy} aria-label="Close vendor drawer">✕</button
		>
	</div>
	{#if discard}<div class="error">
			<p>Discard your unsaved changes?</p>
			<div class="actions">
				<button class="secondary" onclick={() => (discard = false)}>Keep editing</button><button
					onclick={close}>Discard changes</button
				>
			</div>
		</div>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if loading}<p role="status">Loading vendor…</p>
	{:else if mode === 'detail' && selected}
		<h3>{selected.name}</h3>
		<p>Version {selected.version} · Details are recorded, not independently verified.</p>
		<dl>
			<dt>Contact person</dt>
			<dd>{selected.data.contact_person || 'Not supplied'}</dd>
			<dt>Phone numbers</dt>
			<dd>{selected.data.phones?.join(', ') || 'Not supplied'}</dd>
			<dt>Email</dt>
			<dd>{selected.data.email || 'Not supplied'}</dd>
			<dt>Business address</dt>
			<dd>{selected.data.address || 'Not supplied'}</dd>
			<dt>Registration / ID</dt>
			<dd>{selected.registration_id || 'Not supplied'}</dd>
		</dl>
		<section class="bank">
			<h3>Bank details</h3>
			{#if selected.bank_details_state === 'restricted'}<p>
					You do not have access to these bank details.
				</p>
			{:else if selected.data.bank}<dl>
					<dt>Bank name</dt>
					<dd>{selected.data.bank.bank_name}</dd>
					<dt>Account name</dt>
					<dd>{selected.data.bank.account_name}</dd>
					<dt>Account number</dt>
					<dd>{selected.data.bank.account_number}</dd>
				</dl>
			{:else}<p>Bank details have not been supplied.</p>{/if}
		</section>
		{#if selected.can_update}<button onclick={edit}>Edit vendor</button>{/if}
	{:else if mode !== 'detail'}
		<form class="stack" onsubmit={save}>
			<fieldset disabled={busy} class="stack">
				<label
					>Vendor name<input bind:value={form.name} required minlength="2" maxlength="250" /></label
				>
				<label>Contact person<input bind:value={form.contact_person} maxlength="180" /></label>
				<label
					>Phone numbers<textarea bind:value={phones} aria-describedby="phone-help"
					></textarea><small id="phone-help">One number per line, up to 10.</small></label
				>
				<label>Email<input type="email" bind:value={form.email} maxlength="254" /></label>
				<label
					>Business address<textarea bind:value={form.address} maxlength="1000"></textarea></label
				>
				<label>Registration / ID<input bind:value={form.registration_id} maxlength="150" /></label>
				<label
					>Bank details<select bind:value={bankKnown}
						><option value={false}>Not supplied</option><option value={true}
							>Supply bank details</option
						></select
					></label
				>
				{#if bankKnown}<div class="stack bank">
						<label>Bank name<input bind:value={bankName} required maxlength="150" /></label><label
							>Account name<input bind:value={accountName} required maxlength="250" /></label
						><label
							>Account number<input bind:value={accountNumber} required maxlength="100" /></label
						>
					</div>{/if}
				<p class="hint">
					Updates create a new vendor version. Existing submitted requisitions keep their original
					details.
				</p>
				<div class="actions">
					<button type="submit" disabled={busy || conflict}
						>{busy ? 'Saving…' : 'Save vendor'}</button
					><button type="button" class="secondary" onclick={close}>Cancel</button>
				</div>
			</fieldset>
		</form>
	{/if}
</dialog>

<style>
	.filters {
		display: grid;
		grid-template-columns: minmax(150px, 1fr) minmax(180px, 2fr) auto;
		gap: 16px;
		align-items: end;
		margin-bottom: 28px;
	}
	.version {
		display: block;
		margin-top: 5px;
	}
	.pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		margin-top: 24px;
	}
	dialog {
		position: fixed;
		inset: 0 0 0 auto;
		margin: 0;
		width: min(580px, 100%);
		max-width: 100%;
		height: 100dvh;
		max-height: 100dvh;
		border: 0;
		border-left: 1px solid var(--rule);
		padding: 28px;
		color: var(--ink);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 25%);
	}
	.drawer-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		margin-bottom: 24px;
	}
	.drawer-heading h2 {
		margin: 0;
	}
	dt {
		font-size: 12px;
		color: var(--body);
		margin-top: 20px;
	}
	dd {
		margin: 7px 0 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		line-height: 1.5;
	}
	.bank {
		border-block: 1px solid var(--rule);
		padding: 22px 0;
		margin: 24px 0;
	}
	.bank dl {
		margin-bottom: 0;
	}
	.hint {
		font-size: 12px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	@media (max-width: 700px) {
		.filters {
			grid-template-columns: 1fr;
		}
		.pagination {
			flex-wrap: wrap;
		}
		dialog {
			padding: 24px;
		}
	}
</style>
