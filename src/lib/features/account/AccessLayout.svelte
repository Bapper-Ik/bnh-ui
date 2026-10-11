<script lang="ts">
	import type { Snippet } from 'svelte';
	import BrandMark from '#lib/components/ui/BrandMark.svelte';
	import Copyright from '#lib/components/ui/Copyright.svelte';
	let {
		title,
		description = '',
		login = false,
		children
	}: { title: string; description?: string; login?: boolean; children: Snippet } = $props();
</script>

<svelte:head><title>{title} · Custodian</title></svelte:head>
{#snippet brand()}
	<a href="/login" class="brand"
		><BrandMark /><span class="brand-name"
			>Custodian<small>{login ? 'by Brendan Nicholas Holdings' : 'BY BRENDAN'}</small></span
		></a
	>
{/snippet}
<div class="access" class:login>
	{#if !login}<header>
			{@render brand()}<span class="company">Brendan Nicholas Holdings</span>
		</header>{/if}
	<main>
		{#if login}<div class="login-brand">{@render brand()}</div>{/if}
		<div class="intro">
			{#if !login}<p class="eyebrow">BNH STAFF WORKSPACE</p>{/if}
			<h1>{title}</h1>
			{#if description}<p>{description}</p>{/if}
		</div>
		{@render children()}
	</main>
	<footer><Copyright /></footer>
</div>

<style>
	.access {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		padding: 36px 48px;
	}
	header,
	footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
	}
	.brand {
		text-decoration: none;
		display: flex;
		align-items: center;
		gap: 13px;
		font-size: 21px;
		font-weight: 600;
	}
	.brand small {
		display: block;
		font-size: 10px;
		font-weight: 400;
		margin-top: 4px;
	}
	.company {
		font-size: 13px;
		color: var(--body);
	}
	main {
		width: 100%;
		max-width: 430px;
		margin: auto;
		padding: 70px 0 90px;
	}
	.intro {
		margin-bottom: 30px;
	}
	h1 {
		margin: 17px 0 14px;
		font-size: 31px;
	}
	.intro p {
		font-size: 15px;
	}
	footer {
		font-size: 11px;
		color: var(--body);
		border-top: 1px solid var(--rule);
		padding-top: 21px;
	}
	@media (max-width: 600px) {
		.access {
			padding: 25px 24px;
		}
		.company {
			display: none;
		}
		footer {
			flex-direction: column;
			align-items: flex-start;
			gap: 8px;
		}
		main {
			padding: 50px 0;
		}
	}

	@media (max-width: 420px) {
		.access {
			padding: 24px 20px;
		}
		main {
			padding: 36px 0 48px;
		}
		h1 {
			font-size: 28px;
		}
	}

	.login {
		background: var(--surface);
		padding: 48px 24px 24px;
		gap: 40px;
	}
	.login main {
		max-width: 440px;
		padding: 36px;
		background: var(--white);
		border: 1px solid var(--rule);
		border-radius: 16px;
		box-shadow: 0 8px 32px rgb(0 0 0 / 4%);
	}
	.login-brand {
		display: flex;
		justify-content: center;
		margin-bottom: 32px;
	}
	.login .brand {
		gap: 8px;
		font-size: 30px;
		line-height: 1.1;
	}
	.login .brand :global(img) {
		width: 72px;
		height: 72px;
		object-fit: cover;
		transform: translateY(-3px);
	}
	.login .brand-name {
		min-width: 0;
		border-left: 1px solid var(--rule);
		padding-left: 12px;
	}
	.login .brand small {
		font-size: 12px;
		line-height: 1.2;
		margin-top: 6px;
	}
	.login .intro {
		text-align: center;
		margin-bottom: 28px;
	}
	.login h1 {
		font-size: 26px;
		margin: 0;
	}
	.login footer {
		justify-content: center;
		align-items: center;
		text-align: center;
		border: 0;
		padding: 0;
		line-height: 1.6;
		font-size: 12px;
	}
	@media (max-width: 480px) {
		.login {
			padding: 32px 16px 24px;
			gap: 32px;
		}
		.login main {
			padding: 28px 20px;
		}
		.login h1 {
			font-size: 24px;
		}
	}
</style>
