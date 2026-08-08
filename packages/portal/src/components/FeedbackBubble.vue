<template>
  <!-- 右下角悬浮泡泡（带未读回复红点）。登录页/未登录不显示 -->
  <template v-if="visible">
    <div class="fb-fab" @click="openPanel">
      <span class="fb-ico">💬</span>
      <span class="fb-txt">反馈</span>
      <span v-if="unread > 0" class="fb-dot">{{ unread > 99 ? '99+' : unread }}</span>
    </div>

    <!-- 我的反馈与回复 -->
    <van-popup v-model:show="panelOpen" position="bottom" round :style="{ height: '72%' }">
      <div class="pnl">
        <div class="pnl-hd">
          我的反馈与回复
          <van-button size="mini" type="primary" @click="startNew">我要反馈</van-button>
        </div>
        <div class="pnl-body">
          <van-empty v-if="!loading && !mineList.length" description="还没有提过反馈" />
          <van-loading v-if="loading" class="pnl-loading">加载中…</van-loading>
          <div v-for="fb in mineList" :key="fb.id" class="fb-card" :class="{ unread: fb.reply && !fb.reply_read }">
            <div class="fb-card-hd">
              <span class="fb-time">{{ fmt(fb.created_at) }}</span>
              <van-tag :type="fb.status === 'HANDLED' ? 'success' : 'warning'">
                {{ fb.status === 'HANDLED' ? '已处理' : '待处理' }}
              </van-tag>
            </div>
            <div class="fb-content">{{ fb.content }}</div>
            <div v-if="fb.reply" class="fb-reply">
              <div class="fb-reply-hd">管理员回复<span v-if="!fb.reply_read" class="fb-new">未读</span></div>
              <div class="fb-reply-txt">{{ fb.reply }}</div>
              <div class="fb-reply-time">{{ fmt(fb.reply_at) }}</div>
            </div>
          </div>
        </div>
      </div>
    </van-popup>

    <!-- 提交反馈 -->
    <van-popup v-model:show="open" position="bottom" round :style="{ height: '68%' }" @closed="reset">
      <div class="pnl">
        <div class="pnl-hd">问题反馈</div>
        <div class="pnl-body">
          <van-field
            v-model="content" type="textarea" rows="4" maxlength="2000" show-word-limit
            label="问题描述" label-align="top"
            placeholder="请描述你遇到的问题、期望的效果，或改进建议…"
          />
          <van-field label="截图（可选，最多 6 张）" label-align="top">
            <template #input>
              <van-uploader
                v-model="files" :max-count="6" :after-read="afterRead" :before-delete="beforeDelete"
                accept="image/*"
              />
            </template>
          </van-field>
          <p class="fb-ctx">提交页面：{{ pageUrl }}</p>
        </div>
        <div class="pnl-ft">
          <van-button block @click="open = false">取消</van-button>
          <van-button block type="primary" :loading="saving" :disabled="!content.trim()" @click="submit">提交</van-button>
        </div>
      </div>
    </van-popup>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import { showToast } from 'vant';
import { feedbackApi } from '../api/feedback';
import { uploadApi } from '../api/upload';

const route = useRoute();
// 未登录（登录页）时不显示：接口会 401，泡泡也没有意义
const visible = computed(() => !!localStorage.getItem('portal_token') && route.path !== '/login');
const pageUrl = computed(() => route.fullPath);

const open = ref(false);
const panelOpen = ref(false);
const loading = ref(false);
const saving = ref(false);
const content = ref('');
const files = ref<any[]>([]);
const urls = ref<string[]>([]);
const unread = ref(0);
const mineList = ref<any[]>([]);
let timer: any = null;

const fmt = (d: string) => (d ? new Date(d).toLocaleString('zh-CN') : '');

async function refreshUnread() {
  if (!visible.value) { unread.value = 0; return; }
  try { const r: any = await feedbackApi.unread(); unread.value = (r.data ?? r)?.count ?? 0; }
  catch { /* 未登录/网络问题静默，不打扰供应商干活 */ }
}

