<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { AccountProfile, SessionPage } from '#lib/api/schema.js';
	import { dateTime } from '#lib/money.js';
	let profile = $state<AccountProfile | null>(null),
		sessions = $state<SessionPage | null>(null);
	let busy = $state(false),
		error = $state(''),
		success = $state(''),
		offset = $state(0);
	let currentPassword = $state(''),
		newPassword = $state(''),
		confirmation = $state('');
	let pending = $state<{ path: string; message: string; exit: boolean } | null>(null);
	let dialog: HTMLDialogElement;
	let stopped = false;
	const controller = new AbortController();
	function clearPasswords() {
		currentPassword = '';
		newPassword = '';
		confirmation = '';
	}
	async function handleError(e: unknown) {
		if (stopped) return;
		error = e instanceof Error ? e.message : 'Unable to update your account.';
		if (e instanceof ApiError && e.status === 401) {
			profile = null;
			sessions = null;
			clearPasswords();
			await goto('/login', { invalidateAll: true });
		}
	}
	async function load() {
		const [p, s] = await Promise.all([
			api<AccountProfile>('/auth/profile', { signal: controller.signal }),
			api<SessionPage>('/auth/sessions?limit=20&offset=' + offset, { signal: controller.signal })
		]);
		if (!stopped) {
			profile = p;
			sessions = s;
		}
	}
	async function refresh(nextOffset = offset) {
		if (busy || stopped) return;
		busy = true;
		error = '';
		offset = nextOffset;
		try {
			await load();
		} catch (e) {
			profile = null;
			sessions = null;
			clearPasswords();
			await handleError(e);
		} finally {
			busy = false;
		}
	}
	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		error = '';
		success = '';
		if (newPassword !== confirmation) {
			error = 'The new passwords do not match.';
			return;
		}
		if (newPassword === currentPassword) {
			error = 'Choose a different new password.';
			return;
		}
		busy = true;
		try {
			await api('/auth/password', {
				method: 'POST',
				body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
			});
			clearPasswords();
			profile = null;
			sessions = null;
			await goto('/login?reason=password-changed', { invalidateAll: true });
		} catch (e) {
			await handleError(e);
		} finally {
			clearPasswords();
			busy = false;
		}
	}
	async function revoke() {
		if (!pending || busy) return;
		const action = pending;
		pending = null;
		dialog.close();
		busy = true;
		error = '';
		success = '';
		try {
			await api(action.path, { method: 'POST' });
			if (action.exit) {
				clearPasswords();
				profile = null;
				sessions = null;
				await goto('/login?reason=signed-out', { invalidateAll: true });
			} else {
				success = 'Selected sessions have been signed out.';
				offset = 0;
				await load();
			}
		} catch (e) {
			sessions = null;
			await handleError(e);
		} finally {
			busy = false;
		}
	}
	function ask(path: string, message: string, exit = false) {
		pending = { path, message, exit };
		dialog.showModal();
	}
	const roles: Record<string, string> = {
		hod: 'Head of Department',
		chief_of_staff: 'Chief of Staff',
		md: 'Managing Director',
		secretary: 'Company Secretary',
		chairman: 'Board Chairman'
	};
	onMount(() => {
		void refresh();
		const focus = () => {
			if (document.visibilityState === 'visible' && !pending) void refresh();
		};
		window.addEventListener('focus', focus);
		return () => window.removeEventListener('focus', focus);
	});
	onDestroy(() => {
		stopped = true;
		controller.abort();
		clearPasswords();
	});
</script>

<svelte:head><title>My Account &amp; Security · Custodian</title></svelte:head>
<div class="page-header">
	<div>
		<p class="eyebrow">YOUR ACCOUNT</p>
		<h1>My Account &amp; Security</h1>
		<p>Review your account details and manage access to your account.</p>
	</div>
	<button class="secondary" disabled={busy} onclick={() => refresh()}>Refresh account</button>
