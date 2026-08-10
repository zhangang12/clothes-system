<template>
  <el-dialog
    v-model="visible" :title="title" width="880px" top="4vh" append-to-body destroy-on-close
    class="fp-dialog"
  >
    <div v-loading="loading" class="fp-body">
      <img v-if="kind === 'image'" :src="url" alt="预览" class="fp-img" />
      <!-- PDF 用 iframe 内嵌：浏览器自带阅读器渲染，不触发下载。
           不用 <embed>/<object>：部分国产浏览器对它们的处理仍是「下载」 -->
      <iframe v-else-if="kind === 'pdf'" :src="url" class="fp-frame" title="预览" />
      <el-empty v-else-if="!loading" :description="`这种文件（${extLabel}）没法在页面里预览，请下载后打开`" />
    </div>
    <template #footer>
      <span class="fp-tip">看不清可点「下载」用本机软件打开</span>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :icon="Download" @click="download">下载</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { signedUrl } from '@/utils/secureFile';

/**
 * 应用内文件预览（2026-08-10 King：「供应商上传的发票 能不能直接点开，不要下载？」）
 *
 * 【为什么不能继续用 window.open】后端对 PDF 明明发的是 `Content-Disposition: inline`
 * （已实测响应头无误），但**开新标签页之后是否内联显示完全由浏览器决定**——
 * 国内常见的 360/QQ 浏览器、以及关掉了内置 PDF 阅读器的 Chrome，都会直接落成下载。
 * 而且 `openFile` 是 await 拿签名链接之后才 window.open，**已脱离用户手势，还会被弹窗拦截**。
 * 改成在自己页面里用 iframe/img 渲染，显示与否就不再看浏览器脸色。
 */
const visible = ref(false);
const url = ref('');
const name = ref('');
const loading = ref(false);

const title = computed(() => name.value || '文件预览');
const extOf = (s: string) => (/\.([a-z0-9]+)(?:[?#]|$)/i.exec(s || '')?.[1] ?? '').toLowerCase();
const kind = computed<'image' | 'pdf' | 'other'>(() => {
  const e = extOf(name.value || url.value);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  return 'other';
});
const extLabel = computed(() => extOf(name.value || url.value) || '未知格式');

async function open(raw: string, label?: string) {
  if (!raw) { ElMessage.warning('没有可预览的文件'); return; }
  name.value = label || decodeURIComponent(raw.split('=').pop() || '').split('/').pop() || '';
  visible.value = true;
  loading.value = true;
  try {
    // 敏感附件（发票/水单等落 private/）要换短时签名链接，裸 URL 必 403
    url.value = await signedUrl(raw);
  } catch {
    ElMessage.error('取文件链接失败');
    visible.value = false;
  } finally { loading.value = false; }
}

function download() {
  if (!url.value) return;
  const a = document.createElement('a');
  a.href = url.value;
  a.download = name.value || '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

defineExpose({ open });
</script>

<style scoped>
.fp-body { min-height: 60vh; display: flex; align-items: center; justify-content: center; background: var(--el-fill-color-light); border-radius: 4px; }
.fp-img { max-width: 100%; max-height: 74vh; object-fit: contain; }
.fp-frame { width: 100%; height: 74vh; border: 0; background: #fff; }
.fp-tip { font-size: 12px; color: var(--el-text-color-placeholder); margin-right: auto; margin-left: 6px; }
:deep(.el-dialog__footer) { display: flex; align-items: center; }
</style>
