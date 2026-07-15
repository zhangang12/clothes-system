<template>
  <el-dialog :model-value="modelValue" :title="`${title} · Excel 批量导入`" width="720px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)" @closed="reset">
    <el-steps :active="step" align-center finish-status="success" class="steps">
      <el-step title="下载模板" /><el-step title="上传/粘贴" /><el-step title="数据校验" /><el-step title="入库" />
    </el-steps>

    <!-- Step 0: template -->
    <div v-if="step === 0" class="pane">
      <p class="muted">请按固定模板准备数据（Excel 另存为 CSV，UTF-8）。列顺序：</p>
      <div class="headers">{{ templateHeaders.join(' , ') }}</div>
      <el-button type="primary" :icon="Download" @click="downloadTemplate">下载 CSV 模板</el-button>
      <el-button @click="step = 1">已备好数据，下一步</el-button>
    </div>

    <!-- Step 1: upload/paste -->
    <div v-else-if="step === 1" class="pane">
      <el-upload action="#" :show-file-list="false" accept=".csv,text/csv" :http-request="onFile">
        <el-button :icon="Upload" type="primary">上传 CSV 文件</el-button>
      </el-upload>
      <p class="muted" style="margin:10px 0 4px">或直接粘贴 CSV 文本：</p>
      <el-input v-model="rawText" type="textarea" :rows="6" placeholder="第一行为表头，与模板一致" />
      <div style="margin-top:10px">
        <el-button @click="step = 0">上一步</el-button>
        <el-button type="primary" :disabled="!rawText.trim()" @click="parse">解析并校验</el-button>
      </div>
    </div>

    <!-- Step 2: validate -->
    <div v-else-if="step === 2" class="pane">
      <div class="summary">共 {{ parsed.length }} 行，<span class="ok">通过 {{ validCount }}</span>，<span class="bad">异常 {{ parsed.length - validCount }}</span></div>
      <el-table :data="parsed.slice(0, 20)" size="small" border max-height="300">
        <el-table-column type="index" label="#" width="44" />
        <el-table-column v-for="h in templateHeaders" :key="h" :label="h" :prop="h" show-overflow-tooltip />
        <el-table-column label="校验" width="150" fixed="right">
          <template #default="{ row }">
            <el-tag v-if="row.__error" type="danger" size="small">{{ row.__error }}</el-tag>
            <el-tag v-else type="success" size="small">✓ 通过</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <p v-if="parsed.length > 20" class="muted">仅预览前 20 行。</p>
      <div style="margin-top:10px">
        <el-button @click="step = 1">上一步</el-button>
        <el-button type="primary" :disabled="!validCount" :loading="submitting" @click="commit">确认入库（{{ validCount }} 行）</el-button>
      </div>
    </div>

    <!-- Step 3: result -->
    <div v-else class="pane">
      <el-result :icon="result.failedCount ? 'warning' : 'success'"
        :title="`入库完成：成功 ${result.created} 行，失败 ${result.failedCount} 行`">
        <template #extra>
          <el-table v-if="result.failed?.length" :data="result.failed" size="small" border max-height="240">
            <el-table-column prop="index" label="行号" width="70" />
            <el-table-column prop="name" label="名称" width="160" />
            <el-table-column prop="error" label="失败原因" show-overflow-tooltip />
          </el-table>
          <el-button v-if="result.failed?.length" style="margin-top:12px" type="danger" plain @click="downloadFailures">↓ 下载错误报告</el-button>
          <el-button style="margin-top:12px" type="primary" @click="done">完成</el-button>
        </template>
      </el-result>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Download, Upload } from '@element-plus/icons-vue';

const props = defineProps<{
  modelValue: boolean;
  title: string;
  templateHeaders: string[];
  parseRow: (cells: Record<string, string>) => { row: any; error?: string };
  submit: (rows: any[]) => Promise<any>;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'done'): void }>();

const step = ref(0);
const rawText = ref('');
const parsed = ref<any[]>([]);
const submitting = ref(false);
const result = ref<any>({ created: 0, failedCount: 0, failed: [] });
const validCount = computed(() => parsed.value.filter((r) => !r.__error).length);

function downloadTemplate() {
  const csv = '﻿' + props.templateHeaders.join(',') + '\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = `${props.title}_导入模板.csv`; a.click();
  URL.revokeObjectURL(url);
}
function onFile(opt: any) {
  const reader = new FileReader();
  reader.onload = () => { rawText.value = String(reader.result || ''); step.value = 1; };
  reader.readAsText(opt.file, 'utf-8');
}
// 简易 CSV 解析（支持双引号包裹的逗号/换行）
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let field = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}
function parse() {
  const grid = parseCsv(rawText.value.trim());
  if (grid.length < 2) { ElMessage.warning('至少需要表头 + 1 行数据'); return; }
  const headers = grid[0].map((h) => h.trim());
  parsed.value = grid.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
    const { row, error } = props.parseRow(obj);
    return { ...obj, __payload: row, __error: error };
  });
  step.value = 2;
}
async function commit() {
  submitting.value = true;
  try {
    const rows = parsed.value.filter((r) => !r.__error).map((r) => r.__payload);
    const res: any = await props.submit(rows);
    result.value = res.data ?? res;
    step.value = 3;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg ?? '入库失败');
  } finally { submitting.value = false; }
}
function done() { emit('done'); emit('update:modelValue', false); }
function reset() { step.value = 0; rawText.value = ''; parsed.value = []; result.value = { created: 0, failedCount: 0, failed: [] }; }

// 错误报告下载(设计稿 D.2:下载错误报告)
function downloadFailures() {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = (result.value.failed ?? []) as any[];
  const csv = '\ufeff' + ['行号,名称,失败原因', ...rows.map((r) => [r.index, r.name, r.error].map(esc).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = '导入错误报告.csv'; a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.steps { margin-bottom: 18px; }
.pane { min-height: 180px; }
.muted { font-size: 14px; color: var(--el-text-color-secondary); }
.headers { background: #F5EDDC; border-radius: 4px; padding: 8px 12px; margin: 8px 0 14px; font-size: 14px; color: #1E3A5F; }
.summary { margin-bottom: 10px; font-size: 14px; }
.summary .ok { color: #3E8E7E; font-weight: 600; }
.summary .bad { color: #C04042; font-weight: 600; }
</style>
