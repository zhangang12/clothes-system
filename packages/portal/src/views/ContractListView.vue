<template>
  <div>
    <van-list>
      <van-cell v-for="c in contracts" :key="c.id" :title="c.contract_no" is-link :to="`/portal/contracts/${c.id}`" />
    </van-list>
    <!-- TODO Phase 5: implement portal contract list with 4-step flow -->
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
const contracts = ref<any[]>([]);
</script>
