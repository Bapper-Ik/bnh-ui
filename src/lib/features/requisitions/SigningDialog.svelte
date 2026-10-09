<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { money } from '#lib/money.js';
	import { api, ApiError } from '#lib/api/client.js';
	import type { BoardIntent, ChallengeView, Intent, Point, RequestView } from '#lib/api/schema.js';
	let {
		request,
		action,
		signingTarget,
		name,
		onComplete,
		onCancel
	}: {
		request: RequestView;
		action: Intent['action'] | BoardIntent['action'];
		signingTarget?: string;
		name: string;
		onComplete: (req: RequestView) => void | Promise<void>;
		onCancel: () => void;
	} = $props();
	let dialog: HTMLDialogElement;
	let canvas = $state<HTMLCanvasElement>();
	let password = $state(''),
		signer = $state(''),
		reason = $state(''),
		error = $state(''),
		busy = $state(false),
		consent = $state(false);
	let strokes = $state<Point[][]>([]);
	let drawing = false;
	let cursor = { x: 0.1, y: 0.5 };
	let keyboardPen = false;
	let challenge = $state<ChallengeView | null>(null);
	let reviewRequired = $state(false);
	let commandKey = crypto.randomUUID();
	let pendingCommand = $state<string | null>(null);
	async function failure(e: unknown) {
		error = e instanceof Error ? e.message : 'Unable to record signature.';
		if (
			e instanceof ApiError &&
			[
				'REVISION_CONFLICT',
				'SIGNATURE_INVALID',
				'ACCESS_DENIED',
				'RESOURCE_NOT_AVAILABLE',
				'AUTHORITY_ASSIGNMENT_BLOCKED',
				'BOARD_SEPARATION_REQUIRED'
			].includes(e.code)
		)
			reviewRequired = true;
		if (e instanceof ApiError && e.status === 401 && e.code !== 'FRESH_AUTHENTICATION_REQUIRED') {
			dialog.close();
			onCancel();
			await goto('/login', { invalidateAll: true });
		}
	}
	onMount(() => {
		dialog.showModal();
	});
	function paint() {
		const surface = canvas;
		if (!surface) return;
		const ctx = surface.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, surface.width, surface.height);
		ctx.strokeStyle = '#1a1a1a';
		ctx.lineWidth = 2;
		ctx.lineCap = 'round';
		for (const stroke of strokes) {
			ctx.beginPath();
			stroke.forEach((p, i) => {
				if (i === 0) ctx.moveTo(p.x * surface.width, p.y * surface.height);
				else ctx.lineTo(p.x * surface.width, p.y * surface.height);
			});
			ctx.stroke();
		}
	}
	function point(event: PointerEvent): Point {
		const rect = canvas!.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
			y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
		};
	}
	function start(event: PointerEvent) {
		if (busy || pendingCommand || strokes.length >= 50) return;
		canvas!.setPointerCapture(event.pointerId);
		drawing = true;
		strokes.push([point(event)]);
		paint();
	}
	function move(event: PointerEvent) {
		if (!busy && !pendingCommand && drawing && strokes.reduce((n, s) => n + s.length, 0) < 4000) {
			strokes.at(-1)!.push(point(event));
			paint();
		}
	}
	function keyboard(event: KeyboardEvent) {
		if (busy || pendingCommand || strokes.reduce((n, s) => n + s.length, 0) >= 4000) return;
		if (event.key === 'Enter') {
			event.preventDefault();
			keyboardPen = !keyboardPen;
			if (keyboardPen && strokes.length < 50) strokes.push([{ ...cursor }]);
		}
		const direction: Record<string, [number, number]> = {
			ArrowLeft: [-0.02, 0],
			ArrowRight: [0.02, 0],
			ArrowUp: [0, -0.04],
			ArrowDown: [0, 0.04]
		};
		if (direction[event.key]) {
			event.preventDefault();
			cursor = {
				x: Math.max(0, Math.min(1, cursor.x + direction[event.key][0])),
				y: Math.max(0, Math.min(1, cursor.y + direction[event.key][1]))
			};
			if (keyboardPen) strokes.at(-1)!.push({ ...cursor });
			paint();
		}
	}
	function reset() {
		if (busy || pendingCommand) return;
		strokes = [];
		keyboardPen = false;
		paint();
		commandKey = crypto.randomUUID();
	}
	async function prepare() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			await api('/auth/reauthenticate', { method: 'POST', body: JSON.stringify({ password }) });
			password = '';
			challenge = await api<ChallengeView>(
				(signingTarget ?? '/requisitions/' + request.id) + '/signing-challenges',
				{
					method: 'POST',
					body: JSON.stringify({ expected_version: request.version, action, reason })
				}
			);
		} catch (e) {
			await failure(e);
		} finally {
			password = '';
			busy = false;
		}
	}
	async function confirm() {
		if (!challenge || busy) return;
		busy = true;
		error = '';
		try {
			pendingCommand ??= JSON.stringify({
				expected_version: request.version,
				action,
				reason,
				challenge_id: challenge.id,
				idempotency_key: commandKey,
				signer_name: signer,
				consent,
				strokes
			});
			const result = await api<RequestView>(
				(signingTarget ?? '/requisitions/' + request.id) + '/actions',
				{
					method: 'POST',
					body: pendingCommand
				}
			);

			dialog.close();
			await onComplete(result);
		} catch (e) {
			if (e instanceof ApiError && e.status < 500) {
				pendingCommand = null;
				commandKey = crypto.randomUUID();
			}
			await failure(e);
		} finally {
			busy = false;
		}
	}
	const labels = {
		submit: 'Submit requisition',
		approve: 'Approve requisition',
		reject: 'Reject requisition',
		return: 'Return for revision',
		board_submit: 'Submit Board record',
		board_confirm: 'Confirm Board decision',
		board_return: 'Return record to Secretary'
	};
