import { describe, it, expect, beforeEach } from 'vitest';
import { vKeynav } from '../tableKeynav';

// jsdom 里 offsetParent 恒为 null——表格键盘导航用 offsetParent 过滤可见性，
// 测试前打桩让元素恒"可见"。
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { get: () => document.body, configurable: true });
});

function makeGrid(): { wrap: HTMLElement; cells: HTMLInputElement[][] } {
  // 2 行 × 3 列文本输入
  const wrap = document.createElement('div');
  const cells: HTMLInputElement[][] = [];
  for (let r = 0; r < 2; r++) {
    const tr = document.createElement('tr');
    const row: HTMLInputElement[] = [];
    for (let c = 0; c < 3; c++) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.value = `r${r}c${c}`;
      td.appendChild(input);
      tr.appendChild(td);
      row.push(input);
    }
    wrap.appendChild(tr);
    cells.push(row);
  }
  document.body.appendChild(wrap);
  (vKeynav as any).mounted(wrap);
  return { wrap, cells };
}

function press(el: HTMLElement, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('v-keynav 表格键盘导航（材料清单上下左右控制）', () => {
  it('↑/↓ 同列上下移动并选中内容', () => {
    const { cells } = makeGrid();
    cells[1][1].focus();
    press(cells[1][1], 'ArrowUp');
    expect(document.activeElement).toBe(cells[0][1]);
    expect(cells[0][1].selectionStart).toBe(0);
    expect(cells[0][1].selectionEnd).toBe(cells[0][1].value.length); // select() 全选
    press(cells[0][1], 'ArrowDown');
    expect(document.activeElement).toBe(cells[1][1]);
  });

  it('首行按 ↑ / 末行按 ↓ 不动', () => {
    const { cells } = makeGrid();
    cells[0][0].focus();
    press(cells[0][0], 'ArrowUp');
    expect(document.activeElement).toBe(cells[0][0]);
    cells[1][2].focus();
    press(cells[1][2], 'ArrowDown');
    expect(document.activeElement).toBe(cells[1][2]);
  });

  it('→ 光标在文本最尾才右移，在中间不抢编辑', () => {
    const { cells } = makeGrid();
    const cur = cells[0][0];
    cur.focus();
    cur.setSelectionRange(1, 1); // 光标在中间
    press(cur, 'ArrowRight');
    expect(document.activeElement).toBe(cur); // 不移动
    cur.setSelectionRange(cur.value.length, cur.value.length); // 光标到最尾
    press(cur, 'ArrowRight');
    expect(document.activeElement).toBe(cells[0][1]);
  });

  it('← 光标在文本最首才左移', () => {
    const { cells } = makeGrid();
    const cur = cells[0][1];
    cur.focus();
    cur.setSelectionRange(2, 2);
    press(cur, 'ArrowLeft');
    expect(document.activeElement).toBe(cur);
    cur.setSelectionRange(0, 0);
    press(cur, 'ArrowLeft');
    expect(document.activeElement).toBe(cells[0][0]);
  });

  it('列数不齐时 ↑ 钳到上一行最后一列', () => {
    const wrap = document.createElement('div');
    const tr1 = document.createElement('tr');
    const a = document.createElement('input');
    tr1.appendChild(a);
    const tr2 = document.createElement('tr');
    const b1 = document.createElement('input');
    const b2 = document.createElement('input');
    tr2.appendChild(b1); tr2.appendChild(b2);
    wrap.appendChild(tr1); wrap.appendChild(tr2);
    document.body.appendChild(wrap);
    (vKeynav as any).mounted(wrap);
    b2.focus();
    press(b2, 'ArrowUp');
    expect(document.activeElement).toBe(a);
  });
});
