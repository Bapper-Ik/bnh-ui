<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { InvitationView, StaffDetail } from '#lib/api/schema.js';
	let { data } = $props();
	let drawer: HTMLDialogElement;
	let selected = $state<StaffDetail | null>(null);
	let mode = $state<'detail' | 'invite' | 'edit' | 'membership' | 'office' | 'confirm'>('detail');
	let busy = $state(false),
		loading = $state(false),
		error = $state(''),
		notice = $state(''),
		conflict = $state(false);
	let discard = $state<'close' | 'detail' | null>(null);
	let name = $state(''),
		email = $state(''),
		entity = $state(''),
		department = $state('');
	let office = $state('hod'),
		reference = $state(''),
		starts = $state(''),
		ends = $state('');
	let command = $state<{
		path: string;
		body: Record<string, unknown>;
		label: string;
		description: string;
	} | null>(null);
	const roles: Record<string, string> = {
		hod: 'Head of Department',
		chief_of_staff: 'Chief of Staff',
		md: 'Managing Director',
		secretary: 'Company Secretary',
		chairman: 'Board Chairman'
	};
	const statusLabel = (status: string) =>
		({ active: 'Active', invited: 'Invitation pending', disabled: 'Disabled' })[status] ?? status;
	const companyName = (id: string) =>
		selected?.memberships.find((m) => m.entity_id === id)?.entity_name ??
		data.options.entities.find((e) => e.id === id)?.name ??
		'Company unavailable';
	const availableDepartments = $derived(
		data.options.departments.filter((d) => d.entity_id === entity)
	);
	const officeMemberships = $derived(
		selected?.memberships.filter((m) => m.active && m.scope_active) ?? []
	);
	function reset() {
		error = '';
		conflict = false;
		discard = null;
		command = null;
	}
	async function handleError(e: unknown) {
		if (e instanceof ApiError && e.status === 401) {
			selected = null;
			drawer.close();
			await goto('/login', { invalidateAll: true });
			return;
		}
		if (e instanceof ApiError && e.status === 403) {
			selected = null;
			drawer.close();
			notice = 'Your access changed. Please review your available actions.';
			await invalidateAll();
			return;
		}
		conflict = e instanceof ApiError && e.code === 'REVISION_CONFLICT';
		error = conflict
			? 'This record changed while you were working. Your entries are preserved. Reload the record before trying again.'
			: e instanceof Error
				? e.message
				: 'Unable to complete this action.';
	}
	async function open(id: string) {
		reset();
		mode = 'detail';
		selected = null;
		loading = true;
		if (!drawer.open) drawer.showModal();
		try {
			selected = await api<StaffDetail>('/staff/' + id);
		} catch (e) {
			await handleError(e);
		} finally {
			loading = false;
		}
	}
	function invite() {
		reset();
		name = '';
		email = '';
		selected = null;
		mode = 'invite';
		drawer.showModal();
	}
	function leave(destination: 'close' | 'detail') {
		if (busy || loading) return;
		if (['invite', 'edit', 'membership', 'office'].includes(mode) && !discard) {
			discard = destination;
			return;
		}
		reset();
		if (destination === 'close') {
			drawer.close();
			selected = null;
		} else mode = 'detail';
	}
	async function reloadRecord() {
		if (selected) await open(selected.id);
	}
	function edit() {
		if (!selected) return;
		reset();
		name = selected.name;
		mode = 'edit';
	}
	function membership() {
		reset();
		entity = data.options.entities[0]?.id ?? '';
		department = '';
		mode = 'membership';
	}
	function appointment() {
		reset();
		entity = officeMemberships[0]?.entity_id ?? '';
		office = 'hod';
		reference = '';
		starts = '';
		ends = '';
		mode = 'office';
	}
	function confirm(
		path: string,
		body: Record<string, unknown>,
		label: string,
		description: string
	) {
		reset();
		command = { path, body, label, description };
		mode = 'confirm';
	}
	async function mutate(
		path: string,
		body: Record<string, unknown>,
		message: string,
		method = 'POST'
	) {
		if (!selected || busy || conflict) return;
		busy = true;
		error = '';
		try {
			selected = await api<StaffDetail>('/staff/' + selected.id + path, {
				method,
				body: JSON.stringify({ ...body, expected_version: selected.version })
			});
			mode = 'detail';
			reset();
			notice = message;
			await invalidateAll();
		} catch (e) {
			await handleError(e);
		} finally {
			busy = false;
		}
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || conflict) return;
		if (mode === 'invite') {
			busy = true;
			error = '';
			try {
				const invitation = await api<InvitationView>('/auth/invitations', {
					method: 'POST',
					body: JSON.stringify({ name, email })
				});
				notice = 'Invitation queued. The recipient must set a password before signing in.';
				await open(invitation.identity_id);
				await invalidateAll();
			} catch (e) {
				await handleError(e);
			} finally {
				busy = false;
			}
		} else if (mode === 'edit') await mutate('', { name }, 'Staff name updated.', 'PATCH');
		else if (mode === 'membership' && selected)
			await mutate(
				'/memberships',
				{ identity_id: selected.id, entity_id: entity, department_id: department },
				'Department membership saved.'
			);
		else if (mode === 'office' && selected) {
			const member = officeMemberships.find((m) => m.entity_id === entity);
			const payload: Record<string, unknown> = {
				identity_id: selected.id,
				entity_id: entity,
				department_id: office === 'hod' ? member?.department_id : null,
				role: office,
				authorisation_reference: reference
			};
			// These inputs explicitly use Lagos time (UTC+01:00), independent of browser zone.
			if (starts) payload.valid_from = new Date(starts + ':00+01:00').toISOString();
			if (ends) payload.valid_until = new Date(ends + ':00+01:00').toISOString();
			await mutate('/offices', payload, 'Office appointment recorded.');
		} else if (mode === 'confirm' && command)
			await mutate(command.path, command.body, command.label + ' completed.');
	}
	function listLink(offset: number) {
		return (
			'/staff?' +
			new URLSearchParams({ search: data.search, status: data.status, offset: String(offset) })
		);
	}
	function lagos(value: string | null | undefined) {
		return value
			? new Intl.DateTimeFormat('en-NG', {
					dateStyle: 'medium',
					timeStyle: 'short',
					timeZone: 'Africa/Lagos'
				}).format(new Date(value)) + ' WAT'
			: 'No end date';
	}
