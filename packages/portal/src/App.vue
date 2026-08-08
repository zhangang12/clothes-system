<template>
  <router-view />
  <!-- 全局反馈泡泡（2026-08-08 反馈：「供应商门户没有反馈问题小泡泡，要加」）。
       挂在根组件上，各页面不用各自引；未登录/登录页自动隐藏 -->
  <FeedbackBubble />
</template>

<script setup lang="ts">
import FeedbackBubble from './components/FeedbackBubble.vue';
</script>
