<template>
  <div class="fu-wrap" tabindex="0" @paste="onPaste" @dragover.prevent @drop.prevent="onDrop">
  <el-upload
    action="#"
    :file-list="fileList"
    :list-type="listType"
    :accept="accept"
    :limit="effectiveLimit"
    :multiple="multiple"
    :http-request="doUpload"
    :on-remove="onRemove"
    :on-preview="onPreview"
    :on-exceed="onExceed"
    :disabled="disabled"
    class="file-upload"
  >
    <template v-if="!disabled && listType === 'picture-card'">
      <el-icon><Plus /></el-icon>
    </template>
    <el-button v-else-if="!disabled" size="small" :icon="Upload">上传</el-button>
    <template v-if="tip" #tip><div class="up-tip">{{ tip }}</div></template>
  </el-upload>

  <div v-if="!disabled" class="fu-hint">支持拖入文件 / 聚焦后 Ctrl+V 粘贴截图</div>
  </div>

  <el-dialog v-model="previewVisible" width="640px" append-to-body>
    <img :src="previewUrl" style="width:100%" alt="预览" />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Upload } from '@element-plus/icons-vue';
import { http } from '@/api';
import { signedUrl } from '@/utils/secureFile';

const props = withDefaults(defineProps<{
  modelValue?: string;
  multiple?: boolean;
  accept?: string;
  limit?: number;
  listType?: 'picture-card' | 'text' | 'picture';
  disabled?: boolean;
  tip?: string;
  sensitive?: boolean; // 敏感附件(身份证/水单/发票):存 private/ 子目录,读取须签名令牌
}>(), {
  modelValue: '', multiple: false, accept: 'image/*', limit: 6, listType: 'picture-card', disabled: false, tip: '', sensitive: false,
});
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const effectiveLimit = computed(() => (props.multiple ? props.limit : 1));
const urls = () => (props.modelValue ? props.modelValue.split(',').filter(Boolean) : []);
const toList = () => urls().map((u, i) => ({ name: decodeURIComponent(u.split('=').pop() || `文件${i + 1}`).split('/').pop() || `文件${i + 1}`, url: u }));
const fileList = ref<any[]>([]);
// 敏感附件缩略图/预览用短时签名链接展示;v-model 始终存原始 URL(令牌会过期,不入库)
async function rebuildList() {
  const list = toList().map((it) => ({ ...it, raw: it.url }));
  for (const it of list) it.url = await signedUrl(it.raw);
  fileList.value = list;
}
watch(() => props.modelValue, rebuildList, { immediate: true });

const previewVisible = ref(false);
const previewUrl = ref('');

// 粘贴截图 / 拖拽文件 → 复用同一上传通道(设计稿:①点选 ②Ctrl+V 粘贴 ③拖文件)
function onPaste(e: ClipboardEvent) {
  if (props.disabled) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const it of items) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f) { e.preventDefault(); doUpload({ file: f }); }
    }
  }
}
function onDrop(e: DragEvent) {
  if (props.disabled) return;
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  const max = effectiveLimit.value - urls().length;
  Array.from(files).slice(0, Math.max(max, 0)).forEach((f) => doUpload({ file: f }));
}

async function doUpload(opt: any) {
  const fd = new FormData();
  fd.append('file', opt.file);
  try {
    const res: any = await http.post(props.sensitive ? '/uploads?sensitive=1' : '/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    const url = res.data?.url ?? res.url;
    const next = props.multiple ? [...urls(), url] : [url];
    emit('update:modelValue', next.join(','));
    opt.onSuccess?.(res);
    ElMessage.success('上传成功');
  } catch (e: any) {
    opt.onError?.(e);
    ElMessage.error(e?.response?.data?.msg ?? '上传失败');
  }
}
// el-upload 内部对新增项也用 raw 存原生 File,故仅认字符串型 raw(我们回填的原始 URL)
const origUrlOf = (file: any) => (typeof file.raw === 'string' ? file.raw : file.url);
function onRemove(file: any) {
  const orig = origUrlOf(file);
  emit('update:modelValue', urls().filter((u) => u !== orig).join(','));
}
async function onPreview(file: any) {
  const url = await signedUrl(origUrlOf(file)); // 敏感附件换新令牌,防列表停留过久令牌过期
  if (/\.(pdf|docx?|xlsx?)$/i.test(url) || url.includes('.pdf')) { window.open(url, '_blank'); return; }
  previewUrl.value = url;
  previewVisible.value = true;
}
function onExceed() { ElMessage.warning(`最多上传 ${effectiveLimit.value} 个文件`); }
</script>

<style scoped>
.file-upload :deep(.el-upload--picture-card),
.file-upload :deep(.el-upload-list--picture-card .el-upload-list__item) { width: 88px; height: 88px; }
.up-tip { font-size: 12px; color: var(--el-text-color-secondary); }
.fu-wrap { outline: none; }
.fu-hint { font-size: 11px; color: var(--el-text-color-placeholder); margin-top: 2px; }
</style>
