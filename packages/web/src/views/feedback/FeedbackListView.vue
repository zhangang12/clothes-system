<template>
  <div>
    <div class="toolbar">
      <div class="tools-left">
        <el-radio-group v-model="query.status" size="default" @change="reload">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="PENDING">待处理</el-radio-button>
          <el-radio-button label="HANDLED">已处理</el-radio-button>
        </el-radio-group>
      </div>
      <div class="tools-right">
        <el-button :icon="Download" @click="exportHtml">导出 HTML（未处理）</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column label="提交时间" width="160">
        <template #default="{ row }">{{ fmt(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="提交人" width="110" prop="username" />
      <el-table-column label="问题描述" min-width="280" show-overflow-tooltip prop="content" />
      <el-table-column label="图片" width="140">
        <template #default="{ row }">
          <div class="thumbs">
            <el-image
              v-for="(u, i) in imgs(row.images)" :key="i" :src="u" :preview-src-list="imgs(row.images)" :initial-index="i"
              fit="cover" class="thumb" preview-teleported />
            <span v-if="!imgs(row.images).length" class="muted">—</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="提交页面" width="150">
        <template #default="{ row }"><span class="mono">{{ row.page_url || '—' }}</span></template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'HANDLED' ? 'success' : 'warning'" size="small">
            {{ row.status === 'HANDLED' ? '已处理' : '待处理' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status !== 'HANDLED'" link type="primary" @click="setHandled(row, true)">标记已处理</el-button>
          <el-button v-else link type="info" @click="setHandled(row, false)">重开</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="footer">
      <span class="muted">共 {{ total }} 条</span>
      <el-pagination
        v-model:current-page="query.page" :page-size="query.size" :total="total"
        layout="prev, pager, next" @current-change="load" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import { feedbackApi } from '../../api/feedback';
import { downloadHtml } from '../../api/errorLog';

const list = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const query = reactive({ page: 1, size: 20, status: '' });

function imgs(s?: string): string[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}
function fmt(d: string) { return d ? new Date(d).toLocaleString('zh-CN') : ''; }

async function load() {
  loading.value = true;
  try {
    const res: any = await feedbackApi.list({ ...query, status: query.status || undefined });
    list.value = res.data ?? [];
    total.value = res.total ?? 0;
  } finally {
    loading.value = false;
  }
}
function reload() { query.page = 1; load(); }

async function setHandled(row: any, handled: boolean) {
  await feedbackApi.markHandled(row.id, handled);
  ElMessage.success(handled ? '已标记处理' : '已重开');
  load();
}
async function exportHtml() {
  try { await downloadHtml('/feedbacks/export', `用户反馈-${Date.now()}.html`); }
  catch (e: any) { ElMessage.error(e.message || '导出失败'); }
}

onMounted(load);
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.muted { color: var(--gray-5, #8a94a0); font-size: 13px; }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
.thumbs { display: flex; gap: 4px; flex-wrap: wrap; }
.thumb { width: 34px; height: 34px; border-radius: 4px; }
</style>
