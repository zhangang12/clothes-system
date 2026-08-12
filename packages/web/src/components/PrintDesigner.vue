<template>
  <el-dialog
    v-model="visible" title="打印排版" width="1080px" top="4vh"
    append-to-body destroy-on-close class="pd-dialog" @open="reload"
  >
    <div class="pd">
      <!-- 左：元素面板 -->
      <div class="pd-panel">
        <div class="pd-sec">
          <label>纸张</label>
          <el-radio-group v-model="layout.paper" size="small">
            <el-radio-button value="A4">竖版</el-radio-button>
            <el-radio-button value="A4L">横版</el-radio-button>
          </el-radio-group>
        </div>
        <div class="pd-sec">
          <label>字号</label>
          <el-slider v-model="layout.fontSize" :min="9" :max="16" :step="1" show-stops style="width:150px" />
          <span class="pd-num">{{ layout.fontSize }}px</span>
        </div>

        <div class="pd-sec">
          <label>行高</label>
          <el-slider v-model="rowPad" :min="0" :max="10" :step="1" show-stops style="width:150px" />
          <span class="pd-num">{{ rowPad }}px</span>
        </div>

        <p class="pd-tip">拖动 ⠿ 调顺序，取消勾选即不打印。<b>列越少越容易一行打完</b>；行高调小更省纸。</p>
        <!-- 列宽超纸时给出可操作的提示：这正是「一个字一行」的成因 -->
        <el-alert v-if="overWidth > 0" type="warning" :closable="false" show-icon style="margin:6px 0">
          <template #title>
            <div>各列宽度合计已超出纸宽约 <b>{{ overWidth }}px</b>，打出来会挤成「一个字一行」。</div>
            <div style="margin-top:2px">可以：改<b>横版</b>、去掉几列、或把下面某几列的宽度调小。</div>
          </template>
        </el-alert>

        <!-- 区块 -->
        <div class="pd-group">
          <div class="pd-group-hd">页面区块</div>
          <ul class="pd-list">
            <li
              v-for="(b, i) in layout.blocks" :key="b.key"
              draggable="true" :class="{ off: !b.on, drag: dragKey === b.key }"
              @dragstart="onDragStart('blocks', b.key)" @dragover.prevent="onDragOver('blocks', i)"
              @drop.prevent="onDrop" @dragend="dragKey = ''"
            >
              <span class="grip">⠿</span>
              <el-checkbox v-model="b.on">{{ blockLabel(b.key) }}</el-checkbox>
            </li>
          </ul>
        </div>

        <!-- 基本信息字段 -->
        <div class="pd-group">
          <div class="pd-group-hd">
            基本信息 · 字段
            <span class="pd-count">{{ metaOn.length }}/{{ ALL_META.length }}</span>
          </div>
          <ul class="pd-list">
            <li
              v-for="(k, i) in metaOrder" :key="k"
              draggable="true" :class="{ off: !metaSet.has(k), drag: dragKey === k }"
              @dragstart="onDragStart('meta', k)" @dragover.prevent="onDragOver('meta', i)"
              @drop.prevent="onDrop" @dragend="dragKey = ''"
            >
              <span class="grip">⠿</span>
              <el-checkbox :model-value="metaSet.has(k)" @change="(v: any) => toggle('meta', k, v)">
                {{ metaLabel(k) }}
              </el-checkbox>
            </li>
          </ul>
        </div>

        <!-- 材料明细列 -->
        <div class="pd-group">
          <div class="pd-group-hd">
            材料明细 · 列
            <span class="pd-count">{{ layout.matCols.length }}/{{ ALL_COLS.length }}</span>
          </div>
          <ul class="pd-list">
            <li
              v-for="(k, i) in colOrder" :key="k"
              draggable="true" :class="{ off: !colSet.has(k), drag: dragKey === k }"
              @dragstart="onDragStart('cols', k)" @dragover.prevent="onDragOver('cols', i)"
              @drop.prevent="onDrop" @dragend="dragKey = ''"
            >
              <span class="grip">⠿</span>
              <el-checkbox :model-value="colSet.has(k)" @change="(v: any) => toggle('cols', k, v)">
                {{ colLabel(k) }}
              </el-checkbox>
              <!-- 列宽（px）。留空＝自适应，适合品名/备注这类长文本 -->
              <el-input-number
                v-if="colSet.has(k)" :model-value="colWidthOf(k)" @update:model-value="(v: any) => setColWidth(k, v)"
                :min="20" :max="400" :step="10" :controls="false" size="small" placeholder="自适应"
                class="pd-w"
              />
            </li>
          </ul>
        </div>
      </div>

      <!-- 右：实时预览（与真打印同一份 HTML） -->
      <div class="pd-preview">
        <div class="pd-preview-hd">
          实时预览
          <span class="pd-hint">这就是打出来的样子；纸张边距由浏览器打印设置控制</span>
        </div>
        <div class="pd-paper-wrap">
          <iframe ref="frame" class="pd-paper" :class="{ land: layout.paper === 'A4L' }" :srcdoc="html" />
        </div>
      </div>
    </div>

    <template #footer>
      <el-button link @click="restoreDefault">恢复默认</el-button>
      <span class="pd-foot-tip">排版只存在这台电脑，换电脑需重设</span>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :icon="Printer" @click="confirm">保存并打印</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue';
