<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { OrganisationRecord, EntityItem, Item } from '#lib/api/schema.js';
	let { data } = $props();
	let drawer: HTMLDialogElement;
	let selected = $state<OrganisationRecord | null>(null);
	let category = $state<'entities' | 'departments'>('entities');
	let mode = $state<'create' | 'edit' | 'state'>('create');
	let name = $state(''),
		code = $state(''),
		kind = $state('subsidiary');
	let busy = $state(false),
		error = $state(''),
		conflict = $state(false),
		discard = $state(false),
		notice = $state('');
	const company = $derived(
		data.workspace?.entities.find((e) => e.id === data.workspace?.selected_entity)
	);
	const roles: Record<string, string> = {
		hod: 'Head of Department',
		chief_of_staff: 'Chief of Staff',
		md: 'Managing Director',
		secretary: 'Company Secretary',
		chairman: 'Board Chairman'
	};
	const tabs = [
		['companies', 'Companies'],
		['departments', 'Departments'],
		['offices', 'Officeholders'],
		['authority', 'Approval matrix']
	];
	function link(tab: string, entity = data.workspace?.selected_entity ?? '') {
		return '/organisation?' + new URLSearchParams(entity ? { tab, entity } : { tab });
	}
	function open(
		type: 'entities' | 'departments',
		action: 'create' | 'edit' | 'state',
		record: OrganisationRecord | null = null
	) {
		category = type;
		mode = action;
		selected = record;
		name = record?.name ?? '';
		code = record?.code ?? '';
		kind = record?.kind ?? 'subsidiary';
		error = '';
		conflict = false;
		discard = false;
		drawer.showModal();
	}
	function close() {
		if (busy) return;
		if (mode !== 'state' && !discard) {
			discard = true;
			return;
		}
		drawer.close();
		selected = null;
		discard = false;
	}
	async function failure(e: unknown) {
		if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
			drawer.close();
			selected = null;
			if (e.status === 401) await goto('/login', { invalidateAll: true });
			else await invalidateAll();
			return;
		}
		conflict = e instanceof ApiError && e.code === 'REVISION_CONFLICT';
		error = conflict
			? 'This record changed. Your entries are preserved. Discard and reload before trying again.'
			: e instanceof Error
				? e.message
				: 'Unable to save this record.';
	}
	async function reload() {
		drawer.close();
		selected = null;
		await invalidateAll();
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || conflict) return;
		busy = true;
		error = '';
		try {
			if (mode === 'create') {
				const body =
					category === 'entities' ? { name, code, kind } : { name, code, entity_id: company?.id };
				const result = await api<EntityItem | Item>('/organisation/' + category, {
					method: 'POST',
					body: JSON.stringify(body)
				});
				drawer.close();
				notice = category === 'entities' ? 'Company created.' : 'Department created.';
				if (category === 'entities')
					await goto(link('companies', result.id), { invalidateAll: true });
				else await invalidateAll();
			} else if (selected) {
				await api<OrganisationRecord>('/organisation/workspace/' + category + '/' + selected.id, {
					method: 'PATCH',
					body: JSON.stringify({
						expected_version: selected.version,
						...(mode === 'edit' ? { name } : { active: !selected.active })
					})
				});
				notice =
					mode === 'edit'
						? 'Name updated.'
						: selected.active
							? 'Record disabled. Historical records are retained.'
							: 'Record enabled. Current eligibility checks still apply.';
				drawer.close();
				selected = null;
				await invalidateAll();
			}
		} catch (e) {
			await failure(e);
		} finally {
			busy = false;
		}
	}
	function date(value: string | null) {
		return value
			? new Intl.DateTimeFormat('en-NG', {
					dateStyle: 'medium',
					timeStyle: 'short',
					timeZone: 'Africa/Lagos'
				}).format(new Date(value)) + ' WAT'
			: 'No end date';
	}
</script>

<svelte:head><title>Organisation & Authority · Custodian</title></svelte:head>
<div class="page-header">
	<p class="eyebrow">ADMINISTRATION</p>
	<h1>Organisation & Authority</h1>
	<p>Manage companies and departments, and review the people assigned to each office.</p>
