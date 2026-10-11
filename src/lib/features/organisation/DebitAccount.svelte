<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { DebitAccount, DebitAccountView } from '#lib/api/schema.js';
	let {
		company,
		department = false,
		onClose
	}: {
		company: { id: string; name: string; active: boolean };
		department?: boolean;
		onClose: () => void;
	} = $props();
	let dialog: HTMLDialogElement;
	let loaded = $state(false);
	let loading = $state(true),
		busy = $state(false),
		error = $state(''),
		conflict = $state(false),
		discard = $state(false),
		dirty = $state(false);
	let version = $state(0);
	let account = $state<DebitAccount>({
		bank_name: '',
		branch_address: '',
		account_name: '',
		account_number: '',
		company_address: ''
	});
	const title = $derived(department ? 'Department Sub-Account' : 'Company Debit Account');
	const endpoint = $derived(
		`/organisation/${department ? 'departments' : 'entities'}/${company.id}/debit-account`
	);
	const fields = $derived([
		['bank_name', 'Debit Bank', 150],
		['account_name', department ? 'Department Account Name' : 'Company Account Name', 250],
		['account_number', department ? 'Department Account Number' : 'Company Account Number', 10],
		['branch_address', 'Bank Branch Address', 500],
		['company_address', 'Company Address (Optional)', 500]
	] as const);
	onMount(() => {
		dialog.showModal();
		void load();
	});
	function close() {
		if (busy) return;
		if (dirty && !discard) {
			discard = true;
			return;
		}
		onClose();
	}
	async function failed(e: unknown) {
		if (e instanceof ApiError && e.status === 401) {
			onClose();
			await goto('/login', { invalidateAll: true });
			return;
		}
		conflict = e instanceof ApiError && e.code === 'REVISION_CONFLICT';
		error = e instanceof Error ? e.message : 'Unable to save bank details.';
	}
	async function load() {
		loading = true;
		loaded = false;
		error = '';
		conflict = false;
		try {
			const result = await api<DebitAccountView>(endpoint);
			loaded = true;
			version = result.version;
			if (result.data) account = result.data;
			dirty = false;
			discard = false;
		} catch (e) {
			await failed(e);
		} finally {
			loading = false;
		}
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || conflict) return;
		busy = true;
		error = '';
		try {
			await api(endpoint, {
				method: 'PUT',
				body: JSON.stringify({ expected_version: version, data: account })
			});
			onClose();
		} catch (e) {
			await failed(e);
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	aria-label={title}
	oncancel={(e) => {
		e.preventDefault();
		close();
	}}
>
	<div class="heading">
		<h2>{title}</h2>
		<button class="quiet" disabled={busy} onclick={close} aria-label="Close Bank Account">×</button>
	</div>
	<p>{company.name}</p>
	<p>
		{department
			? 'This sub-account is used when the department’s HOD approves their own requisition from ₦1 to ₦5 million.'
			: 'This account is used for other approved requisitions in this company.'}
		The approver reviews the bank details before signing. Existing signed letters retain their original
		details.
	</p>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if loading}<p role="status">Loading bank details…</p>
	{:else if !loaded}<button class="secondary" onclick={load}>Retry Loading Bank Details</button>
	{:else}
		<form
			onsubmit={save}
			oninput={() => {
				dirty = true;
				discard = false;
			}}
		>
			<fieldset disabled={busy || !company.active}>
				{#each fields as [key, label, max] (key)}
					<label
						>{label}{#if key.endsWith('address')}<textarea
								bind:value={account[key]}
								required={key !== 'company_address'}
								maxlength={max}></textarea>{:else}<input
								bind:value={account[key]}
								required
								maxlength={max}
								autocomplete="off"
								inputmode={key === 'account_number' ? 'numeric' : undefined}
								pattern={key === 'account_number' ? '[0-9]{10}' : undefined}
								title={key === 'account_number'
									? 'Enter exactly 10 digits, including any leading zeroes.'
									: undefined}
							/>{/if}</label
					>
				{/each}
			</fieldset>
			{#if !company.active}<p>
					Enable the {department ? 'company and department' : 'company'} before changing this account.
				</p>{/if}
			<div class="actions">
				<button disabled={busy || conflict || !company.active}
					>{busy ? 'Saving…' : 'Save Bank Details'}</button
				><button type="button" class="secondary" disabled={busy} onclick={close}>Cancel</button>
			</div>
			{#if conflict}<p>
					Your entries are preserved. <button type="button" class="quiet" onclick={load}
						>Discard and Reload</button
					>
				</p>{/if}
			{#if discard}<p role="status">Discard your unsaved bank details?</p>
				<button type="button" class="secondary" onclick={close}>Discard Changes</button>{/if}
		</form>
	{/if}
</dialog>

<style>
	dialog {
		margin: 0 0 0 auto;
		width: 560px;
		max-width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		border: 0;
		border-left: 1px solid var(--rule);
		padding: 24px;
		overflow-y: auto;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 25%);
	}
	.heading,
	.actions {
		display: flex;
		gap: 12px;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 24px 0;
		min-width: 0;
	}
	label {
		display: grid;
		gap: 8px;
		margin-bottom: 20px;
		font-weight: 600;
	}
	input,
	textarea {
		width: 100%;
		min-width: 0;
	}
	p {
		overflow-wrap: anywhere;
	}
</style>