import { Printer } from '@element-plus/icons-vue';
import {
  SAMPLE_BLOCKS, SAMPLE_META_FIELDS, SAMPLE_MAT_COLS,
  DEFAULT_SAMPLE_LAYOUT, buildSampleHtml, defaultColWidth,
} from '@/utils/samplePrint';
import { loadLayout, saveLayout, resetLayout, type PrintLayout } from '@/utils/printLayout';

const props = withDefaults(defineProps<{ docKey?: string }>(), { docKey: 'sample' });
const emit = defineEmits<{ (e: 'print', layout: PrintLayout): void }>();

const ALL_META = SAMPLE_META_FIELDS;
const ALL_COLS = SAMPLE_MAT_COLS;
const blockLabel = (k: string) => SAMPLE_BLOCKS.find((b) => b.key === k)?.label ?? k;
const metaLabel = (k: string) => ALL_META.find((f) => f.key === k)?.label ?? k;
const colLabel = (k: string) => ALL_COLS.find((c) => c.key === k)?.label ?? k;

const visible = ref(false);
const detail = ref<any>({});
const layout = reactive<PrintLayout>({ ...DEFAULT_SAMPLE_LAYOUT, blocks: [], metaFields: [], matCols: [] });

// 勾选与顺序分开存：取消勾选再勾回来，位置不会跳走。
// metaOrder/colOrder 是「全部项」的排列，metaFields/matCols 只保留其中勾上的（且保持该顺序）。
const metaOrder = ref<string[]>([]);
const colOrder = ref<string[]>([]);
const metaSet = computed(() => new Set(layout.metaFields));
const colSet = computed(() => new Set(layout.matCols));

// ── 行高与列宽（2026-08-12 YSM #85：「打印面的行高不能调整吗？一个字一行，很浪费纸」）──
// 行高单独用一个 computed 包一层：0 是合法值（最省纸），直接 v-model 到可选字段上
// 会因为 `|| 4` 之类的兜底把 0 变回 4。
const rowPad = computed({
  get: () => (Number.isFinite(Number(layout.rowPad)) ? Number(layout.rowPad) : 4),
  set: (v: number) => { layout.rowPad = v; },
});

const colWidthOf = (k: string): number | undefined => {
  const w = layout.colWidths?.[k];
  return Number.isFinite(Number(w)) && Number(w) > 0 ? Number(w) : defaultColWidth(k) || undefined;
};
function setColWidth(k: string, v: any) {
  if (!layout.colWidths) layout.colWidths = {};
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) delete layout.colWidths[k];   // 清空＝回到自适应
  else layout.colWidths[k] = Math.round(n);
}

// 纸宽减去 14mm×2 页边距，按 96dpi 折算：A4 竖版约 680px、横版约 1017px。
// 只是给个提醒，不做强制——业务自己知道要不要挤。
const paperInnerPx = computed(() => (layout.paper === 'A4L' ? 1017 : 680));
const overWidth = computed(() => {
  const sum = layout.matCols.reduce((acc, k) => acc + (colWidthOf(k) ?? 0), 0);
  // 有自适应列时至少给它们留 60px，否则"刚好等于纸宽"其实已经把长文本挤没了
  const autoCount = layout.matCols.filter((k) => !colWidthOf(k)).length;
  const need = sum + autoCount * 60;
  return need > paperInnerPx.value ? Math.round(need - paperInnerPx.value) : 0;
});
const metaOn = computed(() => layout.metaFields);

function reload() {
  const l = loadLayout(props.docKey, DEFAULT_SAMPLE_LAYOUT);
  Object.assign(layout, l);
  // 已选的排前（保持存档顺序），未选的按默认顺序补后面，方便随时勾回来
  const rest = <T extends { key: string }>(all: T[], on: string[]) =>
    [...on.filter((k) => all.some((x) => x.key === k)), ...all.map((x) => x.key).filter((k) => !on.includes(k))];
  metaOrder.value = rest(ALL_META, l.metaFields);
  colOrder.value = rest(ALL_COLS, l.matCols);
}

