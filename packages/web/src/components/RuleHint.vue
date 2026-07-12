<template>
  <div class="rule-hint" :class="tone">
    <el-icon class="rh-ic"><InfoFilled /></el-icon>
    <div class="rh-body"><slot /></div>
  </div>
</template>

<script setup lang="ts">
// 业务规则灰色提示:把隐性业务逻辑在界面上以浅灰提示语显式呈现
withDefaults(defineProps<{ tone?: 'gray' | 'teal' }>(), { tone: 'gray' });
</script>

<style scoped>
.rule-hint {
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 12.5px; line-height: 1.7;
  padding: 9px 12px; border-radius: 8px;
  margin-bottom: 12px;
}
.rule-hint.gray {
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.rule-hint.teal {
  color: #2b6d60;
  background: rgba(46, 139, 120, 0.07);
  border: 1px solid rgba(46, 139, 120, 0.18);
}
.rh-ic { margin-top: 2px; flex: none; opacity: 0.7; }
.rh-body { flex: 1; }
.rh-body :deep(b) { color: var(--el-text-color-regular); font-weight: 600; }
</style>
