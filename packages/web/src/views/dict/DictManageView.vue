<template>
  <div class="page-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>字典维护（下拉自填自动累积，此处可增删）</span>
        </div>
      </template>
      <el-form inline>
        <el-form-item label="字典类别">
          <el-select v-model="curType" filterable style="width:220px" @change="load">
            <el-option v-for="t in TYPES" :key="t.v" :label="`${t.l}（${t.v}）`" :value="t.v" />
          </el-select>
        </el-form-item>
        <el-form-item label="新增条目">
          <el-input v-model="newLabel" placeholder="名称" style="width:180px" @keyup.enter="add" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :disabled="!newLabel.trim()" @click="add">添加</el-button>
        </el-form-item>
      </el-form>
      <el-table :data="items" v-loading="loading" border stripe size="small" style="max-width:720px">
        <el-table-column type="index" label="#" width="56" align="center" />
        <el-table-column prop="label" label="名称" />
        <el-table-column prop="value" label="值" width="140">
          <template #default="{ row }">{{ row.value ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-popconfirm title="删除该条目？（历史单据快照不受影响）" @confirm="remove(row.id)">
              <template #reference><el-button link type="danger" size="small">删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { dictApi, type DictItem } from '@/api/dict';

// 字典维护管理页(P3#38/ORD B5):自填累积的通用字典在此集中治理
const TYPES = [
  { v: 'consignee', l: '收货人台账' },
  { v: 'destination', l: '目的地台账' },
  { v: 'color', l: '颜色' },
  { v: 'size', l: '尺码' },
  { v: 'composition', l: '成份' },
  { v: 'trade_country', l: '贸易国' },
  { v: 'price_terms', l: '价格条款' },
  { v: 'settlement_method', l: '结汇方式' },
  { v: 'currency', l: '币种' },
  { v: 'department', l: '部门' },
  { v: 'title', l: '职务' },
  { v: 'customer_source', l: '客户来源' },
  { v: 'cooperation_level', l: '合作等级' },
  { v: 'fee_item', l: '费用项' },
];

const curType = ref('consignee');
const items = ref<DictItem[]>([]);
const loading = ref(false);
const newLabel = ref('');

async function load() {
  loading.value = true;
  try {
    items.value = ((await dictApi.list(curType.value)) as any).data ?? [];
  } finally { loading.value = false; }
}
async function add() {
  const v = newLabel.value.trim();
  if (!v) return;
  await dictApi.create(curType.value, v);
  newLabel.value = '';
  ElMessage.success('已添加');
  load();
}
async function remove(id: number) {
  await dictApi.remove(id);
  ElMessage.success('已删除');
  load();
}
onMounted(load);
</script>

<style scoped>
.page-container { padding: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