</script>

<dialog
	bind:this={dialog}
	oncancel={(event) => {
		if (busy) event.preventDefault();
		else onCancel();
	}}
	aria-label={signingTarget ? 'Sign Board record' : 'Sign requisition'}
>
	<div class="dialog-heading">
		<div>
			<p class="eyebrow">{request.reference}</p>
			<h2>{labels[action]}</h2>
		</div>
		<button
			type="button"
			class="quiet close"
			aria-label="Close signing"
			disabled={busy}
			onclick={() => {
				dialog.close();
				onCancel();
			}}>×</button
		>
	</div>
	{#if !challenge}
		<form
			class="stack"
			onsubmit={(e) => {
				e.preventDefault();
				prepare();
			}}
		>
			<p>Confirm your identity before signing this record.</p>
			{#if action === 'reject' || action === 'return' || action === 'board_return'}<label
					>Reason<textarea bind:value={reason} required maxlength="2000"></textarea></label
				>{/if}
			<label
				>Your password<input
					type="password"
					autocomplete="current-password"
					bind:value={password}
					required
				/></label
			>
			{#if error}<div class="error" role="alert">{error}</div>{/if}
			<button disabled={busy || reviewRequired}
				>{busy ? 'Verifying…' : 'Continue to signature'}</button
			>
		</form>
	{:else}
		<form
			class="stack"
			onsubmit={(e) => {
				e.preventDefault();
				confirm();
			}}
		>
			<p><strong>{money(challenge.total)}</strong> · {challenge.authority?.replaceAll('_', ' ')}</p>
			<p>{challenge.routing_explanation}</p>
			<p>{challenge.statement}</p>
			{#if reason}<p><strong>Reason:</strong> {reason}</p>{/if}
			<fieldset disabled={busy || !!pendingCommand}>
				<label
					>Confirm your full name<input
						bind:value={signer}
						placeholder={name}
						required
						autocomplete="name"
					/></label
				>
				<div>
					<label for="signature">Your signature</label>
					<p id="signature-help" class="help">
						Draw with a mouse, pen or touch. Keyboard: Enter starts or ends a stroke; arrow keys
						move the pen.
					</p>
					<canvas
						id="signature"
						bind:this={canvas}
						width="600"
						height="160"
						tabindex="0"
						aria-label="Draw your signature"
						aria-describedby="signature-help"
						onpointerdown={start}
						onpointermove={move}
						onpointerup={() => (drawing = false)}
						onpointercancel={() => (drawing = false)}
						onkeydown={keyboard}
					></canvas>
					<button type="button" class="quiet" onclick={reset}>Clear signature</button>
				</div>
				<label class="checkbox"
					><input type="checkbox" bind:checked={consent} required /><span
						>I have reviewed this exact record and agree to record my signature for this action.</span
					></label
				>
			</fieldset>
			{#if pendingCommand}<p role="status">Retry will send the same signed instruction.</p>{/if}
			{#if error}<div class="error" role="alert">{error}</div>{/if}
			<button
				disabled={busy ||
					reviewRequired ||
					!consent ||
					strokes.reduce((n, s) => n + s.length, 0) < 3}
				>{busy ? 'Recording…' : labels[action]}</button
			>
		</form>
	{/if}
	{#if reviewRequired}<button
			type="button"
			class="secondary"
			disabled={busy}
			onclick={async () => {
				dialog.close();
				onCancel();
				await invalidateAll();
			}}>Reload request to review again</button
		>{/if}
</dialog>

<style>
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
		display: grid;
		gap: 20px;
	}
	dialog {
		width: min(580px, calc(100vw - 32px));
		border: 1px solid var(--rule);
		border-radius: 10px;
		padding: 30px;
		color: var(--ink);
		max-height: 90dvh;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	.dialog-heading {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 20px;
		margin-bottom: 24px;
	}
	.dialog-heading p {
		margin-bottom: 9px;
	}
	.dialog-heading h2 {
		margin: 0;
	}
	.close {
		padding: 0;
		min-width: 32px;
		font-size: 24px;
	}
	canvas {
		width: 100%;
		height: 160px;
		border: 1px solid var(--rule);
		border-radius: 5px;
		background: var(--surface);
		touch-action: none;
	}
	.help {
		font-size: 12px;
		margin: 8px 0 12px;
	}
	.checkbox {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		font-size: 13px;
		font-weight: 400;
		line-height: 1.5;
	}
	.checkbox input {
		width: 17px;
		height: 17px;
		min-height: 17px;
		margin: 2px 0 0;
	}
	form > p {
		font-size: 14px;
		margin: 0;
	}

	@media (max-width: 420px) {
		dialog {
			padding: 20px;
		}
	}
</style>
