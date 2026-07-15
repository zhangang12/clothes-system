<template>
  <!-- 按款号搜合同→选合同(带出工厂)。用于对账/付款「有合同」路径:免手填数字合同/工厂ID。 -->
  <div>
    <el-input v-model="styleInput" :placeholder="placeholder" clearable @keyup.enter="search" @clear="contracts = []">
      <template #append><el-button :loading="loading" @click="search">搜合同</el-button></template>
    </el-input>
    <el-select
      v-if="contracts.length"
      :model-value="modelValue"
      filterable clearable
      placeholder="选合同（带出工厂）"
      style="width:100%;margin-top:6px"
      @update:model-value="(v: any) => emit('update:modelValue', (v == null || v === '') ? undefined : Number(v))"
      @change="onPick"
    >
      <el-option v-for="c in contracts" :key="c.id" :label="labelOf(c)" :value="c.id" />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { errToast } from '@/api';
import { contractApi } from '@/api/contract';

withDefaults(defineProps<{ modelValue?: number; placeholder?: string }>(), {
  modelValue: undefined, placeholder: '输入款号搜合同（有合同付款用，带出工厂）',
});
const emit = defineEmits<{
  (e: 'update:modelValue', v: number | undefined): void;
  (e: 'pick', c: any | undefined): void;
}>();

const styleInput = ref('');
const contracts = ref<any[]>([]);
const loading = ref(false);
const typeCn = (t: string) => ({ MATERIAL: '材料', PROCESS: '加工', SUPPLEMENT: '补料' } as any)[t] ?? t;
const labelOf = (c: any) =>
  `${c.contract_no} · ${c.factory_name || ('工厂#' + c.factory_id)} · ${typeCn(c.type)}`
  + (c.total_amount != null ? ` · ¥${Number(c.total_amount).toFixed(2)}` : '');
async function search() {
  const s = styleInput.value.trim();
  if (!s) { ElMessage.warning('请输入款号'); return; }
  loading.value = true;
  try {
    const res: any = await contractApi.byStyle(s);
    contracts.value = (res.data ?? res) ?? [];
    if (!contracts.value.length) ElMessage.info('该款号下未找到合同');
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? '查询合同失败');
  } finally { loading.value = false; }
}
function onPick(id?: number) {
  emit('pick', contracts.value.find((c) => c.id === id));
}
defineExpose({ reset: () => { styleInput.value = ''; contracts.value = []; } });
</script>
