import { describe, it, expect, vi } from 'vitest';
import { moveItem, vRowdrag, DRAG_HANDLE_CLASS } from '../tableRowDrag';

describe('moveItem 挪行', () => {
  it('把第 1 行挪到第 3 行，中间的行依次前移', () => {
    const list = ['A', 'B', 'C', 'D'];
    expect(moveItem(list, 0, 2)).toBe(true);
    expect(list).toEqual(['B', 'C', 'A', 'D']);
  });

  it('往回挪也对', () => {
    const list = ['A', 'B', 'C', 'D'];
    moveItem(list, 3, 1);
    expect(list).toEqual(['A', 'D', 'B', 'C']);
  });

  it('原地不动时不动数组——不然每拖一下都要重渲染一遍', () => {
    const list = ['A', 'B'];
    expect(moveItem(list, 1, 1)).toBe(false);
    expect(list).toEqual(['A', 'B']);
  });

  it('下标越界一律不动，宁可不响应也不能把行弄丢', () => {
    const list = ['A', 'B'];
    for (const [f, t] of [[-1, 0], [0, -1], [5, 0], [0, 5]] as const) {
      expect(moveItem(list, f, t)).toBe(false);
    }
    expect(list).toEqual(['A', 'B']);
  });
});

/** 造一张 3 行的表，外层容器挂上指令 */
function mountTable() {
  const host = document.createElement('div');
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  for (let i = 0; i < 3; i++) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    const handle = document.createElement('span');
    handle.className = DRAG_HANDLE_CLASS;
    td.appendChild(handle);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  host.appendChild(table);
  document.body.appendChild(host);
  const onMove = vi.fn();
  (vRowdrag as any).mounted(host, { value: onMove });
  const rows = Array.from(tbody.children) as HTMLElement[];
  return { host, rows, onMove, handleOf: (i: number) => rows[i].querySelector(`.${DRAG_HANDLE_CLASS}`) as HTMLElement };
}

/** jsdom 没有 DragEvent，用 Event + 假 dataTransfer 顶上 */
function fire(el: HTMLElement, type: string) {
  const e: any = new Event(type, { bubbles: true, cancelable: true });
  e.dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
  el.dispatchEvent(e);
  return e;
}

describe('v-rowdrag 拖拽排序指令', () => {
  it('从第 1 行拖到第 3 行，回调拿到 (0, 2)', () => {
    const { rows, onMove, handleOf } = mountTable();
    handleOf(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fire(rows[0], 'dragstart');
    fire(rows[2], 'dragover');
    fire(rows[2], 'drop');
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('只有按住手柄才让行可拖——否则单元格里选不中文字', () => {
    const { rows } = mountTable();
    rows[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); // 按在行上、不是手柄
    expect(rows[1].getAttribute('draggable')).toBeNull();
    rows[1].querySelector(`.${DRAG_HANDLE_CLASS}`)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(rows[1].getAttribute('draggable')).toBe('true');
  });

  it('松手后收回 draggable，不然那行会一直处于可拖状态', () => {
    const { rows, handleOf } = mountTable();
    handleOf(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fire(rows[0], 'dragstart');
    fire(rows[0], 'dragend');
    expect(rows[0].getAttribute('draggable')).toBeNull();
  });

  it('dragover 必须拦下默认动作，否则浏览器根本不触发 drop', () => {
    const { rows, handleOf } = mountTable();
    handleOf(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fire(rows[0], 'dragstart');
    const e = fire(rows[1], 'dragover');
    expect(e.defaultPrevented).toBe(true);
  });

  it('原地放下不回调——白挪一次会让整张表重渲染', () => {
    const { rows, onMove, handleOf } = mountTable();
    handleOf(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fire(rows[1], 'dragstart');
    fire(rows[1], 'drop');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('拖到表格外面松手，下一次 dragover 不再画落点线', () => {
    const { host, rows, onMove, handleOf } = mountTable();
    handleOf(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fire(rows[0], 'dragstart');
    fire(rows[2], 'dragover');
    expect(rows[2].classList.contains('row-drag-over')).toBe(true);
    fire(rows[0], 'dragend');
    expect(rows[2].classList.contains('row-drag-over')).toBe(false);
    // 没有正在拖的行时，掉在表上的 drop 不应该乱挪
    fire(rows[1], 'drop');
    expect(onMove).not.toHaveBeenCalled();
    expect(host.isConnected).toBe(true);
  });
});
