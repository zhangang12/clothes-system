<template>
  <div>
    <div class="toolbar">
      <div class="tools-left">
        <el-radio-group v-model="query.status" size="default" @change="reload">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="OPEN">未处理</el-radio-button>
          <el-radio-button label="HANDLED">已处理</el-radio-button>
        </el-radio-group>
        <span class="muted">同类报错自动去重聚合，记录操作输入/输出上下文，便于排查</span>
      </div>
      <div class="tools-right">
        <el-button :icon="Download" @click="exportHtml">导出 HTML（未处理）</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" border stripe @row-dblclick="openDetail">
      <el-table-column label="末见时间" width="160">
        <template #default="{ row }">{{ fmt(row.last_seen) }}</template>
      </el-table-column>
      <el-table-column label="次数" width="70" align="right">
        <template #default="{ row }"><b class="cnt">{{ row.count }}</b></template>
      </el-table-column>
      <el-table-column label="接口" min-width="260">
        <template #default="{ row }">
          <el-tag size="small" effect="dark">{{ row.method }}</el-tag>
          <span class="mono path">{{ row.path }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态码" width="80" align="center">
        <template #default="{ row }"><el-tag type="danger" size="small">{{ row.status_code }}</el-tag></template>
      </el-table-column>
      <el-table-column label="错误" min-width="260" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="etype">{{ row.error_type }}</span>
          <span class="emsg">{{ row.message }}</span>
        </template>
      </el-table-column>
      <el-table-column label="用户/IP" width="120">
        <template #default="{ row }">{{ row.username || '—' }}<br><span class="mono ip">{{ row.ip || '' }}</span></template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'HANDLED' ? 'success' : 'danger'" size="small">
            {{ row.status === 'HANDLED' ? '已处理' : '未处理' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button v-if="row.status !== 'HANDLED'" link type="success" @click="setHandled(row, true)">已处理</el-button>
          <el-button v-else link type="info" @click="setHandled(row, false)">重开</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="footer">
      <span class="muted">共 {{ total }} 类</span>
      <el-pagination
        v-model:current-page="query.page" :page-size="query.size" :total="total"
        layout="prev, pager, next" @current-change="load" />
    </div>

    <!-- 详情：操作上下文 -->
    <el-drawer v-model="detailOpen" :title="cur?.error_type || '报错详情'" size="640px">
      <template v-if="cur">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="接口">{{ cur.method }} {{ cur.path }}</el-descriptions-item>
          <el-descriptions-item label="状态码">{{ cur.status_code }}（code {{ cur.code }}）</el-descriptions-item>
          <el-descriptions-item label="累计次数">{{ cur.count }}</el-descriptions-item>
          <el-descriptions-item label="用户 / IP">{{ cur.username || '—' }} / {{ cur.ip || '—' }}</el-descriptions-item>
          <el-descriptions-item label="首次">{{ fmt(cur.first_seen) }}</el-descriptions-item>
          <el-descriptions-item label="最近">{{ fmt(cur.last_seen) }}</el-descriptions-item>
        </el-descriptions>
        <h4>错误信息</h4>
        <pre class="box err">{{ cur.message }}</pre>
        <h4>输入上下文（query / params / body，敏感字段已脱敏）</h4>
        <pre class="box">{{ pretty(cur.req_input) }}</pre>
        <h4>输出</h4>
        <pre class="box">{{ pretty(cur.resp_output) }}</pre>
        <template v-if="cur.stack">
          <h4>堆栈</h4>
          <pre class="box stack">{{ cur.stack }}</pre>
        </template>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import { errorLogApi, downloadHtml } from '../../api/errorLog';

const list = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const query = reactive({ page: 1, size: 20, status: '' });
const detailOpen = ref(false);
const cur = ref<any>(null);

function fmt(d: string) { return d ? new Date(d).toLocaleString('zh-CN') : ''; }
function pretty(s?: string) {
  if (!s) return '—';
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

async function load() {
  loading.value = true;
  try {
    const res: any = await errorLogApi.list({ ...query, status: query.status || undefined });
    list.value = res.data ?? [];
    total.value = res.total ?? 0;
  } finally {
    loading.value = false;
  }
}
function reload() { query.page = 1; load(); }

function openDetail(row: any) { cur.value = row; detailOpen.value = true; }

async function setHandled(row: any, handled: boolean) {
  await errorLogApi.markHandled(row.id, handled);
  ElMessage.success(handled ? '已标记处理' : '已重开');
  load();
}
async function exportHtml() {
  try { await downloadHtml('/error-logs/export', `系统报错记录-${Date.now()}.html`); }
  catch (e: any) { ElMessage.error(e.message || '导出失败'); }
}

onMounted(load);
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; }
.tools-left { display: flex; align-items: center; gap: 12px; }
.footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.muted { color: var(--gray-5, #8a94a0); font-size: 12.5px; }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
.path { margin-left: 6px; font-size: 12px; }
.ip { font-size: 11px; color: var(--gray-5, #8a94a0); }
.cnt { color: var(--rust, #D17A40); }
.etype { color: #A93226; font-weight: 600; margin-right: 6px; }
.emsg { color: var(--gray-7, #55606c); font-size: 12.5px; }
h4 { margin: 16px 0 6px; font-size: 13px; color: var(--indigo, #1E3A5F); }
.box { background: #F5F3EC; border: 1px solid #E6E2D7; border-radius: 6px; padding: 10px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 260px; overflow: auto; margin: 0; }
.box.err { color: #A93226; }
.box.stack { max-height: 320px; }
</style>
