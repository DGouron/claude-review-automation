<script setup lang="ts">
import FeatureGrid from "./FeatureGrid.vue";
import HeroSection from "./HeroSection.vue";
import PlatformBadges from "./PlatformBadges.vue";
import QuickStart from "./QuickStart.vue";
</script>

<template>
	<div class="home-page">
		<HeroSection />
		<FeatureGrid />
		<QuickStart />
		<PlatformBadges />
	</div>
</template>

<style scoped>
.home-page {
	min-height: 100vh;
}
</style>
