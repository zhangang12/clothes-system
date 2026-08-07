<template>
  <el-dialog v-model="visible" title="打印列设置" width="440px" append-to-body @open="reload">
    <div class="tip">
      勾选要打印的列，用 ↑↓ 调顺序。<b>列越少越容易一行打完</b>——用不上的（成份、码带、克重等）取消勾选即可。
      <br>设置只存在这台电脑的浏览器里，换电脑需重设。
    </div>

    <ul class="col-list">
      <li v-for="(c, i) in ordered" :key="c.key" :class="{ off: !checked.has(c.key) }">
        <el-checkbox :model-value="checked.has(c.key)" @change="(v: any) => toggle(c.key, v)">{{ c.label }}</el-checkbox>
        <span class="ops">
          <el-button link size="small" :disabled="i === 0" @click="move(i, -1)">↑</el-button>
          <el-button link size="small" :disabled="i === ordered.length - 1" @click="move(i, 1)">↓</el-button>
        </span>
      </li>
    </ul>

    <div v-if="!checked.size" class="warn">至少要勾一列</div>

    <template #footer>
      <el-button link @click="restoreDefault">恢复默认</el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!checked.size" @click="confirm">保存并打印</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { SAMPLE_MAT_COLS, DEFAULT_MAT_COL_KEYS, type MatCol } from '@/utils/samplePrint';
import { loadPrintCols, savePrintCols, resetPrintCols } from '@/utils/printCols';

const props = withDefaults(defineProps<{ docKey?: string }>(), { docKey: 'sample' });
const emit = defineEmits<{ (e: 'confirm', keys: string[]): void }>();

const visible = ref(false);
// order 是「全部列」的排列，checked 决定其中哪些真打印——
// 这样取消勾选再勾回来，位置不会跳走
const order = ref<string[]>([]);
const checked = ref<Set<string>>(new Set());

const ordered = computed<MatCol[]>(() => {
  const all = new Map(SAMPLE_MAT_COLS.map((c) => [c.key, c]));
  return order.value.map((k) => all.get(k)).filter(Boolean) as MatCol[];
});

function reload() {
  const saved = loadPrintCols(props.docKey) ?? DEFAULT_MAT_COL_KEYS;
  // 已选的排在前（保持保存时的顺序），未选的按默认顺序补在后面，方便随时勾回来
  const rest = SAMPLE_MAT_COLS.map((c) => c.key).filter((k) => !saved.includes(k));
  order.value = [...saved.filter((k) => SAMPLE_MAT_COLS.some((c) => c.key === k)), ...rest];
  checked.value = new Set(saved);
}

function toggle(key: string, v: boolean) {
  const s = new Set(checked.value);
  if (v) s.add(key); else s.delete(key);
  checked.value = s;
}

function move(i: number, d: number) {
  const arr = [...order.value];
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  order.value = arr;
}

function restoreDefault() {
  resetPrintCols(props.docKey);
  reload();
}

function confirm() {
  const keys = order.value.filter((k) => checked.value.has(k));
  if (!keys.length) return;
  savePrintCols(props.docKey, keys);
  visible.value = false;
  emit('confirm', keys);
}

defineExpose({ open: () => { visible.value = true; } });
</script>

<style scoped>
.tip { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7; margin-bottom: 8px; }
.col-list { list-style: none; margin: 0; padding: 0; max-height: 46vh; overflow: auto; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; }
.col-list li { display: flex; align-items: center; justify-content: space-between; padding: 3px 10px; border-bottom: 1px solid var(--el-border-color-lighter); }
.col-list li:last-child { border-bottom: 0; }
.col-list li.off { opacity: .5; }
.ops { white-space: nowrap; }
.warn { color: var(--el-color-danger); font-size: 12px; margin-top: 6px; }
</style>
