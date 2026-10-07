<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, description, children }: { title: string; description: string; children: Snippet } =
		$props();
</script>

<svelte:head><title>{title} · Custodian</title></svelte:head>
<div class="access">
	<header>
		<a href="/login" class="brand"
			><span class="mark">C</span><span>Custodian<small>BY BRENDAN</small></span></a
		><span class="company">Brendan Nicholas Holdings</span>
	</header>
	<main>
		<div class="intro">
			<p class="eyebrow">BNH STAFF WORKSPACE</p>
			<h1>{title}</h1>
			<p>{description}</p>
		</div>
		{@render children()}
	</main>
	<footer>
		<span>Custodian · Requisitions & approvals</span><span>For authorised BNH staff</span>
	</footer>
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
	.mark {
		display: grid;
		place-items: center;
		background: var(--ink);
		color: white;
		width: 43px;
		height: 43px;
		border-radius: 4px;
		font-size: 27px;
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
</style>
