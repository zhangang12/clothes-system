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

  <div v-if="!disabled" class="fu-hint">支持拖入文件 / Ctrl+V 粘贴截图 · 大图自动压缩后上传</div>
  </div>

  <el-dialog v-model="previewVisible" :width="previewKind === 'sheet' ? '90%' : '640px'" append-to-body :title="previewKind === 'sheet' ? previewFile?.name : ''">
    <img v-if="previewKind === 'image'" :src="previewUrl" style="width:100%" alt="预览" />

    <!-- Excel 预览：多工作表分页签，超大表截断 -->
    <div v-else-if="previewKind === 'sheet'" v-loading="sheetLoading" class="sheet-wrap">
      <el-tabs v-if="sheets.length > 1" v-model="activeSheet">
        <el-tab-pane v-for="(s, i) in sheets" :key="i" :label="s.name" :name="String(i)" />
      </el-tabs>
      <div v-if="curSheet" class="sheet-scroll">
        <table class="sheet">
          <tbody>
            <tr v-for="(row, ri) in curSheet.rows" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci" :class="{ head: ri === 0 }">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="curSheet?.truncated" class="sheet-tip">表格较大，仅预览前 200 行；完整内容请下载。</p>
    </div>

    <template #footer>
      <el-button v-if="previewFile" @click="download(previewFile)">下载</el-button>
      <el-button type="primary" @click="previewVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Upload } from '@element-plus/icons-vue';
import { http } from '@/api';
import { signedUrl } from '@/utils/secureFile';
import { parseXlsx, isXlsxName, isLegacyXlsName, type SheetData } from '@/utils/sheetPreview';
import { compressImage } from '@/utils/imageCompress';

// 全局粘贴登记表：页面上可能同时有多个上传框（样衣图片1/2/3），document 上只挂一个监听，
// 由这里决定交给谁。**从后往前找**——后挂载的在视觉上更靠前（弹窗 > 页面表单），
// 谁"没满"谁接；都满了才提示。这样反馈弹窗一开就自然接管粘贴，关掉又还给页面表单，
// 不会出现"粘贴到反馈弹窗、图却传进了样衣表单"这种串台（原来的 globalPaste 注释担心的正是它）。
const pasteStack: Array<(e: ClipboardEvent) => void> = [];
let pasteBound = false;
function dispatchPaste(e: ClipboardEvent) {
  for (let i = pasteStack.length - 1; i >= 0; i--) {
    pasteStack[i](e);
    if ((e as any)._fuHandled) return;
  }
}

