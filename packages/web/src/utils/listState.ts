// 列表页「回来还是原样」（2026-09-15 #139/#140 EVA：筛完款号进去改一张报价，关掉回来筛选条件和调过的列宽全没了）。
//
// 【为什么会丢】MainLayout 里 <component :is :key="$route.fullPath">——每次切路由列表页都整体重建
// （key 不能去：同一编辑页换 :id 必须重建，见 MainLayout 注释），组件里的 query / 列宽自然回到初始值。
// 不上 keep-alive：几十个页面的缓存失效、关页签时清缓存都要另起一套，风险比收益大。
// 这里只把「用户手动调过的东西」存下来，重建时还原：
//   - 筛选条件、页码 → sessionStorage（跟页签同寿命：浏览器标签页关了就清，不会串到明天）
//   - 列宽 → localStorage（个人偏好，长期有效；只存拖过的列）
import { watch, isRef, ref, onMounted, nextTick, type Ref } from 'vue';
import { useRoute } from 'vue-router';

type Persistable = Record<string, any> | Ref<any>;

const LIST_PREFIX = 'i9.list.';
const COLW_PREFIX = 'i9.colw.';

function readJson(storage: Storage | undefined, key: string): any {
  try { const raw = storage?.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeJson(storage: Storage | undefined, key: string, value: unknown): void {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* 隐私模式/存满：不记，不影响页面 */ }
}
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);

/**
 * 登出/换账号时清掉列表筛选记忆（B144）：sessionStorage 跟标签页同寿命，同一个标签页里换账号登录，
 * 上一个人的关键词/页码会原样还原到下一个人的列表上。列宽是个人偏好、不带业务信息，不清。
 */
export function clearListState(): void {
  try {
    const st = session();
    if (!st) return;
    for (let i = st.length - 1; i >= 0; i--) {
      const k = st.key(i);
      if (k && k.startsWith(LIST_PREFIX)) st.removeItem(k);
    }
  } catch { /* 隐私模式/无 storage：忽略 */ }
}

/**
 * 记住列表页的筛选状态。在 setup 里、onMounted(load) 之前调用即可（还原是同步的，首次加载就用上）。
 *
 * - `states`：要记的对象，reactive 的 query 或 ref（日期范围、高级筛选展开、页签）
 * - `omit`：不记的字段——**只由跳转带入、检索区没有输入框的条件**必须排除，
 *   否则下次打开会被一个看不见的条件悄悄过滤（如付款页的 reconcile_id）
 * - 路由带了查询参数（从别的单据跳过来）时不还原：那是明确要看某个范围，以跳转为准
 */
export function useListState(key: string, states: Record<string, Persistable>, opts: { omit?: string[] } = {}): void {
  const storeKey = LIST_PREFIX + key;
  const omit = new Set(opts.omit ?? []);
  let deepLinked = false;
  try { deepLinked = Object.keys(useRoute()?.query ?? {}).length > 0; } catch { /* 无路由上下文（单测）按未跳转处理 */ }

  const snapshot = () => {
    const out: Record<string, unknown> = {};
    for (const [name, s] of Object.entries(states)) {
      if (isRef(s)) out[name] = s.value;
      else out[name] = Object.fromEntries(Object.entries(s).filter(([k]) => !omit.has(k)));
    }
    return out;
  };

  if (!deepLinked) {
    const saved = readJson(session(), storeKey);
    if (saved && typeof saved === 'object') {
      for (const [name, s] of Object.entries(states)) {
        if (!(name in saved)) continue;
        const v = saved[name];
        if (isRef(s)) { s.value = v; continue; }
        if (!v || typeof v !== 'object') continue;
        // 只回填页面上本来就有的字段：代码改过字段名后，旧存档里的键不会被塞进 query 变成怪参数
        for (const [k, val] of Object.entries(v)) if (k in s && !omit.has(k)) (s as any)[k] = val;
      }
    }
  }
  watch(snapshot, (v) => writeJson(session(), storeKey, v), { deep: true });
}

/**
 * 记住表格列宽。模板上给 el-table 绑 `ref="<返回的 tableRef>"` 和 `@header-dragend="onHeaderDragend"`。
 * 列按「表头文字」认（没有表头的勾选列/序号列不记）；表头文字改了就回到默认宽度，不会错套到别的列上。
 */
export function useColumnWidths(key: string, existingRef?: Ref<any>) {
  const tableRef = existingRef ?? ref<any>();
  const storeKey = COLW_PREFIX + key;
  const colKey = (c: any) => String(c?.label ?? '').trim();

  function applyColumnWidths(): void {
    const saved = readJson(local(), storeKey);
    if (!saved || typeof saved !== 'object') return;
    const cols: any[] | undefined = tableRef.value?.store?.states?.columns?.value;
    if (!cols?.length) return;
    let changed = false;
    for (const c of cols) {
      const w = Number(saved[colKey(c)]);
      if (!colKey(c) || !(w > 0) || c.width === w) continue;
      // 与 element-plus 拖动表头时的做法一致：直接改列对象的 width，再重新布局
      c.width = w;
      c.realWidth = w;
      changed = true;
    }
    if (changed) tableRef.value?.doLayout?.();
  }

  function onHeaderDragend(newWidth: number, _oldWidth: number, column: any): void {
    const k = colKey(column);
    if (!k || !(newWidth > 0)) return;
    const saved = readJson(local(), storeKey) ?? {};
    saved[k] = Math.round(newWidth);
    writeJson(local(), storeKey, saved);
  }

  onMounted(() => nextTick(applyColumnWidths));
  return { tableRef, onHeaderDragend, applyColumnWidths };
}
