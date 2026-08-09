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

// ── 2026-08-09 用户录屏实证的数据损坏 ─────────────────────────────────
// 现象：在合同材料明细里用 ↑ 从 3XL 走到 XL，沿途每格数量都被 +1（125→126、440→441），
// 无任何提示。根因是本指令原先挂在**冒泡阶段**，而 el-input-number 把方向键处理绑在
// 内层 <input> 上（目标阶段先跑），等事件冒到容器时数值早就改了。
//
// 【为什么原来的用例没发现】上面那几条用的是普通 <input>——它压根不会自增，
// 所以"值有没有被改"这件事在那些用例里根本不可观测。这里必须造一个会自增的输入框，
// 才能真正复现并守住。
function makeNumberGrid(): { cells: HTMLInputElement[][]; values: number[][] } {
  const wrap = document.createElement('div');
  const cells: HTMLInputElement[][] = [];
  const values: number[][] = [];
  for (let r = 0; r < 3; r++) {
    const tr = document.createElement('tr');
    const row: HTMLInputElement[] = [];
    const vals: number[] = [];
    for (let c = 0; c < 2; c++) {
      const input = document.createElement('input');
      input.value = String(100 + r * 10 + c);
      vals.push(Number(input.value));
      // 模拟 el-input-number：自己在 input 上监听方向键做加减
      input.addEventListener('keydown', (e) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'ArrowUp') input.value = String(Number(input.value) + 1);
        if (ke.key === 'ArrowDown') input.value = String(Number(input.value) - 1);
      });
      const td = document.createElement('td');
      td.appendChild(input);
      tr.appendChild(td);
      row.push(input);
    }
    wrap.appendChild(tr);
    cells.push(row);
    values.push(vals);
  }
  document.body.appendChild(wrap);
  (vKeynav as any).mounted(wrap);
  return { cells, values };
}

describe('数字输入框：方向键只移动、绝不改数值', () => {
  it('↑ 上移时当前格的数值不被 +1（录屏里 125→126 那条）', () => {
    const { cells } = makeNumberGrid();
    const cur = cells[2][0];
    cur.focus();
    press(cur, 'ArrowUp');
    expect(document.activeElement).toBe(cells[1][0]);
    expect(cur.value).toBe('120');       // 原值，没被改
  });

  it('连按两次 ↑ 穿过中间行，中间那格也不能被改（440→441 那条）', () => {
    const { cells } = makeNumberGrid();
    cells[2][0].focus();
    press(cells[2][0], 'ArrowUp');
    press(cells[1][0], 'ArrowUp');
    expect(document.activeElement).toBe(cells[0][0]);
    expect(cells[2][0].value).toBe('120');
    expect(cells[1][0].value).toBe('110'); // 途经格原值
  });

  it('↓ 下移同样不减数值', () => {
    const { cells } = makeNumberGrid();
    cells[0][1].focus();
    press(cells[0][1], 'ArrowDown');
    expect(document.activeElement).toBe(cells[1][1]);
    expect(cells[0][1].value).toBe('101');
  });

  it('边界也要拦：首行按 ↑ 焦点不动，值同样不能变', () => {
    const { cells } = makeNumberGrid();
    const cur = cells[0][0];
    cur.focus();
    press(cur, 'ArrowUp');
    expect(document.activeElement).toBe(cur);
    expect(cur.value).toBe('100');
  });

  it('末行按 ↓ 同理', () => {
    const { cells } = makeNumberGrid();
    const cur = cells[2][1];
    cur.focus();
    press(cur, 'ArrowDown');
    expect(cur.value).toBe('121');
  });

  it('左右键不受影响——光标在文本中间时仍归输入框自己处理', () => {
    const { cells } = makeNumberGrid();
    const cur = cells[1][0];
    cur.focus();
    cur.setSelectionRange(1, 1);
    press(cur, 'ArrowRight');
    expect(document.activeElement).toBe(cur); // 没换格
    expect(cur.value).toBe('110');
  });
});
