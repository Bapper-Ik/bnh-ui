<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api/client.js';
	import type { ExportPage, ExportView, RequestView } from '#lib/api/schema.js';
	import { dateTime } from '#lib/money.js';
	import DocumentViewer from '#lib/components/ui/DocumentViewer.svelte';
	let { request, onGenerated }: { request: RequestView; onGenerated: () => void } = $props();
	const revision = $derived(
		request.viewing_revision ?? (request.state === 'DRAFT' ? 0 : request.revision_number)
	);
	let data = $state<ExportPage | null>(null),
		error = $state(''),
		busy = $state(false);
	let includeBoard = $state(false),
		viewing = $state<ExportView | null>(null),
		offset = $state(0);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;
	let command = $state<string | null>(null);
	let seen = new Set<string>();
	const downloads = new SvelteMap<string, ReturnType<typeof setTimeout>>();
	onMount(() => {
		void load();
	});
	onDestroy(() => {
		stopped = true;
		clearTimeout(timer);
		for (const [url, cleanup] of downloads) {
			clearTimeout(cleanup);
			URL.revokeObjectURL(url);
		}
	});
	async function failed(e: unknown) {
		error = e instanceof Error ? e.message : 'Unable to load PDF exports.';
		if (e instanceof ApiError && e.status === 401) await goto('/login', { invalidateAll: true });
	}
	async function load() {
		clearTimeout(timer);
		try {
			const result = await api<ExportPage>(
				`/requisitions/${request.id}/exports?revision=${revision}&limit=5&offset=${offset}`
			);
			if (stopped) return;
			if (result.items.some((item) => item.status === 'ready' && !seen.has(item.id))) onGenerated();
			seen = new Set(result.items.filter((item) => item.status === 'ready').map((item) => item.id));
			data = result;
			error = '';
			if (result.items.some((item) => ['pending', 'running'].includes(item.status)))
				timer = setTimeout(() => {
					void load();
				}, 3000);
		} catch (e) {
			if (!stopped) await failed(e);
		}
	}
	async function generate() {
		if (busy) return;
		busy = true;
		error = '';
		command ??= JSON.stringify({
			expected_version: request.version,
			...(revision ? { revision } : {}),
			include_board: includeBoard,
			idempotency_key: crypto.randomUUID()
		});
		try {
			await api(`/requisitions/${request.id}/exports`, { method: 'POST', body: command });
			command = null;
			offset = 0;
			await load();
		} catch (e) {
			if (e instanceof ApiError && e.status < 500) command = null;
			await failed(e);
		} finally {
			busy = false;
		}
	}
	async function download(item: ExportView) {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const response = await fetch(`/api/v1/exports/${item.id}/content`, {
				credentials: 'same-origin'
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new ApiError(
					response.status,
					body?.code ?? 'REQUEST_FAILED',
					body?.message ?? 'Unable to download this PDF. Please try again.'
				);
			}
			const blob = await response.blob();
			if (stopped) return;
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = item.filename;
			document.body.append(link);
			link.click();
			link.remove();
			downloads.set(
				url,
				setTimeout(() => {
					URL.revokeObjectURL(url);
					downloads.delete(url);
				}, 60000)
			);
		} catch (e) {
			if (!stopped) await failed(e);
		} finally {
			busy = false;
		}
	}
	async function retry(item: ExportView) {
		busy = true;
		try {
			await api(`/exports/${item.id}/retry`, { method: 'POST' });
			await load();
		} catch (e) {
			await failed(e);
		} finally {
			busy = false;
		}
	}
	const errors: Record<string, string> = {
		transfer_details_missing:
			'The approval did not include complete bank details. A signed transfer letter cannot be generated from this approval.',
		fonts_unavailable:
			'The bundled PDF fonts are unavailable. Contact your administrator to repair the backend deployment.',
		unsupported_font_characters:
			'The required fonts cannot display a character in this record. Contact your administrator.',
		private_storage_unavailable: 'Private storage is temporarily unavailable.',
		rendering_failed: 'The PDF could not be generated.',
		export_too_large: 'This record exceeds the PDF export limit.'
	};
