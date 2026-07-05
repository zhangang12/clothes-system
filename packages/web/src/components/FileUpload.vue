<template>
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

  <el-dialog v-model="previewVisible" width="640px" append-to-body>
    <img :src="previewUrl" style="width:100%" alt="预览" />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Upload } from '@element-plus/icons-vue';
import { http } from '@/api';

const props = withDefaults(defineProps<{
  modelValue?: string;
  multiple?: boolean;
  accept?: string;
  limit?: number;
  listType?: 'picture-card' | 'text' | 'picture';
  disabled?: boolean;
  tip?: string;
}>(), {
  modelValue: '', multiple: false, accept: 'image/*', limit: 6, listType: 'picture-card', disabled: false, tip: '',
});
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const effectiveLimit = computed(() => (props.multiple ? props.limit : 1));
const urls = () => (props.modelValue ? props.modelValue.split(',').filter(Boolean) : []);
const toList = () => urls().map((u, i) => ({ name: decodeURIComponent(u.split('=').pop() || `文件${i + 1}`).split('/').pop() || `文件${i + 1}`, url: u }));
const fileList = ref<any[]>(toList());
watch(() => props.modelValue, () => { fileList.value = toList(); });

const previewVisible = ref(false);
const previewUrl = ref('');

async function doUpload(opt: any) {
  const fd = new FormData();
  fd.append('file', opt.file);
  try {
    const res: any = await http.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
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
function onRemove(file: any) {
  emit('update:modelValue', urls().filter((u) => u !== file.url).join(','));
}
function onPreview(file: any) {
  if (/\.(pdf|docx?|xlsx?)$/i.test(file.url) || file.url.includes('.pdf')) { window.open(file.url, '_blank'); return; }
  previewUrl.value = file.url;
  previewVisible.value = true;
}
function onExceed() { ElMessage.warning(`最多上传 ${effectiveLimit.value} 个文件`); }
</script>

<style scoped>
.file-upload :deep(.el-upload--picture-card),
.file-upload :deep(.el-upload-list--picture-card .el-upload-list__item) { width: 88px; height: 88px; }
.up-tip { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
