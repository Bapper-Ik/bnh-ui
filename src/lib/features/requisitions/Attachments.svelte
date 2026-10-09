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
			files = await api<AttachmentPage>(
				'/requisitions/' +
					request.id +
					'/attachments' +
					(request.viewing_revision ? '?revision=' + request.viewing_revision : '')
			);
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
		if (
			!window.confirm(
				file.frozen
					? 'Exclude this document from the correction? It remains available in earlier signed revisions.'
					: 'Remove this document from the draft?'
			)
		)
			return;
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
		{#if files.access_restricted}<p>
				Document access is restricted. Administrative visibility does not include supporting files.
			</p>{:else if files.items.length === 0}<p>No supporting documents attached.</p>{/if}
		{#each files.items as file (file.id)}
			<div class="document">
				<div class="document-info">
					<span class="document-icon" aria-hidden="true">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
							<path d="M14 3v6h6M8 13h8M8 17h5" />
						</svg>
					</span>
					<div class="document-details">
						<strong class="document-name" title={file.filename}>{file.filename}</strong>
						<small
							>{file.filename.split('.').pop()?.toUpperCase()} · {Math.ceil(file.byte_size / 1024)} KB{file.frozen
								? ' · Submitted evidence'
								: ''}</small
						>
					</div>
				</div>
				<div class="document-actions">
					<button
						type="button"
						class="secondary"
						aria-label={'View ' + file.filename}
						disabled={busy}
						onclick={() => open(file)}
					>
						<svg
							aria-hidden="true"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
						View
					</button>
					{#if request.available_actions.includes('edit')}
						<button
							type="button"
							class="quiet"
							aria-label={'Remove ' + file.filename}
							disabled={busy}
							onclick={() => remove(file)}
						>
							<svg
								aria-hidden="true"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
							</svg>
							Remove
						</button>
					{/if}
				</div>
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
	section {
		min-width: 0;
		grid-template-columns: minmax(0, 1fr);
	}
	.document {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 16px;
		align-items: center;
		border: 1px solid var(--rule);
		border-radius: 6px;
		padding: 12px;
	}
	.document-info {
		display: flex;
		gap: 12px;
		align-items: center;
		min-width: 0;
	}
	.document-icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 40px;
		flex-shrink: 0;
		border-radius: 5px;
		background: var(--surface);
		color: var(--body);
	}
	.document-details {
		min-width: 0;
	}
	.document-name {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		font-weight: 600;
	}
	.document-details small {
		display: block;
		margin-top: 5px;
		font-size: 11px;
		line-height: 1.5;
		color: var(--body);
	}
	.document-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		justify-self: end;
	}
	.document-actions button {
		flex: 0 0 auto;
		width: auto;
		padding: 8px 10px;
		gap: 6px;
		font-size: 12px;
		white-space: nowrap;
	}
	.document-actions button:not(:disabled):hover {
		background: var(--surface);
	}
	@container panel (max-width: 520px) {
		.document {
			grid-template-columns: minmax(0, 1fr);
			gap: 10px;
		}
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
