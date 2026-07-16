<template>
  <TopProgress />
  <router-view />
</template>

<script setup lang="ts">
// Root component - layout is handled per-route
import TopProgress from './components/TopProgress.vue';
</script>