async function openPanel() {
  panelOpen.value = true;
  loading.value = true;
  try {
    const r: any = await feedbackApi.mine({ page: 1, size: 50 });
    mineList.value = r.data ?? [];
    // 打开即把未读回复标记已读 → 消红点（与 PC 端行为一致）
    const ids = mineList.value.filter((f) => f.reply && !f.reply_read).map((f) => f.id);
    await Promise.all(ids.map((id) => feedbackApi.markRead(id).catch(() => {})));
    mineList.value.forEach((f) => { if (ids.includes(f.id)) f.reply_read = 1; });
    unread.value = 0;
  } catch { /* 拦截器已提示 */ } finally { loading.value = false; }
}

function startNew() { panelOpen.value = false; open.value = true; }

// 图片上传：供应商上传一律落 private/，这里存后端回的 URL，提交时一起带上
async function afterRead(item: any) {
  const list = Array.isArray(item) ? item : [item];
  for (const it of list) {
    it.status = 'uploading';
    it.message = '上传中';
    try {
      const res: any = await uploadApi.upload(it.file);
      const url = res?.data?.url ?? res?.url;
      if (!url) throw new Error('无返回地址');
      it.url = url;
      urls.value.push(url);
      it.status = 'done';
      it.message = '';
    } catch {
      it.status = 'failed';
      it.message = '上传失败';
    }
  }
}
function beforeDelete(item: any) {
  urls.value = urls.value.filter((u) => u !== item?.url);
  return true;
}

function reset() { content.value = ''; files.value = []; urls.value = []; }

async function submit() {
  if (!content.value.trim()) return;
  saving.value = true;
  try {
    await feedbackApi.create({
      content: content.value.trim(),
      images: urls.value.length ? [...urls.value] : undefined,
      page_url: pageUrl.value,
    });
    showToast('反馈已提交，感谢！');
    open.value = false;
    refreshUnread();
  } catch { /* 拦截器已提示 */ } finally { saving.value = false; }
}

// 登录后（token 出现）立刻拉一次，免得供应商刚登进来看不到红点
watch(visible, (v) => { if (v) refreshUnread(); });
onMounted(() => { refreshUnread(); timer = setInterval(refreshUnread, 60000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
/* 泡泡避开底部 TabBar 与 iPhone 安全区，否则会被挡住 */
.fb-fab {
  position: fixed; right: 14px; bottom: calc(74px + env(safe-area-inset-bottom, 0px)); z-index: 999;
  width: 48px; height: 48px; border-radius: 50%;
  background: #D17A40; color: #fff; box-shadow: 0 4px 14px rgba(209, 122, 64, .42);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
}
.fb-fab:active { transform: scale(.94); }
.fb-ico { font-size: 16px; line-height: 1; }
.fb-txt { font-size: 11px; line-height: 1; }
.fb-dot {
  position: absolute; top: -4px; right: -4px; min-width: 17px; height: 17px; padding: 0 4px;
  border-radius: 9px; background: #ee0a24; color: #fff; font-size: 11px; line-height: 17px; text-align: center;
}

.pnl { display: flex; flex-direction: column; height: 100%; }
.pnl-hd {
  flex: none; padding: 12px 16px; font-size: 15px; font-weight: 600;
  border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between;
}
.pnl-body { flex: 1; overflow: auto; padding: 8px 12px 16px; }
.pnl-loading { padding: 24px 0; text-align: center; }
.pnl-ft { flex: none; display: flex; gap: 10px; padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid #f0f0f0; }

.fb-card { border: 1px solid #ebedf0; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.fb-card.unread { border-color: #D17A40; background: #fff8f2; }
.fb-card-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.fb-time { font-size: 12px; color: #969799; }
.fb-content { font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.fb-reply { margin-top: 8px; padding: 8px 10px; background: #f7f8fa; border-radius: 6px; }
.fb-reply-hd { font-size: 12px; color: #1E3A5F; font-weight: 600; margin-bottom: 4px; }
.fb-new { margin-left: 6px; color: #ee0a24; font-weight: 400; }
.fb-reply-txt { font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
.fb-reply-time { font-size: 11px; color: #969799; margin-top: 4px; }
.fb-ctx { font-size: 12px; color: #969799; padding: 4px 16px 0; word-break: break-all; }
</style>
