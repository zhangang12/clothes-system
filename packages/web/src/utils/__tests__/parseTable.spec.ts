import { describe, it, expect } from 'vitest';
import { parseTableText, rowsByHeader, rowsPositional } from '../parseTable';

describe('parseTableText（导入解析统一收口）', () => {
  it('逗号 CSV 基础解析 + trim', () => {
    expect(parseTableText('a,b, c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('Tab 分隔（Excel 直接粘贴）', () => {
    expect(parseTableText('厂商名称\t工厂类型\n东莞华利\t辅料供应商')).toEqual([
      ['厂商名称', '工厂类型'],
      ['东莞华利', '辅料供应商'],
    ]);
  });

  it('引号包裹的逗号不破列、内嵌换行不断行', () => {
    const text = '名称,备注\n"东莞市XX，有限公司","第一行\n第二行"\n下一家,无';
    expect(parseTableText(text)).toEqual([
      ['名称', '备注'],
      ['东莞市XX，有限公司', '第一行\n第二行'],
      ['下一家', '无'],
    ]);
  });

  it('转义双引号（""→"）', () => {
    expect(parseTableText('"说""你好""呀",x')).toEqual([['说"你好"呀', 'x']]);
  });

  it('分号自适应（无逗号无 Tab 时）', () => {
    expect(parseTableText('a;b;c')).toEqual([['a', 'b', 'c']]);
  });

  it('BOM 与 \r 与全空行剔除', () => {
    expect(parseTableText('﻿a,b\r\n\r\n,,\r\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('字段中间的引号按普通字符（松散未转义写法不炸）', () => {
    expect(parseTableText('他说"你好,world,x')).toEqual([['他说"你好', 'world', 'x']]);
  });
});

describe('rowsByHeader', () => {
  it('按表头名映射，列序错排也不怕', () => {
    const grid = [['类型', '名称'], ['辅料', '华利']];
    expect(rowsByHeader(grid, (c) => ({ name: c['名称'], type: c['类型'] }))).toEqual([{ name: '华利', type: '辅料' }]);
  });
});

describe('rowsPositional', () => {
  it('首行像表头则跳过，不像则从第 0 行开始', () => {
    const grid1 = [['客户名称', '款号'], ['CTM', 'S1']];
    expect(rowsPositional(grid1, (c) => c[0], /客户|款号/)).toEqual(['CTM']);
    const grid2 = [['CTM', 'S1'], ['BDS', 'S2']];
    expect(rowsPositional(grid2, (c) => c[0], /客户|款号/)).toEqual(['CTM', 'BDS']);
  });
});
