<template>
  <div
    class="top-progress"
    :style="{ transform: `scaleX(${width / 100})`, opacity: show ? 1 : 0 }"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { progress, progressStart, progressDone } from '../utils/progress';

// 顶部细进度条：路由跳转 + 在途请求驱动。仿 nprogress 的「先冲到一半、
// 慢慢逼近 90%、完成瞬间打满再淡出」，让等待有反馈而不虚报完成。
const width = ref(0);
const show = ref(false);
let timer: number | undefined;

const pending = computed(() => progress.pending);

function start() {
  window.clearInterval(timer);
  show.value = true;
  width.value = Math.max(width.value, 10);
  timer = window.setInterval(() => {
    width.value = Math.min(90, width.value + Math.max(0.4, (90 - width.value) * 0.06));
  }, 160);
}

function finish() {
  window.clearInterval(timer);
  width.value = 100;
  window.setTimeout(() => {
    if (progress.pending > 0) return; // 淡出前又来了新请求，交给下一轮 start
    show.value = false;
    window.setTimeout(() => { if (!show.value) width.value = 0; }, 260);
  }, 180);
}

watch(pending, (n) => {
  if (n > 0 && (!show.value || width.value >= 100)) start();
  else if (n === 0 && show.value) finish();
});

// 路由跳转也计入（懒加载路由的 chunk 下载正好被覆盖到）
const router = useRouter();
router.beforeEach(() => { progressStart(); });
router.afterEach(() => { progressDone(); });
router.onError(() => { progressDone(); });

onBeforeUnmount(() => window.clearInterval(timer));
</script>

<style scoped>
.top-progress {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 3px;
  z-index: 9999;
  pointer-events: none;
  transform-origin: 0 0;
  background: linear-gradient(90deg, var(--rust), #E8A26D);
  box-shadow: 0 0 8px rgba(209, 122, 64, 0.45);
  transition: transform 0.18s ease, opacity 0.25s ease;
}
</style>