const props = withDefaults(defineProps<{
  modelValue?: string;
  multiple?: boolean;
  accept?: string;
  limit?: number;
  listType?: 'picture-card' | 'text' | 'picture';
  disabled?: boolean;
  tip?: string;
  sensitive?: boolean; // 敏感附件(身份证/水单/发票):存 private/ 子目录,读取须签名令牌
  globalPaste?: boolean; // 【已无实际作用，保留只为不改调用方】2026-08-07 起所有实例都参与全局粘贴，
                         // 由 pasteStack「后挂载优先 + 满了让给下一个」派发，不再需要逐处开关。
}>(), {
  modelValue: '', multiple: false, accept: 'image/*', limit: 6, listType: 'picture-card', disabled: false, tip: '', sensitive: false, globalPaste: false,
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
const previewFile = ref<any>(null);
// Excel 预览
const previewKind = ref<'image' | 'sheet'>('image');
const sheets = ref<SheetData[]>([]);
const activeSheet = ref('0');
const sheetLoading = ref(false);
const curSheet = computed(() => sheets.value[Number(activeSheet.value)] ?? null);

// 粘贴截图 / 拖拽文件 → 复用同一上传通道(设计稿:①点选 ②Ctrl+V 粘贴 ③拖文件)
function onPaste(e: ClipboardEvent) {
  if (props.disabled) return;
  // wrap 的 @paste 与 document 监听会对同一事件各触发一次(冒泡),用标记去重防重复上传
  if ((e as any)._fuHandled) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  // 只接"文件型"剪贴板内容：粘贴纯文本一律不拦，输入框里的 Ctrl+V 行为不受影响
  const files = Array.from(items)
    .filter((it) => it.kind === 'file')
    .map((it) => it.getAsFile())
    .filter(Boolean) as File[];
  if (!files.length) return;
  let room = effectiveLimit.value - urls().length;
  if (room <= 0) return; // 本框已满：不吃这次粘贴，交给栈里下一个（原来会在这弹警告并中断，多个上传框会连弹好几条）
  (e as any)._fuHandled = true;
  e.preventDefault();
  for (const f of files) {
    if (room <= 0) { ElMessage.warning(`最多上传 ${effectiveLimit.value} 个文件`); break; }
    room -= 1;
    doUpload({ file: f });
  }
}
// 粘贴不再要求先点一下上传框（Grace 反馈：反馈弹窗里能直接 Ctrl+V，样衣表单却要先聚焦）。
// 所有实例都进 pasteStack，由 document 上的单个监听按"后挂载优先"派发，见文件顶部说明。
onMounted(() => {
  pasteStack.push(onPaste);
  if (!pasteBound) { document.addEventListener('paste', dispatchPaste); pasteBound = true; }
});
onBeforeUnmount(() => {
  const i = pasteStack.indexOf(onPaste);
  if (i >= 0) pasteStack.splice(i, 1);
});
function onDrop(e: DragEvent) {
  if (props.disabled) return;
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  const max = effectiveLimit.value - urls().length;
  Array.from(files).slice(0, Math.max(max, 0)).forEach((f) => doUpload({ file: f }));
}

async function doUpload(opt: any) {
  const fd = new FormData();
  // 大图先在浏览器里压小再传（Grace 反馈上传要等 1-2 分钟；实测服务器侧 2MB 只要 2.9s，
  // 瓶颈是整张手机原图走用户上行带宽）。压不动/不该压时 compressImage 原样返回。
  const file = await compressImage(opt.file);
  fd.append('file', file);
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
const isImageName = (name?: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || '');
const isPdfName = (name?: string) => /\.pdf$/i.test(name || '');
// 下载文件:同源 /uploads,<a download> 可强制下载;敏感附件走签名链接
async function download(file: any) {
  const a = document.createElement('a');
  a.href = await signedUrl(origUrlOf(file));
  a.download = file?.name || '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function onPreview(file: any) {
  // 用户反馈「上传的资料不能线上看，必须存到桌面才能打开」：原先只有图片能预览，
  // PDF、Excel 都被当附件强制下载。按文件名判类型（URL 带查询串，靠 URL 尾巴认扩展名不准）：
  //   图片  → 弹窗；PDF → 浏览器直接开（后端本就发 inline）；
  //   .xlsx → 取回解析成表格弹窗；.xls(BIFF 老格式) / Word 等 → 只能下载。
  const url = await signedUrl(origUrlOf(file)); // 敏感附件换新令牌，防列表停留过久令牌过期
  previewFile.value = file;

  if (isImageName(file.name)) {
    previewKind.value = 'image';
    previewUrl.value = url;
    previewVisible.value = true;
    return;
  }
  if (isPdfName(file.name)) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  if (isXlsxName(file.name)) {
    previewKind.value = 'sheet';
    sheets.value = [];
    activeSheet.value = '0';
    previewVisible.value = true;
    sheetLoading.value = true;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`读取失败（HTTP ${res.status}）`);
      sheets.value = await parseXlsx(await res.arrayBuffer());
    } catch (e: any) {
      previewVisible.value = false;
      ElMessage.warning(`${e?.message || '预览失败'}，已改为下载`);
      await download(file);
    } finally {
      sheetLoading.value = false;
    }
    return;
  }
  if (isLegacyXlsName(file.name)) ElMessage.info('.xls 老格式不支持在线预览，已下载');
  await download(file);
}
function onExceed() { ElMessage.warning(`最多上传 ${effectiveLimit.value} 个文件`); }
</script>

<style scoped>
/* Excel 预览表格：贴近 Excel 观感，宽表横向滚动不撑破弹窗 */
.sheet-wrap { min-height: 120px; }
.sheet-scroll { max-height: 62vh; overflow: auto; border: 1px solid var(--gray-1, #E5E2DA); border-radius: 4px; }
.sheet { border-collapse: collapse; font-size: 13px; white-space: nowrap; }
.sheet td {
  border: 1px solid var(--gray-1, #E5E2DA); padding: 4px 8px;
  max-width: 280px; overflow: hidden; text-overflow: ellipsis;
}
.sheet td.head { background: var(--gray-0, #F4F1EA); font-weight: 600; position: sticky; top: 0; }
.sheet-tip { margin: 8px 0 0; font-size: 13px; color: var(--gray-5, #6F7178); }

.file-upload :deep(.el-upload--picture-card),
.file-upload :deep(.el-upload-list--picture-card .el-upload-list__item) { width: 88px; height: 88px; }
.up-tip { font-size: 13px; color: var(--el-text-color-secondary); }
.fu-wrap { outline: none; }
.fu-hint { font-size: 12px; color: var(--el-text-color-placeholder); margin-top: 2px; }
</style>