function toggle(kind: 'meta' | 'cols', key: string, v: boolean) {
  const order = kind === 'meta' ? metaOrder.value : colOrder.value;
  const cur = new Set(kind === 'meta' ? layout.metaFields : layout.matCols);
  if (v) cur.add(key); else cur.delete(key);
  // 始终按 order 的顺序落回数组，保证「勾选集合」与「显示顺序」一致
  const next = order.filter((k) => cur.has(k));
  if (kind === 'meta') layout.metaFields = next; else layout.matCols = next;
}

// ── 拖拽排序（原生 HTML5 DnD，不引第三方）───────────────────────────
const dragKey = ref('');
const dragKind = ref<'blocks' | 'meta' | 'cols' | ''>('');
function onDragStart(kind: 'blocks' | 'meta' | 'cols', key: string) {
  dragKind.value = kind; dragKey.value = key;
}
function onDragOver(kind: 'blocks' | 'meta' | 'cols', overIdx: number) {
  if (dragKind.value !== kind || !dragKey.value) return;
  if (kind === 'blocks') {
    const arr = layout.blocks;
    const from = arr.findIndex((b) => b.key === dragKey.value);
    if (from < 0 || from === overIdx) return;
    const [it] = arr.splice(from, 1);
    arr.splice(overIdx, 0, it);
    return;
  }
  const orderRef = kind === 'meta' ? metaOrder : colOrder;
  const arr = [...orderRef.value];
  const from = arr.indexOf(dragKey.value);
  if (from < 0 || from === overIdx) return;
  arr.splice(overIdx, 0, ...arr.splice(from, 1));
  orderRef.value = arr;
  // 顺序变了，勾选数组也要跟着重排，否则打印出来还是旧顺序
  const cur = new Set(kind === 'meta' ? layout.metaFields : layout.matCols);
  const next = arr.filter((k) => cur.has(k));
  if (kind === 'meta') layout.metaFields = next; else layout.matCols = next;
}
function onDrop() { dragKey.value = ''; dragKind.value = ''; }

// ── 预览：和真打印用同一个生成器，只是不自动调起打印 ──────────────────
const html = ref('');
let timer: any = null;
watch(() => [JSON.stringify(layout), detail.value], () => {
  // 拖拽时会高频触发，节流一下免得预览闪
  clearTimeout(timer);
  timer = setTimeout(() => { html.value = buildSampleHtml(detail.value, layout, false); }, 80);
}, { deep: true, immediate: true });

function restoreDefault() {
  resetLayout(props.docKey);
  reload();
}

function confirm() {
  const plain: PrintLayout = JSON.parse(JSON.stringify(layout));
  saveLayout(props.docKey, plain);
  visible.value = false;
  emit('print', plain);
}

defineExpose({
  open: (d: any) => { detail.value = d ?? {}; visible.value = true; },
});
</script>

<style scoped>
.pd-w { width: 66px; margin-left: auto; }
.pd-w :deep(.el-input__inner) { text-align: center; font-size: 12px; }
.pd { display: flex; gap: 14px; height: 66vh; }
.pd-panel { width: 300px; flex: none; overflow: auto; padding-right: 4px; }
.pd-sec { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.pd-sec > label { width: 34px; color: var(--el-text-color-regular); }
.pd-num { font-size: 12px; color: var(--el-text-color-secondary); }
.pd-tip { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; margin: 6px 0 10px; }
.pd-group { margin-bottom: 12px; }
.pd-group-hd { font-size: 12px; font-weight: 600; color: var(--el-text-color-regular); margin-bottom: 4px; display: flex; justify-content: space-between; }
.pd-count { font-weight: 400; color: var(--el-text-color-placeholder); }
.pd-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; }
.pd-list li { display: flex; align-items: center; gap: 6px; padding: 2px 8px; border-bottom: 1px solid var(--el-border-color-lighter); cursor: grab; }
.pd-list li:last-child { border-bottom: 0; }
.pd-list li.off { opacity: .45; }
.pd-list li.drag { background: var(--el-color-primary-light-9); }
.grip { color: var(--el-text-color-placeholder); font-size: 12px; user-select: none; }

.pd-preview { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pd-preview-hd { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.pd-hint { font-weight: 400; color: var(--el-text-color-placeholder); margin-left: 6px; }
.pd-paper-wrap { flex: 1; overflow: auto; background: var(--el-fill-color-light); padding: 10px; border-radius: 4px; }
/* A4 在 96dpi 下约 794px 宽；横版 1123px。给个白纸底，直观看出会不会撑破 */
.pd-paper { width: 794px; min-height: 1000px; border: 0; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.12); display: block; margin: 0 auto; }
.pd-paper.land { width: 1123px; }
.pd-foot-tip { font-size: 12px; color: var(--el-text-color-placeholder); margin-right: auto; margin-left: 10px; }
:deep(.el-dialog__footer) { display: flex; align-items: center; }
</style>