</script>

<svelte:head><title>Staff & Access · Custodian</title></svelte:head>
<div class="page-header">
	<div>
		<p class="eyebrow">ADMINISTRATION</p>
		<h1>Staff & Access</h1>
		<p>Manage individual accounts, department membership and authorised appointments.</p>
	</div>
	{#if !data.forbidden && !data.error}<button onclick={invite}>Invite staff</button>{/if}
</div>
{#if notice}<p role="status">{notice}</p>{/if}
{#if data.forbidden}<div class="empty">
		<h2>Access restricted</h2>
		<p>Staff management is available only to authorised administrators.</p>
		<a href="/vendors">Return to workspace</a>
	</div>
{:else if data.error}<div class="error" role="alert">
		{data.error} <button class="secondary" onclick={() => invalidateAll()}>Retry</button>
	</div>
{:else}
	{#if !data.options.email_enabled}<div class="delivery-note" role="status">
			<strong>Account email is not configured.</strong> You can manage existing staff. Invitations will
			be available when your administrator enables email delivery.
		</div>{/if}
	<form class="filters" method="GET" action="/staff">
		<label
			>Search staff<input
				name="search"
				type="search"
				maxlength="180"
				value={data.search}
				placeholder="Name or email"
			/></label
		><label
			>Account status<select name="status" value={data.status}
				><option value="">All accounts</option><option value="active">Active</option><option
					value="invited">Invitation pending</option
				><option value="disabled">Disabled</option></select
			></label
		><button type="submit" class="secondary">Search</button>
	</form>
	{#if data.staff?.items.length}<div class="table-wrap">
			<!-- svelte-ignore a11y_no_redundant_roles (Explicit table roles preserve semantics when rows become cards.) -->
			<table class="responsive-table" role="table">
				<thead role="rowgroup"
					><tr role="row"
						><th scope="col" role="columnheader">Staff member</th><th
							scope="col"
							role="columnheader">Email</th
						><th scope="col" role="columnheader">Account status</th><th
							scope="col"
							role="columnheader"><span class="visually-hidden">Manage staff</span></th
						></tr
					></thead
				><tbody role="rowgroup"
					>{#each data.staff.items as person (person.id)}<tr role="row"
							><td role="cell" data-label="Staff member"
								><strong>{person.name}</strong>{#if person.id === data.user.id}<small class="sub"
										>Your account</small
									>{/if}{#if person.read_only}<small class="sub">Read-only access</small>{/if}</td
							><td role="cell" data-label="Email" class="email-cell">{person.email}</td><td
								role="cell"
								data-label="Account status"
								><span class="status">{statusLabel(person.status)}</span></td
							><td role="cell" data-label="Actions"
								><button
									class="secondary"
									aria-label={'Manage ' + person.name}
									onclick={() => open(person.id)}>Manage</button
								></td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
		<div class="pagination">
			<small
				>{data.staff.offset + 1}–{Math.min(data.staff.offset + data.staff.limit, data.staff.total)} of
				{data.staff.total} staff</small
			>
			<div class="actions">
				{#if data.staff.offset > 0}<a
						class="button secondary"
						href={listLink(Math.max(0, data.staff.offset - data.staff.limit))}>Previous</a
					>{/if}{#if data.staff.offset + data.staff.limit < data.staff.total}<a
						class="button secondary"
						href={listLink(data.staff.offset + data.staff.limit)}>Next</a
					>{/if}
			</div>
		</div>
	{:else}<div class="empty">
			<h2>No matching staff</h2>
			<p>Try another search or invite a colleague to join Custodian.</p>
		</div>{/if}
{/if}

<dialog
	class="staff-modal"
	bind:this={drawer}
	aria-labelledby="staff-drawer-title"
	oncancel={(event) => {
		event.preventDefault();
		leave('close');
	}}
>
	<div class="drawer-heading">
		<div>
			<p class="eyebrow">STAFF ACCOUNT</p>
			<h2 id="staff-drawer-title">
				{mode === 'invite'
					? 'Invite staff'
					: mode === 'edit'
						? 'Edit staff name'
						: mode === 'membership'
							? 'Department membership'
							: mode === 'office'
								? 'Assign office'
								: mode === 'confirm'
									? command?.label
									: (selected?.name ?? 'Staff details')}
			</h2>
		</div>
		<button
			class="quiet"
			aria-label="Close staff drawer"
			disabled={busy || loading}
			onclick={() => leave('close')}>✕</button
		>
	</div>
	{#if discard}<div class="error" role="alert">
			Discard the entries in this form?
			<div class="actions">
				<button
					class="secondary"
					onclick={() => {
						const destination = discard!;
						leave(destination);
					}}>Discard changes</button
				><button onclick={() => (discard = null)}>Keep editing</button>
			</div>
		</div>{/if}
	{#if error}<div class="error" role="alert">
			{error}{#if conflict}<button class="secondary" onclick={reloadRecord}
					>Discard entries and reload</button
				>{/if}
		</div>{/if}
	{#if loading}<p role="status">Loading staff record…</p>
	{:else if mode === 'detail' && selected}
		<div class="stack">
			<div>
				<p class="staff-email">{selected.email}</p>
				<span class="status">{statusLabel(selected.status)}</span>{#if selected.read_only}<p>
						Read-only review access
					</p>{/if}
			</div>
			{#if selected.id === data.user.id}<p class="delivery-note">
					Another authorised administrator must change your account status, department or office
					assignments.
				</p>{/if}
			<section>
				<h3>Account controls</h3>
				<div class="actions">
					{#if selected.actions.includes('edit')}<button class="secondary" onclick={edit}
							>Edit name</button
						>{/if}{#if selected.actions.includes('resend_invitation')}<button
							class="secondary"
							disabled={!data.options.email_enabled || busy}
							onclick={() =>
								confirm(
									'/invitation',
									{},
									'Resend invitation',
									'Send a new activation link. Previous activation links will stop working.'
								)}>Resend invitation</button
						>{/if}{#if selected.actions.includes('disable')}<button
							class="secondary"
							onclick={() =>
								confirm(
									'/state',
									{ active: false },
									'Disable account',
									'This person will be signed out and unable to sign in. Historical records and appointments are retained.'
								)}>Disable account</button
						>{/if}{#if selected.actions.includes('enable')}<button
							class="secondary"
							onclick={() =>
								confirm(
									'/state',
									{ active: true },
									'Enable account',
									'Restore account access. Pending invitees still need to set a password. Retained memberships and appointments may become effective again.'
								)}>Enable account</button
						>{/if}{#if selected.actions.includes('revoke_sessions')}<button
							class="secondary"
							onclick={() =>
								confirm(
									'/revoke-sessions',
									{},
									'Sign out all sessions',
									'End every current session for this person. They can sign in again if their account is enabled.'
								)}>Sign out all sessions</button
						>{/if}
				</div>
			</section>
			<section>
				<div class="section-heading">
					<h3>Department memberships</h3>
					{#if selected.actions.includes('set_membership')}<button
							class="secondary"
							disabled={selected.status === 'disabled'}
							onclick={membership}>Set membership</button
						>{/if}
				</div>
				{#if selected.memberships.length}<ul class="records">
						{#each selected.memberships as member (member.entity_id)}<li>
								<strong>{member.entity_name}</strong>
								<p>{member.department_name}</p>
								<small
									>{!member.active
										? 'Membership disabled'
										: member.scope_active
											? 'Membership enabled'
											: 'Company or department inactive'}</small
								>{#if selected.actions.includes('set_membership')}<button
										class="secondary"
										disabled={!member.active && selected.status === 'disabled'}
										onclick={() =>
											confirm(
												'/memberships/' + member.entity_id + '/state',
												{ active: !member.active },
												member.active ? 'Disable membership' : 'Enable membership',
												'Update this company membership. Historical records are preserved; retained appointments may become effective again when membership is enabled.'
											)}>{member.active ? 'Disable membership' : 'Enable membership'}</button
									>{/if}
							</li>{/each}
					</ul>{:else}<p>No company or department membership assigned.</p>{/if}
			</section>
			<section>
				<div class="section-heading">
					<h3>Office appointments</h3>
					{#if selected.actions.includes('assign_office')}<button
							class="secondary"
							onclick={appointment}>Assign office</button
						>{/if}
				</div>
				<p class="hint">
					An appointment only grants authority while the account, company and membership are active
					and its dates are valid. Administration alone grants no approval authority.
				</p>
				{#if selected.offices.length}<ul class="records">
						{#each selected.offices as held (held.id)}<li>
								<strong>{roles[held.role] ?? held.role}</strong>
								<p>{companyName(held.entity_id)}</p>
								<small
									>{held.active ? 'Appointment retained' : 'Revoked'} · {lagos(held.valid_from)} to {lagos(
										held.valid_until
									)}</small
								>
								<p class="reference">Reference: {held.authorisation_reference}</p>
								{#if held.active && selected.actions.includes('revoke_office')}<button
										class="secondary"
										onclick={() =>
											confirm(
												'/offices/' + held.id + '/revoke',
												{},
												'Revoke appointment',
												'End this appointment. Its original dates and historical decisions remain recorded.'
											)}>Revoke appointment</button
									>{/if}
							</li>{/each}
					</ul>{:else}<p>No office appointments recorded.</p>{/if}
			</section>
		</div>
	{:else if mode !== 'detail'}
		<form class="stack" onsubmit={save} aria-busy={busy}>
			{#if mode === 'invite'}<p>
					Invite a named colleague. They choose their own password; no company membership or
					approval authority is granted automatically.
				</p>
				<label
					>Full name<input
						bind:value={name}
						required
						minlength="2"
						maxlength="180"
						autocomplete="name"
					/></label
				><label
					>Work email<input
						bind:value={email}
						required
						type="email"
						maxlength="254"
						autocomplete="email"
					/></label
				>{#if !data.options.email_enabled}<p class="error" role="alert">
						Email delivery must be enabled before invitations can be sent.
					</p>{/if}
			{:else if mode === 'edit'}<label
					>Full name<input
						bind:value={name}
						required
						minlength="2"
						maxlength="180"
						autocomplete="name"
					/></label
				>
				<p class="hint">Email and permissions cannot be changed through this form.</p>
			{:else if mode === 'membership'}<p>
					Select the staff member’s company and department. Revoke an existing HOD appointment
					before moving its holder to another department.
				</p>
				{#if !data.options.entities.length}<p class="error" role="alert">
						No active companies are configured. Organisation setup is required before assigning
						membership.
					</p>{/if}<label
					>Company<select bind:value={entity} onchange={() => (department = '')} required
						><option value="" disabled>Select company</option
						>{#each data.options.entities as option (option.id)}<option value={option.id}
								>{option.name}</option
							>{/each}</select
					></label
				><label
					>Department<select bind:value={department} required
						><option value="" disabled>Select department</option
						>{#each availableDepartments as option (option.id)}<option value={option.id}
								>{option.name}</option
							>{/each}</select
					></label
				>{#if entity && !availableDepartments.length}<p>
						No active departments are configured for this company.
					</p>{/if}
			{:else if mode === 'office'}<p>
					Record an authorised appointment. Existing holders must be revoked before replacement.
					Secretary and Chairman must be different people.
				</p>
				{#if !officeMemberships.length}<p class="error" role="alert">
						Assign an active company and department membership first.
					</p>{/if}<label
					>Appointment company<select bind:value={entity} required
						><option value="" disabled>Select company</option
						>{#each officeMemberships as member (member.entity_id)}<option value={member.entity_id}
								>{member.entity_name}</option
							>{/each}</select
					></label
				><label
					>Office<select bind:value={office}
						>{#each Object.entries(roles) as [value, label] (value)}<option {value}>{label}</option
							>{/each}</select
					></label
				>{#if office === 'hod'}<p>
						HOD department: <strong
							>{officeMemberships.find((m) => m.entity_id === entity)?.department_name ??
								'Select an eligible company'}</strong
						>
					</p>{/if}<label
					>Authorisation reference<input
						bind:value={reference}
						required
						minlength="3"
						maxlength="300"
						placeholder="Appointment letter or approved reference"
					/></label
				>
				<div class="grid">
					<label
						>Effective from (Lagos time)<input type="datetime-local" bind:value={starts} /></label
					><label
						>Effective until (Lagos time)<input type="datetime-local" bind:value={ends} /></label
					>
				</div>
				<small
					>Leave the start blank for immediate effect. Leave the end blank for an open-ended
					appointment.</small
				>
			{:else if mode === 'confirm'}<p>{command?.description}</p>
				<strong>{selected?.name}</strong>{/if}
			<div class="actions">
				<button
					type="submit"
					disabled={busy ||
						conflict ||
						(mode === 'invite' && !data.options.email_enabled) ||
						(mode === 'membership' && (!entity || !department)) ||
						(mode === 'office' && !officeMemberships.length)}
					>{busy
						? 'Saving…'
						: mode === 'invite'
							? 'Send invitation'
							: mode === 'edit'
								? 'Save name'
								: mode === 'membership'
									? 'Save membership'
									: mode === 'office'
										? 'Record appointment'
										: 'Confirm'}</button
				>{#if selected}<button class="secondary" type="button" onclick={() => leave('detail')}
						>Back to details</button
					>{/if}
			</div>
		</form>
	{/if}
</dialog>

<style>
	.filters {
		display: grid;
		grid-template-columns: minmax(180px, 1fr) 220px auto;
		align-items: end;
		gap: 16px;
		margin: 28px 0;
	}
	.delivery-note {
		background: var(--surface);
		padding: 16px;
		line-height: 1.6;
		font-size: 14px;
		border-radius: 5px;
	}
	.delivery-note strong {
		display: block;
	}
	.sub {
		display: block;
		margin-top: 4px;
	}
	.email-cell,
	.staff-email,
	.reference {
		overflow-wrap: anywhere;
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		margin-top: 24px;
	}
	dialog {
		position: fixed;
		inset: 0 0 0 auto;
		margin: 0;
		width: min(650px, 100%);
		max-width: 100%;
		height: 100dvh;
		max-height: 100dvh;
		border: 0;
		border-left: 1px solid var(--rule);
		padding: 30px;
		overflow-y: auto;
		color: var(--ink);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 30%);
	}
	.drawer-heading {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 18px;
		margin-bottom: 24px;
	}
	.drawer-heading h2 {
		margin-bottom: 0;
		overflow-wrap: anywhere;
	}
	.drawer-heading .quiet {
		flex-shrink: 0;
	}
	dialog .error {
		margin-bottom: 20px;
	}
	section {
		border-top: 1px solid var(--rule);
		padding-top: 24px;
	}
	.section-heading {
		flex-wrap: wrap;
	}
	.section-heading h3 {
		margin: 0;
	}
	.hint {
		font-size: 13px;
	}
	.records {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 16px;
	}
	.records li {
		padding: 18px;
		border: 1px solid var(--rule);
		border-radius: 5px;
		display: grid;
		gap: 8px;
	}
	.records p {
		margin: 0;
	}
	.records button {
		justify-self: start;
		margin-top: 5px;
	}
	.reference {
		font-size: 13px;
	}
	:global(body:has(dialog.staff-modal[open])) {
		overflow: hidden;
	}
	.records strong {
		overflow-wrap: anywhere;
	}
	@media (max-width: 700px) {
		.filters {
			grid-template-columns: 1fr;
		}
		dialog {
			padding: 24px;
		}
		.pagination {
			flex-wrap: wrap;
		}
	}
	@container content (max-width: 650px) {
		.filters {
			grid-template-columns: minmax(0, 1fr);
		}
		.pagination {
			gap: 16px;
			flex-wrap: wrap;
		}
	}
	@media (max-width: 420px) {
		dialog {
			padding: 20px;
		}
	}
</style>
