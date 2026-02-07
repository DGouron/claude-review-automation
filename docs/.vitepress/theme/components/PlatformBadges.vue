<script setup lang="ts">
const platforms = ["GitLab", "GitHub", "Claude Code", "Node.js"];
</script>

<template>
	<section class="platforms-section">
		<h2 class="platforms-heading">Works With Your Stack</h2>
		<div class="badge-row">
			<span v-for="platform in platforms" :key="platform" class="badge">
				{{ platform }}
			</span>
		</div>
	</section>
</template>

<style scoped>
.platforms-section {
	padding: 3rem 1.5rem 5rem;
	text-align: center;
}

.platforms-heading {
	font-size: 1.5rem;
	font-weight: 600;
	margin-bottom: 2rem;
	color: var(--vp-c-text-2);
}

.badge-row {
	display: flex;
	justify-content: center;
	gap: 1rem;
	flex-wrap: wrap;
}

.badge {
	padding: 0.5rem 1.25rem;
	border-radius: 9999px;
	border: 1px solid var(--vp-c-divider);
	background: var(--vp-c-bg-soft);
	color: var(--vp-c-text-1);
	font-size: 0.9rem;
	font-weight: 500;
}
</style>
