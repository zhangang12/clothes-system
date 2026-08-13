// 表格行拖拽排序（2026-08-14 EVA #101：「明细行能不能拖着换位置」）
//
// 【为什么不装 sortablejs】页面里已经有 ↑↓ 按钮，缺的只是「一次挪很远」这一种场景，
// 为它引一个第三方库不划算——首屏包刚从 775KB 压到 480KB，不想再加回去。
// 原生 HTML5 拖放够用，这里连指令带逻辑不到 80 行。
//
// 【只认拖拽手柄，不让整行可拖】表格每格都是输入框，整行 draggable 会把
// 「在单元格里选中一段文字」变成拖行——填单的人第一下就会踩到。
//
// 用法：把 v-rowdrag="(from, to) => moveItem(list, from, to)" 挂在表格外层容器上，
//       并在某一列里放 <span class="row-drag-handle">⣿</span>。
import type { Directive, DirectiveBinding } from 'vue';

export const DRAG_HANDLE_CLASS = 'row-drag-handle';

/** 把 list[from] 挪到 to 位置（就地改数组，Vue 响应式能跟上）。越界或原地不动时什么都不做。 */
export function moveItem<T>(list: T[], from: number, to: number): boolean {
  if (!Array.isArray(list)) return false;
  if (from === to) return false;
  if (from < 0 || from >= list.length) return false;
  if (to < 0 || to >= list.length) return false;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return true;
}

type Ctx = { from: number; over: HTMLElement | null };
const ctxOf = new WeakMap<HTMLElement, Ctx>();

/** 事件目标所在的数据行下标；不在表体里返回 -1 */
function rowIndex(target: EventTarget | null): number {
  const tr = (target as HTMLElement | null)?.closest?.('tbody > tr') as HTMLElement | null;
  if (!tr?.parentElement) return -1;
  // el-table 2.x 的固定列是 sticky，不会像老版本那样复制一份表体，所以 tr 与数据行一一对应
  return Array.from(tr.parentElement.children).indexOf(tr);
}

function clearMark(ctx: Ctx) {
  ctx.over?.classList.remove('row-drag-over');
  ctx.over = null;
}

export const vRowdrag: Directive<HTMLElement, (from: number, to: number) => void> = {
  mounted(el, binding: DirectiveBinding<(from: number, to: number) => void>) {
    const ctx: Ctx = { from: -1, over: null };
    ctxOf.set(el, ctx);

    el.addEventListener('mousedown', (e) => {
      // 只有按在手柄上时才把那一行标成可拖，松手后立刻收回：
      // 常驻 draggable 会让整行文字选不中
      const handle = (e.target as HTMLElement)?.closest?.(`.${DRAG_HANDLE_CLASS}`);
      const tr = (e.target as HTMLElement)?.closest?.('tbody > tr') as HTMLElement | null;
      if (handle && tr) tr.setAttribute('draggable', 'true');
    });

    el.addEventListener('dragstart', (e) => {
      ctx.from = rowIndex(e.target);
      if (ctx.from < 0) return;
      // Firefox 不设 data 就不触发 drop
      e.dataTransfer?.setData('text/plain', String(ctx.from));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });

    el.addEventListener('dragover', (e) => {
      if (ctx.from < 0) return;
      e.preventDefault(); // 不拦默认动作就不会触发 drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const tr = (e.target as HTMLElement)?.closest?.('tbody > tr') as HTMLElement | null;
      if (tr === ctx.over) return;
      clearMark(ctx);
      if (tr) { tr.classList.add('row-drag-over'); ctx.over = tr; }
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const to = rowIndex(e.target);
      const from = ctx.from;
      clearMark(ctx);
      ctx.from = -1;
      if (from >= 0 && to >= 0 && from !== to) binding.value?.(from, to);
    });

    // 拖到表格外松手也要复位，否则那行会一直保持 draggable、高亮也擦不掉
    el.addEventListener('dragend', (e) => {
      (e.target as HTMLElement)?.removeAttribute?.('draggable');
      clearMark(ctx);
      ctx.from = -1;
    });
  },
};