</div>
{#if notice}<p role="status" class="notice">{notice}</p>{/if}
{#if data.forbidden}
	<div class="empty">
		<h2>Access restricted</h2>
		<p>Organisation management is available only to authorised administrators.</p>
		<a href="/vendors">Return to workspace</a>
	</div>
{:else if data.error}
	<div role="alert" class="empty">
		<h2>Unable to load organisation</h2>
		<p>{data.error}</p>
		<button onclick={() => invalidateAll()}>Retry</button>
		<a href="/organisation">Reset company selection</a>
	</div>
{:else if data.workspace}
	<nav class="tabs" aria-label="Organisation sections">
		{#each tabs as [key, label] (key)}<a
				href={link(key)}
				aria-current={data.tab === key ? 'page' : undefined}>{label}</a
			>{/each}
	</nav>
	{#if data.tab !== 'companies' && data.tab !== 'authority'}
		<label class="company-picker"
			>Company<select
				value={data.workspace.selected_entity ?? ''}
				onchange={(e) => goto(link(data.tab, e.currentTarget.value))}
				disabled={!data.workspace.entities.length}
			>
				{#if !data.workspace.entities.length}<option value="">No companies configured</option>{/if}
				{#each data.workspace.entities as item (item.id)}<option value={item.id}
						>{item.name}{item.active ? '' : ' (disabled)'}</option
					>{/each}
			</select></label
		>
		{#if company && !company.active}<p class="notice">
				This company is disabled. Its memberships and appointments cannot provide authority.
				Existing records are retained.
			</p>{/if}
	{/if}
	{#if data.tab === 'companies'}
		<div class="section-header">
			<h2>Companies</h2>
			<button onclick={() => open('entities', 'create')}>Add company</button>
		</div>
		{#if !data.workspace.entities.length}<div class="empty">
				<h3>No companies yet</h3>
				<p>Add the first approved company, then configure its departments.</p>
			</div>{/if}
		<div class="records">
			{#each data.workspace.entities as item (item.id)}<article>
					<div>
						<h3>{item.name}</h3>
						<p>{item.code} · {item.kind === 'holding' ? 'Holding company' : 'Subsidiary'}</p>
						<span class="badge">{item.active ? 'Enabled' : 'Disabled'}</span>
					</div>
					<div class="actions">
						<a class="button secondary" href={link('departments', item.id)}>Departments</a><a
							class="button secondary"
							href={link('offices', item.id)}>Officeholders</a
						><button
							class="secondary"
							aria-label={'Edit company ' + item.name}
							onclick={() => open('entities', 'edit', item)}>Edit</button
						><button
							class="secondary"
							aria-label={(item.active ? 'Disable company ' : 'Enable company ') + item.name}
							onclick={() => open('entities', 'state', item)}
							>{item.active ? 'Disable' : 'Enable'}</button
						>
					</div>
				</article>{/each}
		</div>
	{:else if data.tab === 'departments'}
		<div class="section-header">
			<h2>Departments</h2>
			<button disabled={!company?.active} onclick={() => open('departments', 'create')}
				>Add department</button
			>
		</div>
		{#if !company}<div class="empty">
				<h3>Add a company first</h3>
				<a href={link('companies')}>Manage companies</a>
			</div>
		{:else if !data.workspace.departments.length}<div class="empty">
				<h3>No departments yet</h3>
				<p>Add the approved departments for {company.name}.</p>
			</div>{/if}
		<div class="records">
			{#each data.workspace.departments as item (item.id)}<article>
					<div>
						<h3>{item.name}</h3>
						<p>{item.code}</p>
						<span class="badge">{item.active ? 'Enabled' : 'Disabled'}</span
						>{#if item.active && !company?.active}<p>
								Unavailable while the company is disabled.
							</p>{/if}
					</div>
					<div class="actions">
						<button
							class="secondary"
							aria-label={'Edit department ' + item.name}
							onclick={() => open('departments', 'edit', item)}>Edit</button
						><button
							class="secondary"
							disabled={!item.active && !company?.active}
							aria-label={(item.active ? 'Disable department ' : 'Enable department ') + item.name}
							onclick={() => open('departments', 'state', item)}
							>{item.active ? 'Disable' : 'Enable'}</button
						>
					</div>
				</article>{/each}
		</div>
	{:else if data.tab === 'offices'}
		<div class="section-header">
			<h2>Officeholders</h2>
			{#if data.user.permissions.includes('staff:manage')}<a class="button secondary" href="/staff"
					>Manage staff & appointments</a
				>{/if}
		</div>
		<p>
			Appointments are company-specific. Effective dates and current account and membership status
			determine eligibility; self-approval and request-specific checks still apply.
		</p>
		{#if !company}<div class="empty">
				<h3>Add a company first</h3>
				<a href={link('companies')}>Manage companies</a>
			</div>
		{:else if !data.workspace.offices.length}<div class="empty">
				<h3>No appointments recorded</h3>
				<p>
					An authorised operator must assign officeholders through Staff & Access. Missing
					appointments block the affected approvals.
				</p>
			</div>{/if}
		{#if data.workspace.authority_gaps.length}<div class="notice">
				<h3>Appointments to complete</h3>
				<p>These gaps block affected approval routes.</p>
				<ul>
					{#each data.workspace.authority_gaps as gap (gap)}<li>{gap}</li>{/each}
				</ul>
			</div>{/if}
		<div class="records offices">
			{#each data.workspace.offices as item (item.id)}<article>
					<div class="office-title">
						<div>
							<p class="eyebrow">{roles[item.role] ?? item.role}</p>
							<h3>{item.holder_name}</h3>
							<p>{item.department_name ?? 'Company-wide appointment'}</p>
						</div>
						<span class="badge"
							>{item.status === 'active'
								? 'Effective'
								: item.status[0].toUpperCase() + item.status.slice(1)}</span
						>
					</div>
					<p>{item.reason}</p>
					<dl>
						<div>
							<dt>From</dt>
							<dd>{date(item.valid_from)}</dd>
						</div>
						<div>
							<dt>Until</dt>
							<dd>{date(item.valid_until)}</dd>
						</div>
						<div>
							<dt>Authorisation reference</dt>
							<dd>{item.authorisation_reference}</dd>
						</div>
					</dl>
				</article>{/each}
		</div>
	{:else}
		<div class="section-header">
			<h2>Approval matrix</h2>
			<span class="badge">Read-only · NGN</span>
		</div>
		<p>The agreed amount thresholds and requester escalation rules are fixed.</p>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll the wide matrix.) -->
		<div class="matrix-scroll" role="region" aria-label="Approval matrix" tabindex="0">
			<table>
				<thead
					><tr
						><th scope="col">Requester</th>{#each data.workspace.bands as band (band)}<th
								scope="col">{band}</th
							>{/each}</tr
					></thead
				><tbody
					>{#each data.workspace.matrix as row (row.requester)}<tr
							><th scope="row">{row.requester}</th
							>{#each row.authorities as authority, index (index)}<td>{authority}</td>{/each}</tr
						>{/each}</tbody
				>
			</table>
		</div>
		<ul class="rules">
			{#each data.workspace.rules as rule (rule)}<li>{rule}</li>{/each}
		</ul>
	{/if}
{/if}

<dialog
	bind:this={drawer}
	class="org-drawer"
	aria-labelledby="org-drawer-title"
	oncancel={(e) => {
		e.preventDefault();
		close();
	}}
>
	<div class="drawer-header">
		<div>
			<p class="eyebrow">{category === 'entities' ? 'COMPANY' : 'DEPARTMENT'}</p>
			<h2 id="org-drawer-title">
				{mode === 'create'
					? category === 'entities'
						? 'Add company'
						: 'Add department'
					: mode === 'edit'
						? 'Edit ' + name
						: (selected?.active ? 'Disable ' : 'Enable ') + selected?.name}
			</h2>
		</div>
		<button class="quiet" aria-label="Close drawer" onclick={close} disabled={busy}>×</button>
	</div>
	{#if discard}<div role="alert" class="notice">
			<p>Discard your unsaved entries?</p>
			<button onclick={close}>Discard changes</button>
			<button class="secondary" onclick={() => (discard = false)}>Keep editing</button>
		</div>{/if}
	{#if error}<div role="alert" class="notice">
			<p>{error}</p>
			{#if conflict}<button class="secondary" onclick={reload}>Discard and reload</button>{/if}
		</div>{/if}
	<form onsubmit={save}>
		{#if mode === 'state'}
			<p>
				{selected?.active
					? 'Disabling this record prevents its memberships and appointments from providing authority. Historical records will remain available.'
					: 'Enabling this record may make retained memberships and appointments effective again. Existing dates and account restrictions still apply.'}
			</p>
		{:else}
			<label
				>Name<input
					bind:value={name}
					required
					minlength="2"
					maxlength="180"
					disabled={busy || conflict}
				/></label
			>
			{#if mode === 'create'}<label
					>Code<input
						aria-label="Code"
						aria-describedby="org-code-hint"
						bind:value={code}
						required
						minlength="2"
						maxlength="40"
						pattern="[A-Za-z0-9_\-]+"
						disabled={busy || conflict}
					/><small id="org-code-hint">Letters, numbers, underscores and hyphens.</small></label
				>
				{#if category === 'entities'}<label
						>Company type<select bind:value={kind} disabled={busy}
							><option value="subsidiary">Subsidiary</option><option value="holding"
								>Holding company</option
							></select
						></label
					>{:else}<p>Company: {company?.name}</p>{/if}
			{:else}<p>
					Code: {selected?.code}. {category === 'entities'
						? 'Company type is retained.'
						: 'Company membership is retained.'}
				</p>{/if}
		{/if}
		<div class="form-actions">
			<button type="submit" disabled={busy || conflict}
				>{busy
					? 'Saving…'
					: mode === 'state'
						? 'Confirm'
						: mode === 'create'
							? 'Create'
							: 'Save changes'}</button
			><button type="button" class="secondary" onclick={close} disabled={busy}>Cancel</button>
		</div>
	</form>
</dialog>

<style>
	.page-header {
		display: block;
		margin-bottom: 28px;
	}
	h1 {
		margin: 6px 0 12px;
	}
	h2,
	h3,
	p {
		overflow-wrap: anywhere;
	}
	h3 {
		margin: 0 0 8px;
	}
	p {
		color: var(--body);
		line-height: 1.6;
	}
	.eyebrow {
		font-size: 12px;
		font-weight: 600;
		margin: 0 0 6px;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		border-bottom: 1px solid var(--rule);
		padding-bottom: 12px;
		margin-bottom: 24px;
	}
	.tabs a {
		padding: 10px 14px;
		text-decoration: none;
		border-radius: 5px;
	}
	.tabs a[aria-current='page'] {
		background: var(--surface);
		font-weight: 600;
	}
	.section-header,
	.office-title {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		margin: 20px 0;
	}
	.section-header h2 {
		margin: 0;
	}
	.company-picker {
		max-width: 520px;
	}
	label {
		display: grid;
		gap: 8px;
		font-weight: 600;
		margin-bottom: 20px;
	}
	input,
	select {
		width: 100%;
		min-width: 0;
	}
	small {
		color: var(--body);
		font-weight: 400;
	}
	.records {
		display: grid;
		gap: 16px;
	}
	article {
		border: 1px solid var(--rule);
		border-radius: 6px;
		padding: 20px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
	}
	article > div {
		min-width: 0;
	}
	article p {
		margin: 8px 0;
	}
	.actions,
	.form-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.actions {
		justify-content: flex-end;
	}
	.button {
		display: inline-flex;
		text-decoration: none;
		border: 1px solid var(--rule);
		padding: 10px 14px;
		border-radius: 5px;
		font-weight: 600;
		align-items: center;
	}
	.badge {
		display: inline-block;
		border: 1px solid var(--rule);
		padding: 5px 9px;
		border-radius: 4px;
		font-size: 12px;
		white-space: nowrap;
	}
	.empty,
	.notice {
		background: var(--surface);
		padding: 20px;
		border-radius: 6px;
		margin: 16px 0;
	}
	.notice li {
		line-height: 1.5;
		margin: 6px 0;
	}
	.empty {
		text-align: center;
		padding: 40px 20px;
	}
	.offices article {
		display: block;
	}
	.office-title {
		margin-top: 0;
		align-items: flex-start;
	}
	dl {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
	}
	dt {
		font-size: 12px;
		color: var(--body);
	}
	dd {
		margin: 6px 0 0;
		overflow-wrap: anywhere;
	}
	.matrix-scroll {
		overflow-x: auto;
		border: 1px solid var(--rule);
		border-radius: 6px;
	}
	table {
		width: 100%;
		min-width: 740px;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 16px;
		text-align: left;
		border-bottom: 1px solid var(--rule);
		line-height: 1.6;
	}
	thead {
		background: var(--surface);
	}
	.rules {
		padding-left: 20px;
		color: var(--body);
		line-height: 1.7;
	}
	.rules li {
		margin: 12px 0;
	}
	.org-drawer {
		margin: 0 0 0 auto;
		height: 100dvh;
		max-height: 100dvh;
		width: 560px;
		max-width: 100vw;
		border: 0;
		border-left: 1px solid var(--rule);
		padding: 28px;
		overflow-y: auto;
	}
	.org-drawer::backdrop {
		background: rgb(0 0 0 / 25%);
	}
	.drawer-header {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		align-items: flex-start;
		margin-bottom: 24px;
	}
	.drawer-header h2 {
		margin: 0;
	}
	:global(body:has(dialog.org-drawer[open])) {
		overflow: hidden;
	}
	@media (max-width: 700px) {
		article {
			display: block;
			padding: 16px;
		}
		.actions {
			justify-content: flex-start;
			margin-top: 20px;
		}
		.section-header {
			align-items: flex-start;
			flex-wrap: wrap;
		}
		.org-drawer {
			padding: 24px;
		}
		.tabs a {
			padding: 10px;
		}
	}
</style>
