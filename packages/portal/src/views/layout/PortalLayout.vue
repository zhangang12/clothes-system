<template>
  <div class="portal-layout">
    <van-nav-bar title="I9 供应商门户" right-text="退出" @click-right="logout" />
    <router-view />
    <van-tabbar v-model="active" route>
      <van-tabbar-item icon="orders-o" to="/portal/contracts">合同</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePortalAuthStore } from '../../stores/auth';
const active = ref(0);
const auth = usePortalAuthStore();
const router = useRouter();
function logout() { auth.clearAuth(); router.push('/portal/login'); }
</script>
