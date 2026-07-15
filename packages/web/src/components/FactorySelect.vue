<template>
  <!-- 工厂选择器:按名称/编号搜索,存工厂ID。替代裸「工厂ID」数字输入(用户不知道数字ID填不了单)。 -->
  <el-select
    :model-value="modelValue"
    filterable clearable
    :placeholder="placeholder"
    :disabled="disabled"
    style="width:100%"
    @update:model-value="(v: any) => emit('update:modelValue', (v === '' || v == null) ? undefined : Number(v))"
    @change="onChange"
  >
    <el-option v-for="f in factories" :key="f.id" :label="labelOf(f)" :value="f.id" />
  </el-select>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { factoryApi } from '@/api/factory';

const props = withDefaults(defineProps<{
  modelValue?: number;
  type?: string;               // 可按工厂类型过滤(FABRIC/OUTSOURCE 等,逗号分隔;命中主/附身份)
  placeholder?: string;
  disabled?: boolean;
}>(), { modelValue: undefined, type: undefined, placeholder: '按名称/编号搜索工厂', disabled: false });

const emit = defineEmits<{
  (e: 'update:modelValue', v: number | undefined): void;
  (e: 'change', f: any | undefined): void;   // 带出选中工厂对象(供带出名称等)
}>();

const factories = ref<any[]>([]);
const labelOf = (f: any) => [f.factory_no, f.name].filter(Boolean).join(' · ') || `工厂#${f.id}`;
function onChange(v: any) {
  emit('change', factories.value.find((f) => f.id === v));
}
onMounted(async () => {
  try {
    const res: any = await factoryApi.select(props.type);
    factories.value = (res.data ?? res) ?? [];
  } catch {
    factories.value = [];
  }
});
</script>
