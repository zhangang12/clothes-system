// 表格键盘导航（用户反馈：材料清单填内容要「上下左右」键盘控制，类 Excel 单元格移动）
// 用法：v-keynav 挂在表格容器上（如 .table-scroll 包裹层）。
//  ↑/↓  同列上/下一行（数字输入框不增减数值，改走单元格移动——这正是反馈要的效果）
//
// 【必须挂在捕获阶段】(2026-08-09 用户录屏实证的数据损坏)
// el-input-number 把方向键处理绑在内层 <input> 自己身上，那是**目标阶段**；
// 本指令原先用默认的冒泡阶段监听容器，等事件冒到这里时数值早就被加过了，
// 再调 preventDefault() 也无力回天。表现：用 ↑ 从 3XL 走到 XL，
// 沿途每一格数量都被 +1（125→126、440→441），而且一路无声无息。
// 改为 capture:true + stopPropagation()，事件在到达 input 之前就被截住，
// el-input-number 的加减逻辑根本不会执行。
//
// 【边界也要拦】首行按 ↑ / 末行按 ↓ 虽然不移动焦点，但同样不能让数值变动——
// 原实现只在「找到目标格」时才 preventDefault，边界处等于放行。
//  ←/→  光标已在文本最首/最尾时才切到左/右格（光标在文本中间时保持正常移动，不抢编辑）
// 数字输入框（selectionStart 为 null）←/→ 直接切格。
import type { Directive } from 'vue';

type Cell = { el: HTMLInputElement | HTMLTextAreaElement; row: number; col: number };

function gridOf(container: HTMLElement): Cell[][] {
  const inputs = Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input:not([type=checkbox]):not([type=hidden]):not([disabled]), textarea:not([disabled])',
    ),
  ).filter((el) => el.offsetParent !== null); // 仅可见（排除 display:none）
  const rows = new Map<HTMLElement, (HTMLInputElement | HTMLTextAreaElement)[]>();
  for (const el of inputs) {
    const key = (el.closest('tr') as HTMLElement | null) ?? container;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key)!.push(el);
  }
  return Array.from(rows.values()).map((els, r) => els.map((el, c) => ({ el, row: r, col: c })));
}

/** 截住事件：既不让浏览器做默认动作，也不让它继续走到 input 上（否则数字框会自增） */
function swallow(e: KeyboardEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function handle(e: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const t = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
  const grid = gridOf(e.currentTarget as HTMLElement);
  let cur: Cell | undefined;
  for (const row of grid) { cur = row.find((c) => c.el === t); if (cur) break; }
  if (!cur) return;
  const { row, col } = cur;
  // 上下键一律吞掉：移动交给本指令，数值绝不能被 el-input-number 改动（边界不移动时也照吞）
  const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
  if (vertical) swallow(e);
  let target: Cell | undefined;
  if (e.key === 'ArrowUp' && row > 0) {
    const r = grid[row - 1];
    target = r[Math.min(col, r.length - 1)];
  } else if (e.key === 'ArrowDown' && row < grid.length - 1) {
    const r = grid[row + 1];
    target = r[Math.min(col, r.length - 1)];
  } else if (e.key === 'ArrowLeft' && col > 0) {
    // 文本输入：光标已在最首才左移；数字输入(selectionStart=null)直接移
    if (t.selectionStart === null || (t.selectionStart === 0 && t.selectionEnd === 0)) target = grid[row][col - 1];
  } else if (e.key === 'ArrowRight' && col < grid[row].length - 1) {
    if (t.selectionStart === null || (t.selectionStart === t.value.length && t.selectionEnd === t.value.length)) target = grid[row][col + 1];
  }
  if (target) {
    if (!vertical) swallow(e); // 左右键只在真的换格时才截，光标在文本中间要保持正常编辑
    target.el.focus();
    target.el.select?.();
  }
}

export const vKeynav: Directive<HTMLElement> = {
  // capture:true 是关键，别改回默认的冒泡——见文件头说明
  mounted(el) { el.addEventListener('keydown', handle as EventListener, true); },
  unmounted(el) { el.removeEventListener('keydown', handle as EventListener, true); },
};