</div>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if success}<p role="status">{success}</p>{/if}
{#if busy && !profile}<p role="status">Loading your account…</p>{/if}
{#if profile}
	<div class="account-grid">
		<section class="card" aria-label="Account details">
			<h2>Account details</h2>
			<dl>
				<dt>Full name</dt>
				<dd>{profile.name}</dd>
				<dt>Work email</dt>
				<dd>{profile.email}</dd>
				<dt>Account access</dt>
				<dd>{profile.read_only ? 'Read-only workspace' : 'Staff workspace'}</dd>
			</dl>
			<h3>Company and department</h3>
			{#if !profile.memberships.length}<p>No company membership is assigned.</p>{/if}
			<ul>
				{#each profile.memberships as membership (membership.company)}<li>
						<strong>{membership.company}</strong>
						<p>{membership.department} · {membership.active ? 'Active' : 'Inactive'}</p>
					</li>{/each}
			</ul>
			<h3>Current office appointments</h3>
			{#if !profile.offices.length}<p>No active office appointment.</p>{/if}
			<ul>
				{#each profile.offices as office, index (index)}<li>
						{roles[office.role] ?? office.role}
						<p>{office.company}</p>
					</li>{/each}
			</ul>
			<p class="note">
				Contact your administrator to correct your details, department or office appointment.
			</p>
		</section>
		<section class="card" aria-label="Change password">
			<h2>Change password</h2>
			<p>
				Use at least 12 characters. Changing your password signs you out on every device and cancels
				outstanding password-reset links.
			</p>
			<form onsubmit={changePassword}>
				<label for="current-password">Current password</label><input
					id="current-password"
					type="password"
					autocomplete="current-password"
					maxlength="1024"
					required
					bind:value={currentPassword}
					disabled={busy}
				/>
				<label for="new-password">New password</label><input
					id="new-password"
					type="password"
					autocomplete="new-password"
					minlength="12"
					maxlength="1024"
					required
					bind:value={newPassword}
					disabled={busy}
				/>
				<label for="confirm-password">Confirm new password</label><input
					id="confirm-password"
					type="password"
					autocomplete="new-password"
					minlength="12"
					maxlength="1024"
					required
					bind:value={confirmation}
					disabled={busy}
				/>
				<button disabled={busy}>Change password and sign out</button>
			</form>
		</section>
	</div>
	<section class="card sessions" aria-label="Active sessions">
		<div class="session-heading">
			<div>
				<h2>Active sessions</h2>
				<p>
					Sessions remain active until they expire or are signed out. Times are shown in Lagos time
					(WAT).
				</p>
			</div>
			<div class="actions">
				<button
					class="secondary"
					disabled={busy || !sessions || sessions.total < 2}
					onclick={() =>
						ask(
							'/auth/sessions/revoke-others',
							'Sign out all other sessions? This session will stay active.'
						)}>Sign out other sessions</button
				><button
					class="secondary"
					disabled={busy}
					onclick={() =>
						ask('/auth/sessions/revoke', 'Sign out every session, including this one?', true)}
					>Sign out all sessions</button
				>
			</div>
		</div>
		{#if sessions}<p>{sessions.total} active {sessions.total === 1 ? 'session' : 'sessions'}</p>
			<ul>
				{#each sessions.items as session (session.id)}<li class="session">
						<div>
							<strong>{session.current ? 'This session' : 'Other session'}</strong>
							<p>Signed in {dateTime(session.created_at)}</p>
							<p>Expires {dateTime(session.expires_at)}</p>
						</div>
						<button
							class="secondary"
							disabled={busy}
							aria-label={session.current
								? 'Sign out this session'
								: 'Sign out session from ' + dateTime(session.created_at)}
							onclick={() =>
								ask(
									'/auth/sessions/' + session.id + '/revoke',
									session.current
										? 'Sign out this session?'
										: 'Sign out this session on the other device?',
									session.current
								)}>Sign out session</button
						>
					</li>{/each}
			</ul>
			{#if sessions.total > 20}<div class="actions">
					<button
						class="secondary"
						disabled={busy || offset === 0}
						onclick={() => refresh(Math.max(0, offset - 20))}>Previous sessions</button
					><span>{offset + 1}–{Math.min(offset + 20, sessions.total)} of {sessions.total}</span
					><button
						class="secondary"
						disabled={busy || offset + 20 >= sessions.total}
						onclick={() => refresh(offset + 20)}>Next sessions</button
					>
				</div>{/if}{:else}<p>Use Refresh account to reload the session list.</p>{/if}
	</section>
{/if}
<dialog
	bind:this={dialog}
	aria-labelledby="session-confirm-title"
	oncancel={() => {
		pending = null;
	}}
>
	<h2 id="session-confirm-title">Confirm sign out</h2>
	<p>{pending?.message}</p>
	<div class="actions">
		<button
			class="secondary"
			onclick={() => {
				pending = null;
				dialog.close();
			}}>Cancel</button
		><button onclick={revoke}>Confirm sign out</button>
	</div>
</dialog>

<style>
	.account-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 24px;
		align-items: start;
	}
	dl {
		margin: 24px 0;
	}
	dt {
		font-size: 12px;
		color: var(--body);
		margin-top: 18px;
	}
	dd {
		margin: 6px 0 0;
		overflow-wrap: anywhere;
	}
	h3 {
		font-size: 15px;
		margin: 24px 0 12px;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		border-top: 1px solid var(--rule);
		padding: 14px 0;
	}
	li p {
		margin: 6px 0;
		font-size: 14px;
	}
	.note {
		font-size: 13px;
		color: var(--body);
		margin-top: 24px;
	}
	form {
		display: grid;
		gap: 10px;
		margin-top: 24px;
	}
	form label:not(:first-child) {
		margin-top: 10px;
	}
	form button {
		justify-self: start;
		margin-top: 14px;
	}
	.sessions {
		margin-top: 24px;
	}
	.session-heading {
		display: flex;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
	}
	.actions {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		align-items: center;
	}
	.session {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
	}
	.session button {
		flex-shrink: 0;
	}
	dialog {
		width: min(480px, calc(100% - 32px));
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 28px;
		color: var(--ink);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 35%);
	}
	@media (max-width: 850px) {
		.account-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 550px) {
		.session {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
