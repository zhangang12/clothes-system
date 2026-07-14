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
      <el-table-column label="回复" min-width="180">
        <template #default="{ row }">
          <span v-if="row.reply" class="reply-txt">{{ row.reply }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'HANDLED' ? 'success' : 'warning'" size="small">
            {{ row.status === 'HANDLED' ? '已处理' : '待处理' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openReply(row)">{{ row.reply ? '改回复' : '回复' }}</el-button>
          <el-button v-if="row.status !== 'HANDLED'" link type="success" @click="setHandled(row, true)">标记已处理</el-button>
          <el-button v-else link type="info" @click="setHandled(row, false)">重开</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 回复弹窗:把改动的业务逻辑回复给提交人(提交人登录后右下角红点提醒) -->
    <el-dialog v-model="replyOpen" title="回复提交人" width="520px" append-to-body>
      <el-form label-position="top">
        <el-form-item label="原始反馈">
          <div class="orig">{{ replyRow?.content }}</div>
        </el-form-item>
        <el-form-item label="回复内容（改动的业务逻辑 / 处理说明）" required>
          <el-input v-model="replyText" type="textarea" :rows="4" maxlength="500" show-word-limit
            placeholder="例如：您反馈的联系人部门/职务已按需求移除，电子章收集已下线…" />
        </el-form-item>
        <p class="muted">提交回复后自动标记为「已处理」，提交人登录后右下角会看到未读提醒。</p>
      </el-form>
      <template #footer>
        <el-button @click="replyOpen = false">取消</el-button>
        <el-button type="primary" :loading="replySaving" :disabled="!replyText.trim()" @click="submitReply">发送回复</el-button>
      </template>
    </el-dialog>

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

// 回复提交人
const replyOpen = ref(false);
const replyRow = ref<any>(null);
const replyText = ref('');
const replySaving = ref(false);
function openReply(row: any) {
  replyRow.value = row;
  replyText.value = row.reply || '';
  replyOpen.value = true;
}
async function submitReply() {
  if (!replyText.value.trim()) return;
  replySaving.value = true;
  try {
    // 带回复标记已处理:后端记回复时间并置未读 → 提交人右下角红点
    await feedbackApi.markHandled(replyRow.value.id, true, replyText.value.trim());
    ElMessage.success('回复已发送，提交人将收到提醒');
    replyOpen.value = false;
    load();
  } catch { /* 拦截器已提示 */ } finally { replySaving.value = false; }
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
.reply-txt { font-size: 13px; color: var(--teal-d, #1E6B5C); white-space: pre-wrap; }
.orig { background: var(--gray-1, #f4f6f8); border-radius: 6px; padding: 8px 10px; font-size: 13px; color: #333; white-space: pre-wrap; }
</style>
