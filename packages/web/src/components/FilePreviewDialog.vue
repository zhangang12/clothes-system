<template>
  <el-dialog
    v-model="visible" :title="title" :width="kind === 'sheet' ? '90%' : '880px'" top="4vh" append-to-body destroy-on-close
    class="fp-dialog"
  >
    <div v-loading="loading" class="fp-body" :class="{ 'fp-body--sheet': kind === 'sheet' }">
      <img v-if="kind === 'image' && url" :src="url" alt="预览" class="fp-img" />
      <!-- PDF 用 iframe 内嵌：浏览器自带阅读器渲染，不触发下载。
           不用 <embed>/<object>：部分国产浏览器对它们的处理仍是「下载」 -->
      <iframe v-else-if="kind === 'pdf' && url" :src="url" class="fp-frame" title="预览" />
      <!-- Excel：取回解析成表格（多工作表分页签，超大表截断），与 FileUpload 的附件预览同一套 -->
      <div v-else-if="kind === 'sheet'" class="fp-sheet">
        <el-tabs v-if="sheets.length > 1" v-model="activeSheet">
          <el-tab-pane v-for="(s, i) in sheets" :key="i" :label="s.name" :name="String(i)" />
        </el-tabs>
        <div v-if="curSheet" class="fp-sheet-scroll">
          <table class="fp-table">
            <tbody>
              <tr v-for="(row, ri) in curSheet.rows" :key="ri">
                <td v-for="(cell, ci) in row" :key="ci" :class="{ head: ri === 0 }">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="curSheet?.truncated" class="fp-sheet-tip">表格较大，仅预览前 200 行；完整内容请下载。</p>
      </div>
      <el-empty v-else-if="!loading" :description="emptyText" />
    </div>
    <template #footer>
      <span class="fp-tip">看不清可点「下载」用本机软件打开</span>
      <!-- PDF 另给「新窗口打开」：普通 <a target=_blank>，点击本身就是用户手势，不会被弹窗拦截 -->
      <el-link v-if="kind === 'pdf' && url" :href="url" target="_blank" rel="noopener" type="primary" style="margin-right:12px">新窗口打开</el-link>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :icon="Download" :disabled="!url" @click="download">下载</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { signedUrl } from '@/utils/secureFile';
import { parseXlsx, type SheetData } from '@/utils/sheetPreview';
import { fileNameOf, kindOf, extOf, type PreviewKind } from '@/utils/filePreview';

/**
 * 应用内文件预览（2026-08-10 King：「供应商上传的发票 能不能直接点开，不要下载？」）
 *
 * 【为什么不能继续用 window.open】后端对 PDF 明明发的是 `Content-Disposition: inline`
 * （已实测响应头无误），但**开新标签页之后是否内联显示完全由浏览器决定**——
 * 国内常见的 360/QQ 浏览器、以及关掉了内置 PDF 阅读器的 Chrome，都会直接落成下载。
 * 而且 `openFile` 是 await 拿签名链接之后才 window.open，**已脱离用户手势，还会被弹窗拦截**。
 * 改成在自己页面里用 iframe/img 渲染，显示与否就不再看浏览器脸色。
 *
 * 【文件类型按 URL 判，不按标题判】（B021）调用方传的 label 是「付款水单」「发票 xxx」这类中文标题，
 * 没有扩展名；此前 kind 用 label 判型，于是所有水单/发票/对账单点「查看」都落到「没法预览」。
 * 判型规则收在 utils/filePreview.ts（可单测）。
 */
const visible = ref(false);
const url = ref('');
const name = ref('');      // 弹窗标题（调用方给的业务标题，如「付款水单」）
const fileName = ref('');  // 真实文件名（从 URL 解出，判类型、下载命名用）
const loading = ref(false);
const sheets = ref<SheetData[]>([]);
const sheetFailed = ref(false); // xlsx 解析失败：退回「请下载」，弹窗不关、下载按钮还在
const activeSheet = ref('0');
const curSheet = computed(() => sheets.value[Number(activeSheet.value)] ?? null);
let seq = 0; // 连点两个附件时只认最后一次

const title = computed(() => name.value || fileName.value || '文件预览');
const kind = computed<PreviewKind>(() => {
  const k = kindOf(fileName.value);
  return k === 'sheet' && sheetFailed.value ? 'other' : k;
});
const extLabel = computed(() => extOf(fileName.value) || '未知格式');
const emptyText = computed(() => (sheetFailed.value
  ? '这个 Excel 文件在页面里解析不了，请下载后用本机 Excel 打开'
  : `这种文件（${extLabel.value}）没法在页面里预览，请下载后打开`));

async function open(raw: string, label?: string) {
  if (!raw) { ElMessage.warning('没有可预览的文件'); return; }
  const mine = ++seq;
  name.value = label || '';
  fileName.value = fileNameOf(raw);
  url.value = '';
  sheets.value = [];
  sheetFailed.value = false;
  activeSheet.value = '0';
  visible.value = true;
  loading.value = true;
  try {
    // 敏感附件（发票/水单等落 private/）要换短时签名链接，裸 URL 必 403
    const signed = await signedUrl(raw);
    if (mine !== seq) return;
    url.value = signed;
  } catch {
    if (mine !== seq) return;
    ElMessage.error('取文件链接失败');
    visible.value = false;
    loading.value = false;
    return;
  }
  if (kind.value === 'sheet') {
    try {
      const res = await fetch(url.value);
      if (!res.ok) throw new Error(`读取失败（HTTP ${res.status}）`);
      const parsed = await parseXlsx(await res.arrayBuffer());
      if (mine !== seq) return;
      sheets.value = parsed;
    } catch (e: any) {
      if (mine !== seq) return;
      sheetFailed.value = true;
      ElMessage.warning(`${e?.message || '预览失败'}，请点「下载」用本机 Excel 打开`);
    }
  }
  if (mine === seq) loading.value = false;
}

function download() {
  if (!url.value) return;
  const a = document.createElement('a');
  a.href = url.value;
  a.download = fileName.value || name.value || '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

defineExpose({ open });
</script>

<style scoped>
.fp-body { min-height: 60vh; display: flex; align-items: center; justify-content: center; background: var(--el-fill-color-light); border-radius: 4px; }
.fp-body--sheet { align-items: stretch; justify-content: stretch; background: transparent; min-height: 200px; }
.fp-img { max-width: 100%; max-height: 74vh; object-fit: contain; }
.fp-frame { width: 100%; height: 74vh; border: 0; background: #fff; }
.fp-tip { font-size: 12px; color: var(--el-text-color-placeholder); margin-right: auto; margin-left: 6px; }
:deep(.el-dialog__footer) { display: flex; align-items: center; }
/* Excel 预览表格：与 FileUpload 的附件预览同一观感，宽表横向滚动不撑破弹窗 */
.fp-sheet { width: 100%; }
.fp-sheet-scroll { max-height: 66vh; overflow: auto; border: 1px solid var(--gray-1, #E5E2DA); border-radius: 4px; }
.fp-table { border-collapse: collapse; font-size: 13px; white-space: nowrap; }
.fp-table td { border: 1px solid var(--gray-1, #E5E2DA); padding: 4px 8px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
.fp-table td.head { background: var(--gray-0, #F4F1EA); font-weight: 600; position: sticky; top: 0; }
.fp-sheet-tip { margin: 8px 0 0; font-size: 13px; color: var(--gray-5, #6F7178); }
</style>
