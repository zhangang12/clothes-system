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
    // id 必须规范成数字：主键是 bigint，mysql2 出来是字符串（JSON 里就是 "1"），
    // 而回传给父组件的是 Number(v)。两边类型不一致 → el-select 拿数字 1 找不到
    // 值为 "1" 的选项 → 匹配不上就把原始值当文字显示，用户看到的是工厂 ID 而不是名称；
    // 连带 onChange 的 find 也永远落空（带出工厂对象拿到 undefined）。
    factories.value = ((res.data ?? res) ?? []).map((f: any) => ({ ...f, id: Number(f.id) }));
  } catch {
    factories.value = [];
  }
});
</script>
