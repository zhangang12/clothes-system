<template>
  <el-select
    :model-value="modelValue"
    filterable
    allow-create
    default-first-option
    clearable
    :placeholder="placeholder"
    style="width: 100%"
    :disabled="disabled"
    :size="size"
    @update:model-value="onChange"
  >
    <el-option v-for="d in items" :key="d.id" :label="d.label" :value="d.label" />
  </el-select>
</template>

<script setup lang="ts">
// 通用字典下拉(基础资料稿:从字典选择 + 可累积录入过的历史值)
// 选项从 sys_dict 拉取;用户自填的新值选中即自动写回字典,下次全员可选
import { ref, onMounted } from 'vue';
import { dictApi, type DictItem } from '@/api/dict';

const props = defineProps<{ modelValue?: string; type: string; placeholder?: string; disabled?: boolean; size?: 'small' | 'default' | 'large' }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'item', item: DictItem | null): void }>();
const items = ref<DictItem[]>([]);

async function load() {
  try { items.value = ((await dictApi.list(props.type)) as any).data ?? []; } catch { items.value = []; }
}
async function onChange(v: string) {
  emit('update:modelValue', v ?? '');
  const hit = items.value.find((d) => d.label === v) ?? null;
  emit('item', hit);
  if (v && !hit) {
    // 自填新值 → 累积进字典(静默,失败不打扰)
    try { await dictApi.create(props.type, v); load(); } catch { /* 忽略 */ }
  }
}
onMounted(load);
</script>
