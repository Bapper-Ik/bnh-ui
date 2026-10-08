<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { AttachmentPage, AttachmentView, RequestView } from '#lib/api/schema.js';
	let { request, onChanged }: { request: RequestView; onChanged: () => Promise<void> } = $props();
	let files = $state<AttachmentPage | null>(null),
		error = $state(''),
		busy = $state(false);
	let selected = $state<File | null>(null),
		uploadKey = crypto.randomUUID();
	let viewer = $state<HTMLDialogElement>(),
		url = $state(''),
		viewed = $state<AttachmentView | null>(null);
	let version = $state(untrack(() => request.version));
	async function failure(e: unknown) {
		error = e instanceof Error ? e.message : 'Document action failed.';
		if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
			files = null;
			closeViewer();
			if (e.status === 401) await goto('/login', { invalidateAll: true });
		}
	}
	async function load() {
		try {
			files = await api<AttachmentPage>('/requisitions/' + request.id + '/attachments');
			version = files.request_version;
		} catch (e) {
			await failure(e);
		}
	}
	onMount(load);
	onDestroy(() => {
		if (url) URL.revokeObjectURL(url);
	});
	async function upload() {
		if (!selected || busy) return;
		if (files && selected.size > files.max_bytes) {
			error = 'The file exceeds the upload size limit.';
			return;
		}
		busy = true;
		error = '';
		try {
			await api(
				'/requisitions/' +
					request.id +
					'/attachments?' +
					new URLSearchParams({
						filename: selected.name,
						expected_version: String(version),
						upload_key: uploadKey
					}),
				{ method: 'POST', body: selected, headers: { 'Content-Type': selected.type } }
			);
			selected = null;
			uploadKey = crypto.randomUUID();
			await onChanged();
			await load();
		} catch (e) {
			await failure(e);
		} finally {
			busy = false;
		}
	}
	async function remove(file: AttachmentView) {
		if (!window.confirm('Remove this document from the draft?')) return;
		busy = true;
		error = '';
		try {
			await api('/attachments/' + file.id + '?expected_version=' + version, { method: 'DELETE' });
			await onChanged();
			await load();
		} catch (e) {
			await failure(e);
		} finally {
			busy = false;
		}
	}
	function closeViewer() {
		viewer?.close();
		if (url) URL.revokeObjectURL(url);
		url = '';
		viewed = null;
	}
	async function open(file: AttachmentView) {
		busy = true;
		error = '';
		try {
			const response = await fetch('/api/v1/attachments/' + file.id + '/content', {
				credentials: 'same-origin'
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new ApiError(
					response.status,
					body?.code ?? 'REQUEST_FAILED',
					body?.message ?? 'Unable to open document.'
				);
			}
			closeViewer();
			url = URL.createObjectURL(await response.blob());
			viewed = file;
			viewer?.showModal();
		} catch (e) {
			await failure(e);
		} finally {
			busy = false;
		}
	}
</script>

<section class="card stack">
	<h2>Supporting documents</h2>
	{#if files}
		<p>
			PDF, PNG or JPEG · Up to {files.max_bytes / 1024 / 1024} MB each · {files.max_count} documents per
			request.
		</p>
		{#if files.items.length === 0}<p>No supporting documents attached.</p>{/if}
		{#each files.items as file (file.id)}
			<div class="document">
				<div>
					<strong>{file.filename}</strong><small
						>{Math.ceil(file.byte_size / 1024)} KB{file.frozen
							? ' · Submitted evidence'
							: ''}</small
					>
				</div>
				<button class="secondary" disabled={busy} onclick={() => open(file)}
					>View {file.filename}</button
				>
				{#if request.available_actions.includes('edit') && !file.frozen}<button
						class="quiet"
						disabled={busy}
						onclick={() => remove(file)}>Remove {file.filename}</button
					>{/if}
			</div>
		{/each}
		{#if request.available_actions.includes('edit')}
			{#if files.uploads_enabled}
				<label
					>Supporting document<input
						type="file"
						accept="application/pdf,image/png,image/jpeg"
						disabled={busy || !!selected}
						onchange={(e) => {
							selected = e.currentTarget.files?.[0] ?? null;
							uploadKey = crypto.randomUUID();
						}}
					/></label
				>
				<div class="actions">
					<button class="secondary" disabled={busy || !selected} onclick={upload}
						>{busy ? 'Uploading…' : 'Upload document'}</button
					>
					{#if selected}<button
							class="quiet"
							disabled={busy}
							onclick={() => {
								selected = null;
								uploadKey = crypto.randomUUID();
							}}>Choose another file</button
						>{/if}
				</div>
			{:else}<p role="status">
					Document uploads are unavailable until private storage is configured. You can still save
					and submit a request without optional documents.
				</p>{/if}
		{/if}
	{:else}<p>Documents could not be loaded.</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>
		<button
			class="secondary"
			disabled={busy}
			onclick={async () => {
				await onChanged();
				await load();
			}}>Reload documents</button
		>{/if}
</section>
<dialog bind:this={viewer} onclose={closeViewer} aria-label="Document viewer">
	{#if viewed}<h2>{viewed.filename}</h2>
		{#if viewed.media_type.startsWith('image/')}<img
				src={url}
				alt={viewed.filename}
			/>{:else}<iframe src={url} title={viewed.filename} sandbox=""></iframe>{/if}
		<div class="actions">
			<a href={url} download={viewed.filename} class="button secondary">Download</a><button
				onclick={closeViewer}>Close document</button
			>
		</div>
	{/if}
</dialog>

<style>
	.document {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
		border-bottom: 1px solid var(--rule);
		padding-bottom: 12px;
	}
	.document div {
		flex: 1;
		min-width: 120px;
		overflow-wrap: anywhere;
	}
	small {
		display: block;
		margin-top: 6px;
	}
	dialog {
		width: min(800px, 95vw);
		max-height: 90dvh;
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 24px;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	img {
		max-width: 100%;
		max-height: 65vh;
		object-fit: contain;
		display: block;
		margin: 20px auto;
	}
	iframe {
		width: 100%;
		height: 60vh;
		border: 0;
	}
	h2 {
		overflow-wrap: anywhere;
	}
</style>
