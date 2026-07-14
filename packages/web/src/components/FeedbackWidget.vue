<template>
  <!-- 右下角悬浮入口 -->
  <div class="fb-fab" title="问题反馈" @click="open = true">
    <el-icon :size="20"><ChatDotRound /></el-icon>
    <span class="fb-fab-txt">反馈</span>
  </div>

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
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ChatDotRound } from '@element-plus/icons-vue';
import FileUpload from './FileUpload.vue';
import { feedbackApi } from '../api/feedback';

const route = useRoute();
const open = ref(false);
const content = ref('');
const images = ref(''); // FileUpload：逗号分隔 URL
const saving = ref(false);
const pageUrl = ref(route.fullPath);

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
.fb-fab-txt { font-size: 11px; line-height: 1; }
.fb-ctx { margin: 4px 0 0; font-size: 12px; color: var(--gray-5, #8a94a0); }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
@media (prefers-reduced-motion: reduce) { .fb-fab { transition: none; } }
</style>
