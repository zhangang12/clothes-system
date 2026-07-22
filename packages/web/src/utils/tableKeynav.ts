// 表格键盘导航（用户反馈：材料清单填内容要「上下左右」键盘控制，类 Excel 单元格移动）
// 用法：v-keynav 挂在表格容器上（如 .table-scroll 包裹层）。
//  ↑/↓  同列上/下一行（数字输入框不再增减数值，改走单元格移动——这正是反馈要的效果）
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

function handle(e: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const t = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
  const grid = gridOf(e.currentTarget as HTMLElement);
  let cur: Cell | undefined;
  for (const row of grid) { cur = row.find((c) => c.el === t); if (cur) break; }
  if (!cur) return;
  const { row, col } = cur;
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
    e.preventDefault();
    target.el.focus();
    target.el.select?.();
  }
}

export const vKeynav: Directive<HTMLElement> = {
  mounted(el) { el.addEventListener('keydown', handle as EventListener); },
  unmounted(el) { el.removeEventListener('keydown', handle as EventListener); },
};
