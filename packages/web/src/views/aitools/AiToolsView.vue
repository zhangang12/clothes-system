<template>
  <div class="page-container">
    <div class="intro">
      <h2>AI 工具集</h2>
      <p>
        把「人拿着一份源文件、对着计算器抠出另外几份表」的活拆成可复用的场景。
        每个场景一张卡片，点进去上传源文件即可出结果——不落库、不改主流程，跑通了再决定要不要接进单据链路。
      </p>
    </div>

    <div class="grid">
      <div v-for="s in scenes" :key="s.key" class="scene" :class="{ soon: !s.ready }">
        <div class="scene-top">
          <span class="badge">{{ s.badge }}</span>
          <span v-if="!s.ready" class="soon-tag">规划中</span>
        </div>
        <h3>{{ s.title }}</h3>
        <p class="desc">{{ s.desc }}</p>
        <ul class="io">
          <li><b>输入</b>{{ s.input }}</li>
          <li><b>输出</b><span class="outs"><span v-for="o in s.outputs" :key="o" class="out">{{ o }}</span></span></li>
        </ul>
        <div class="scene-foot">
          <el-button v-if="s.ready" type="primary" @click="$router.push(s.to!)">进入场景</el-button>
          <el-button v-else disabled>敬请期待</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 【AI工具集】首页。新增场景 = 往 scenes 里加一条 + 建一个路由，卡片栅格自动排。
interface Scene {
  key: string;
  badge: string;
  title: string;
  desc: string;
  input: string;
  outputs: string[];
  ready: boolean;
  to?: string;
}

const scenes: Scene[] = [
  {
    key: 'customs-docs',
    badge: '场景 1',
    title: '清关单据生成',
    desc: '一次出运要四份表，只有工厂给的采购合同 PO 是「源」，另外三份全靠人拿计算器从 PO 抠。本场景按每个款号、每个颜色、每个尺码的件数自动装箱，一次把三份出齐——三份共用同一次解析与同一次装箱，件数天然对得上。',
    input: '工厂采购合同 PO（.xlsx，一表一单号）',
    outputs: ['箱单 PACKING LIST', '发票 INVOICE', '装柜计划 LOADING PLAN'],
    ready: true,
    to: '/ai-tools/customs-docs',
  },
];
</script>

<style scoped>
.intro { margin-bottom: 18px; }
.intro h2 { margin: 0 0 6px; font-size: 20px; color: var(--gray-9); }
.intro p { margin: 0; max-width: 900px; font-size: 13px; line-height: 1.7; color: var(--gray-5); }

.grid {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
}

.scene {
  display: flex; flex-direction: column;
  background: #fff; border: 1px solid var(--gray-1); border-radius: var(--r-lg);
  padding: 18px 20px 16px; box-shadow: var(--shadow-xs);
  transition: box-shadow 0.18s var(--ease), transform 0.18s var(--ease);
}
.scene:not(.soon):hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.scene.soon { background: var(--gray-0); }

.scene-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.badge {
  display: inline-block; padding: 2px 10px; border-radius: 999px;
  background: var(--indigo); color: #fff; font-size: 12px; font-weight: 600; letter-spacing: 1px;
}
.soon-tag { font-size: 12px; color: var(--gray-3); }

.scene h3 { margin: 0 0 8px; font-size: 17px; color: var(--gray-9); }
.desc { margin: 0 0 12px; font-size: 13px; line-height: 1.7; color: var(--gray-5); }

.io { margin: 0 0 14px; padding: 10px 12px; list-style: none; background: var(--canvas); border-radius: var(--r); }
.io li { display: flex; gap: 4px; font-size: 12px; color: var(--gray-7); line-height: 1.9; }
.io b { flex: none; width: 40px; color: var(--gray-5); font-weight: 600; }
.outs { display: flex; flex-wrap: wrap; gap: 6px; }
.out {
  padding: 1px 8px; border-radius: 999px; line-height: 1.7;
  background: #fff; border: 1px solid var(--gray-1); color: var(--indigo);
}

.scene-foot { margin-top: auto; }

@media (prefers-reduced-motion: reduce) {
  .scene, .scene:hover { transition: none; transform: none; }
}
</style>
