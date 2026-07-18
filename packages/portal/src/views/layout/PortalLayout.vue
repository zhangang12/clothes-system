<template>
  <div class="portal-layout">
    <!-- 详情页自带带返回箭头的导航栏(meta.ownNav),布局这条隐藏,避免双导航叠放 -->
    <van-nav-bar v-if="!route.meta.ownNav" title="DATEX 供应商门户" right-text="退出" @click-right="logout" />
    <router-view />
    <van-tabbar v-model="active" route>
      <van-tabbar-item icon="orders-o" to="/portal/contracts">合同</van-tabbar-item>
      <van-tabbar-item icon="user-o" to="/portal/mine">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { usePortalAuthStore } from '../../stores/auth';
const active = ref(0);
const auth = usePortalAuthStore();
const router = useRouter();
const route = useRoute();
function logout() { auth.clearAuth(); router.push('/portal/login'); }
</script>
