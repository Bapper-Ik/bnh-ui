<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
	import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
	let { blob }: { blob: Blob } = $props();
	let canvas: HTMLCanvasElement;
	let document: PDFDocumentProxy | undefined;
	let loading: PDFDocumentLoadingTask | undefined;
	let page = $state(1),
		pages = $state(0),
		busy = $state(true),
		error = $state(''),
		text = $state('');
	let stopped = false;
	onMount(() => {
		void open();
	});
	onDestroy(() => {
		stopped = true;
		void loading?.destroy();
	});
	async function open() {
		try {
			const pdf = await import('pdfjs-dist');
			if (stopped) return;
			pdf.GlobalWorkerOptions.workerSrc = workerUrl;
			const data = new Uint8Array(await blob.arrayBuffer());
			if (stopped) return;
			loading = pdf.getDocument({ data, useSystemFonts: false });
			document = await loading.promise;
			if (stopped) return;
			pages = document.numPages;
			await draw();
		} catch {
			if (!stopped) {
				error = 'The preview is unavailable. Download the PDF to open it in your reader.';
				busy = false;
			}
		}
	}
	async function draw() {
		if (!document || stopped) return;
		busy = true;
		error = '';
		text = '';
		try {
			const current = await document.getPage(page);
			if (stopped) return;
			const original = current.getViewport({ scale: 1 });
			const scale = Math.min(1500 / original.width, 2000 / original.height);
			const viewport = current.getViewport({ scale });
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			await current.render({ canvas, viewport }).promise;
			const content = await current.getTextContent();
			if (!stopped) text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
		} catch {
			if (!stopped)
				error = 'This page could not be previewed. Download the PDF to open it in your reader.';
		} finally {
			if (!stopped) busy = false;
		}
	}
	function change(delta: number) {
		if (!busy) {
			page += delta;
			void draw();
		}
	}
</script>

<div class="pdf-preview">
	<div class="pages">
		<button class="secondary" disabled={busy || page <= 1} onclick={() => change(-1)}
			>Previous Page</button
		>
		<span aria-live="polite">Page {page} of {pages || '…'}</span>
		<button class="secondary" disabled={busy || page >= pages} onclick={() => change(1)}
			>Next Page</button
		>
	</div>
	{#if busy}<p role="status">Rendering PDF page…</p>{/if}
	{#if error}<p role="alert" class="error">{error}</p>{/if}
	<div
		class="sheet"
		role="img"
		aria-label={`PDF page ${page} of ${pages}`}
		class:hidden={busy || !!error}
	>
		<canvas bind:this={canvas} class:hidden={busy || !!error}></canvas>
	</div>
	{#if text}<details>
			<summary>Page Text</summary>
			<p>{text}</p>
		</details>{/if}
</div>

<style>
	.pages {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
		margin: 16px 0;
	}
	.pages span {
		font-size: 12px;
	}
	.sheet {
		max-height: 60vh;
		overflow: auto;
		background: #f2f2f2;
	}
	canvas {
		display: block;
		width: 100%;
		height: auto;
		background: white;
	}
	.hidden {
		display: none;
	}
	details {
		margin-top: 12px;
	}
	summary {
		cursor: pointer;
	}
	p {
		overflow-wrap: anywhere;
	}
</style>
