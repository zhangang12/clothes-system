import { describe, it, expect, vi } from 'vitest';
import { parseCsv, decodeSheetText, readGrid } from '../sheetGrid';

/** 造一个「文件」：jsdom 的 File 没实现 arrayBuffer()，这里只喂 readGrid 真正用到的两样 */
const fileOf = (name: string, data: Uint8Array | string): File => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return { name, arrayBuffer: async () => bytes.buffer } as unknown as File;
};

/** 把中文按 GBK 编码——jsdom 没有 GBK 编码器，用码点表手拼这几个字够用了 */
const GBK = { 款: [0xbf, 0xee], 号: [0xba, 0xc5], 颜: [0xd1, 0xd5], 色: [0xc9, 0xab] } as const;
const gbkBytes = (s: string) => new Uint8Array(
  [...s].flatMap((ch) => (GBK as any)[ch] ?? [ch.charCodeAt(0)]),
);

describe('CSV 解析', () => {
  it('引号里的逗号不拆列', () => {
    expect(parseCsv('款号,颜色\nA,"红,蓝"')).toEqual([['款号', '颜色'], ['A', '红,蓝']]);
  });

  it('转义的双引号还原成一个', () => {
    expect(parseCsv('a\n"他说""好"""')[1][0]).toBe('他说"好"');
  });

  it('CRLF 与全空行都处理掉', () => {
    expect(parseCsv('a,b\r\n1,2\r\n,\r\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('吃掉 Excel 写在开头的 BOM，否则第一列表头永远对不上', () => {
    expect(parseCsv('﻿款号,颜色')[0][0]).toBe('款号');
  });
});

describe('文本编码', () => {
  it('UTF-8 正常读', () => {
    const buf = new TextEncoder().encode('款号,颜色').buffer;
    expect(decodeSheetText(buf)).toBe('款号,颜色');
  });

  it('中文 Windows 的 GBK 文件要能读出来——否则整片是问号，界面只会报「款号为空」', () => {
    // 先证明这份字节确实不是合法 UTF-8（否则这条用例等于没测）
    expect(new TextDecoder('utf-8').decode(gbkBytes('款号,颜色').buffer)).toContain('�');
    expect(decodeSheetText(gbkBytes('款号,颜色').buffer)).toBe('款号,颜色');
  });
});

describe('读成网格', () => {
  const xlsxStub = vi.fn(async () => [{ rows: [['款号', '颜色'], ['A', '黑']] }, { rows: [['别的表']] }]);

  it('xlsx 走解析器，只取第一个工作表', async () => {
    const rows = await readGrid(fileOf('模板.xlsx', 'zip-bytes'), xlsxStub);
    expect(rows).toEqual([['款号', '颜色'], ['A', '黑']]);
  });

  it('xlsx 第一个表是空的时候，说清楚该把模板放哪儿', async () => {
    const empty = vi.fn(async () => [{ rows: [] }]);
    await expect(readGrid(fileOf('空.xlsx', 'x'), empty)).rejects.toThrow(/第一个 Sheet/);
  });

  it('.xls 老格式直接说怎么办，别让人反复试', async () => {
    await expect(readGrid(fileOf('旧.xls', 'x'), xlsxStub)).rejects.toThrow(/另存为.*\.xlsx/);
  });

  it('csv 照旧能读', async () => {
    const rows = await readGrid(fileOf('a.csv', '款号,颜色\nA,黑'), xlsxStub);
    expect(rows).toEqual([['款号', '颜色'], ['A', '黑']]);
  });

  it('不认识扩展名时按文本读，不直接拒绝——有人会把 csv 存成 .txt', async () => {
    const rows = await readGrid(fileOf('a.txt', '款号,颜色'), xlsxStub);
    expect(rows).toEqual([['款号', '颜色']]);
  });
});
