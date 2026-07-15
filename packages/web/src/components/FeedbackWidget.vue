<template>
  <!-- 右下角悬浮入口（带未读回复红点角标） -->
  <el-badge :value="unread" :hidden="!unread" :max="99" class="fb-badge">
    <div class="fb-fab" title="问题反馈 / 我的回复" @click="openPanel">
      <el-icon :size="20"><ChatDotRound /></el-icon>
      <span class="fb-fab-txt">反馈</span>
    </div>
  </el-badge>

  <!-- 我的反馈 + 管理员回复 面板 -->
  <el-drawer v-model="panelOpen" title="我的反馈与回复" size="440px" append-to-body>
    <div v-if="!mineList.length" class="fb-empty">暂无反馈记录</div>
    <div v-for="fb in mineList" :key="fb.id" class="fb-card" :class="{ unread: fb.reply && !fb.reply_read }">
      <div class="fb-card-head">
        <span class="fb-time mono">{{ fmt(fb.created_at) }}</span>
        <el-tag size="small" :type="fb.status === 'HANDLED' ? 'success' : 'warning'">
          {{ fb.status === 'HANDLED' ? '已处理' : '待处理' }}
        </el-tag>
      </div>
      <div class="fb-content">{{ fb.content }}</div>
      <div v-if="fb.reply" class="fb-reply">
        <div class="fb-reply-label">
          <el-icon><ChatLineRound /></el-icon> 管理员回复
          <span v-if="!fb.reply_read" class="fb-dot">未读</span>
        </div>
        <div class="fb-reply-txt">{{ fb.reply }}</div>
        <div class="fb-reply-time mono">{{ fmt(fb.reply_at) }}</div>
      </div>
    </div>
    <template #footer>
      <el-button type="primary" @click="startNew">我要反馈</el-button>
    </template>
  </el-drawer>

  <el-dialog v-model="open" title="问题反馈" width="480px" append-to-body destroy-on-close @closed="reset">
    <el-form label-position="top">
      <el-form-item label="问题描述" required>
        <el-input
          v-model="content"
          type="textarea"
          :rows="4"
          maxlength="2000"
          show-word-limit
          placeholder="请描述你遇到的问题、期望的效果，或改进建议…"
        />
      </el-form-item>
      <el-form-item label="截图 / 图片（可选，最多 6 张）">
        <FileUpload v-model="images" multiple :limit="6" accept="image/*" global-paste />
      </el-form-item>
      <p class="fb-ctx">提交页面：<span class="mono">{{ pageUrl }}</span></p>
    </el-form>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!content.trim()" @click="submit">提 交</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ChatDotRound, ChatLineRound } from '@element-plus/icons-vue';
import FileUpload from './FileUpload.vue';
import { feedbackApi } from '../api/feedback';

const route = useRoute();
const open = ref(false);
const content = ref('');
const images = ref(''); // FileUpload：逗号分隔 URL
const saving = ref(false);
const pageUrl = ref(route.fullPath);

// 未读回复红点 + 我的反馈面板
const unread = ref(0);
const panelOpen = ref(false);
const mineList = ref<any[]>([]);
let timer: any = null;

const fmt = (d: string) => (d ? new Date(d).toLocaleString('zh-CN') : '');

async function refreshUnread() {
  try { const r: any = await feedbackApi.unread(); unread.value = (r.data ?? r)?.count ?? 0; }
  catch { /* 未登录/无权限静默 */ }
}

async function openPanel() {
  panelOpen.value = true;
  try {
    const r: any = await feedbackApi.mine({ page: 1, size: 50 });
    mineList.value = r.data ?? [];
    // 打开即把未读回复标记已读 → 消红点
    const unreadIds = mineList.value.filter((f) => f.reply && !f.reply_read).map((f) => f.id);
    await Promise.all(unreadIds.map((id) => feedbackApi.markRead(id).catch(() => {})));
    if (unreadIds.length) { mineList.value.forEach((f) => { if (unreadIds.includes(f.id)) f.reply_read = 1; }); }
    unread.value = 0;
  } catch { /* 拦截器已提示 */ }
}

function startNew() { panelOpen.value = false; open.value = true; }

onMounted(() => { refreshUnread(); timer = setInterval(refreshUnread, 60000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

function reset() {
  content.value = '';
  images.value = '';
}

async function submit() {
  if (!content.value.trim()) return;
  saving.value = true;
  try {
    await feedbackApi.create({
      content: content.value.trim(),
      images: images.value ? images.value.split(',').filter(Boolean) : undefined,
      page_url: route.fullPath,
    });
    ElMessage.success('反馈已提交，感谢！');
    open.value = false;
    refreshUnread();
  } catch {
    /* 全局拦截器已提示 */
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.fb-fab {
  position: fixed; right: 22px; bottom: 26px; z-index: 2000;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--rust, #D17A40); color: #fff; cursor: pointer;
  justify-content: center; box-shadow: 0 6px 18px rgba(209, 122, 64, 0.4);
  transition: transform 0.15s, box-shadow 0.15s;
}
.fb-fab:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(209, 122, 64, 0.5); }
.fb-fab-txt { font-size: 12px; line-height: 1; }
.fb-ctx { margin: 4px 0 0; font-size: 13px; color: var(--gray-5, #8a94a0); }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
@media (prefers-reduced-motion: reduce) { .fb-fab { transition: none; } }

.fb-badge { position: fixed; right: 22px; bottom: 26px; z-index: 2000; }
.fb-badge :deep(.el-badge__content) { z-index: 2001; }
.fb-badge .fb-fab { position: static; }

.fb-empty { text-align: center; color: var(--gray-5, #8a94a0); padding: 40px 0; }
.fb-card { border: 1px solid var(--gray-2, #e6e9ed); border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
.fb-card.unread { border-color: var(--rust, #D17A40); box-shadow: 0 0 0 2px rgba(209, 122, 64, 0.12); }
.fb-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.fb-time { font-size: 13px; color: var(--gray-5, #8a94a0); }
.fb-content { font-size: 14px; color: #23343A; white-space: pre-wrap; }
.fb-reply { margin-top: 10px; padding: 8px 10px; background: rgba(46, 139, 120, 0.08); border-radius: 6px; }
.fb-reply-label { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--teal-d, #1E6B5C); margin-bottom: 4px; }
.fb-dot { margin-left: 6px; font-size: 12px; color: #fff; background: var(--rust, #D17A40); border-radius: 8px; padding: 0 6px; font-weight: 400; }
.fb-reply-txt { font-size: 14px; color: #23343A; white-space: pre-wrap; }
.fb-reply-time { font-size: 12px; color: var(--gray-5, #8a94a0); margin-top: 4px; }
</style>
