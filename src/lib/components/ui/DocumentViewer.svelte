<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import type { AttachmentView } from '#lib/api/schema.js';
	let { file, onClose }: { file: AttachmentView; onClose: () => void } = $props();
	let dialog: HTMLDialogElement;
	let url = $state(''),
		error = $state('');
	const controller = new AbortController();
	onMount(() => {
		dialog.showModal();
		void load();
	});
	onDestroy(() => {
		controller.abort();
		if (url) URL.revokeObjectURL(url);
	});
	async function load() {
		error = '';
		try {
			const response = await fetch('/api/v1/attachments/' + file.id + '/content', {
				credentials: 'same-origin',
				signal: controller.signal
			});
			if (response.status === 401) {
				onClose();
				await goto('/login', { invalidateAll: true });
				return;
			}
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.message ?? 'Unable to open this document.');
			}
			const blob = await response.blob();
			if (!controller.signal.aborted) url = URL.createObjectURL(blob);
		} catch (e) {
			if (!controller.signal.aborted)
				error = e instanceof Error ? e.message : 'Unable to open document.';
		}
	}
</script>

<dialog bind:this={dialog} onclose={onClose} aria-label="Document viewer">
	<h2>{file.filename}</h2>
	{#if error}<p role="alert" class="error">{error}</p>
		<button class="secondary" onclick={load}>Retry</button>
	{:else if !url}<p role="status">Loading private document…</p>
	{:else if file.media_type.startsWith('image/')}<img src={url} alt={file.filename} />
	{:else}<iframe src={url} title={file.filename} sandbox=""></iframe>{/if}
	<div class="actions">
		{#if url}<a class="button secondary" href={url} download={file.filename}>Download</a
			>{/if}<button onclick={() => dialog.close()}>Close document</button>
	</div>
</dialog>

<style>
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
	h2 {
		overflow-wrap: anywhere;
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
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 20px;
	}
</style>