</script>

<section class="card" aria-label="PDF Exports">
	<div class="section-heading">
		<h2>Documents</h2>
		<button class="quiet" onclick={load}>Refresh Exports</button>
	</div>
	<p>
		Generate a private copy of {revision ? `signed revision ${revision}` : 'this saved draft'},
		including its recorded decisions. Later changes will require a new export.
	</p>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if !data}{#if !error}<p role="status">Loading exports…</p>{/if}{:else}
		{#if data.unavailable_reason}<p role="status">{data.unavailable_reason}</p>{/if}
		<div class="controls">
			{#if data.can_include_board}<label
					><input type="checkbox" bind:checked={includeBoard} disabled={busy || !!command} /> Include
					Private Board Records</label
				>{/if}
			<button class="secondary" disabled={busy || !!data.unavailable_reason} onclick={generate}
				>{busy ? 'Working…' : 'Generate PDF'}</button
			>
		</div>
		{#if data.items.length === 0}<p>No PDF exports for this revision yet.</p>{/if}
		<ul>
			{#each data.items as item (item.id)}
				<li>
					<div class="file">
						{#if item.document_type === 'bank_transfer'}<span class="document-kind"
								>Signed Bank Transfer Request · Created on Approval</span
							>{/if}
						<strong title={item.filename}>{item.filename}</strong><small
							>{item.status === 'ready' ? 'Generated' : 'Requested'}
							{dateTime(item.generated_at ?? item.created_at)}{item.include_board
								? ' · Private Board records included'
								: ''}</small
						>
						{#if item.status === 'failed'}<p class="error">
								{errors[item.last_error ?? ''] ??
									'Unable to generate this PDF. Please retry or contact your administrator.'}
							</p>{:else if item.status !== 'ready'}<span role="status"
								>{item.status === 'cancelled'
									? 'Export cancelled: access changed.'
									: 'Generating PDF…'}</span
							>{/if}
					</div>
					{#if item.status === 'ready'}<button class="secondary" onclick={() => (viewing = item)}
							>{item.document_type === 'bank_transfer'
								? 'View Transfer Letter'
								: 'View PDF'}</button
						>
						{#if item.document_type === 'bank_transfer'}<button
								class="secondary"
								disabled={busy}
								onclick={() => download(item)}>Download Transfer Letter</button
							>{/if}
					{:else if item.can_retry}<button
							class="secondary"
							disabled={busy || !!data.unavailable_reason}
							onclick={() => retry(item)}>Retry PDF</button
						>{/if}
				</li>
			{/each}
		</ul>
		{#if data.total > 5}<div class="controls">
				<button
					class="quiet"
					disabled={offset === 0}
					onclick={() => {
						offset -= 5;
						void load();
					}}>Previous Exports</button
				><span>{offset + 1}–{Math.min(offset + 5, data.total)} of {data.total}</span><button
					class="quiet"
					disabled={offset + 5 >= data.total}
					onclick={() => {
						offset += 5;
						void load();
					}}>Next Exports</button
				>
			</div>{/if}
	{/if}
</section>
{#if viewing}<DocumentViewer
		file={{ ...viewing, media_type: 'application/pdf', kind: 'export' }}
		onClose={() => (viewing = null)}
	/>{/if}

<style>
	.document-kind {
		display: block;
		font-weight: 600;
		margin-bottom: 8px;
	}
	.controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
		margin: 16px 0;
	}
	label {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	input {
		width: auto;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 16px;
		border-top: 1px solid var(--rule);
		padding: 16px 0;
	}
	.file {
		flex: 1;
		min-width: 0;
	}
	strong {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	small {
		display: block;
		margin-top: 6px;
	}
	button {
		flex-shrink: 0;
	}
	@media (max-width: 520px) {
		li {
			flex-wrap: wrap;
		}
		.file {
			flex-basis: 100%;
		}
	}
</style>
