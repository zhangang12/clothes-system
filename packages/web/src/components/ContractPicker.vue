<template>
  <!-- 按款号搜合同→选合同(带出工厂)。用于对账/付款「有合同」路径:免手填数字合同/工厂ID。 -->
  <div>
    <el-input v-model="styleInput" :placeholder="placeholder" clearable @keyup.enter="search" @clear="onClearStyle">
      <template #append><el-button :loading="loading" @click="search">搜合同</el-button></template>
    </el-input>
    <el-select
      v-if="contracts.length"
      :model-value="shownValue"
      filterable clearable
      placeholder="选合同（带出工厂）"
      style="width:100%;margin-top:6px"
      @update:model-value="onInput"
      @change="onPick"
    >
      <el-option v-for="c in contracts" :key="c.id" :label="labelOf(c)" :value="c.id" />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { errToast } from '@/api';
import { contractApi } from '@/api/contract';

const props = withDefaults(defineProps<{ modelValue?: number; placeholder?: string }>(), {
  modelValue: undefined, placeholder: '输入款号搜合同（有合同付款用，带出工厂）',
});
const emit = defineEmits<{
  (e: 'update:modelValue', v: number | undefined): void;
  (e: 'pick', c: any | undefined): void;
}>();

const styleInput = ref('');
const contracts = ref<any[]>([]);
const loading = ref(false);
// 付款申请只借本组件带出工厂、并不存 contract_id，故父组件不绑 v-model。
// 那样 modelValue 恒为 undefined，选完合同框会弹回占位文字、看不到自己选了啥。
// 这里自带一份内部选中值：绑了 v-model 就听父组件的，没绑就自己记。
const inner = ref<number | undefined>(undefined);
const shownValue = computed(() => props.modelValue ?? inner.value);
function onInput(v: any) {
  const id = (v == null || v === '') ? undefined : Number(v);
  inner.value = id;
  emit('update:modelValue', id);
}
const typeCn = (t: string) => ({ MATERIAL: '材料', PROCESS: '加工', SUPPLEMENT: '补料' } as any)[t] ?? t;
const labelOf = (c: any) =>
  `${c.contract_no} · ${c.factory_name || ('工厂#' + c.factory_id)} · ${typeCn(c.type)}`
  + (c.total_amount != null ? ` · ¥${Number(c.total_amount).toFixed(2)}` : '');
function onClearStyle() { contracts.value = []; inner.value = undefined; }
async function search() {
  const s = styleInput.value.trim();
  if (!s) { ElMessage.warning('请输入款号'); return; }
  loading.value = true;
  try {
    const res: any = await contractApi.byStyle(s);
    // id/factory_id 规范成数字：bigint 主键经 mysql2 出来是字符串（JSON 里是 "3"），
    // 而回传父组件的是 Number(v)。类型不一致会让 el-select 匹配不到选项（显示成
    // 原始 ID 而非合同号），且下面 onPick 的 find 永远落空 → 带出工厂静默失效。
    contracts.value = ((res.data ?? res) ?? []).map((c: any) => ({
      ...c, id: Number(c.id), factory_id: c.factory_id == null ? c.factory_id : Number(c.factory_id),
    }));
    if (!contracts.value.length) ElMessage.info('该款号下未找到合同');
  } catch (e: any) {
    errToast(e?.response?.data?.msg ?? '查询合同失败');
  } finally { loading.value = false; }
}
function onPick(id?: number) {
  emit('pick', contracts.value.find((c) => c.id === id));
}
defineExpose({ reset: () => { styleInput.value = ''; contracts.value = []; inner.value = undefined; } });
</script>
