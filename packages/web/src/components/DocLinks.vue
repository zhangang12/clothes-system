<!-- 单据间快速跳转 —— 在单据页上直接列出关联单据(显示单号,不是裸 ID),一点直达,
     不必回主页一层层重找。上游(报价←订单←合同)是 1:1 直链;下游(合同→多张对账)是 1:N,
     逐张列 chip。目标页没有独立详情页时(对账/结算/发票)跳 :id/view 由列表页开弹框;
     付款没有任何详情 UI,故跳其列表并按来源单据过滤(见各页 to 的构造)。 -->
<template>
  <div v-if="links.length || loading" class="doc-links">
    <span class="dl-label">{{ label }}</span>
    <el-icon v-if="loading" class="dl-loading"><Loading /></el-icon>
    <template v-else>
      <el-tag
        v-for="l in links"
        :key="l.key ?? l.text"
        size="small"
        class="dl-tag"
        :type="l.type ?? 'info'"
        effect="plain"
        @click="go(l)"
      >
        {{ l.text }}
      </el-tag>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useRouter, type RouteLocationRaw } from 'vue-router';
import { Loading } from '@element-plus/icons-vue';

export interface DocLink {
  /** chip 上显示的文字，务必用单据号而不是 ID —— 业务不认 ID */
  text: string;
  to: RouteLocationRaw;
  key?: string | number;
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

withDefaults(defineProps<{ links: DocLink[]; label?: string; loading?: boolean }>(), {
  label: '关联单据：',
  loading: false,
});

const router = useRouter();
function go(l: DocLink) {
  router.push(l.to);
}
</script>

<style scoped>
.doc-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.dl-label { color: var(--el-text-color-secondary); font-weight: 600; }
.dl-tag { cursor: pointer; }
.dl-tag:hover { text-decoration: underline; }
.dl-loading { color: var(--el-text-color-secondary); }
</style>
