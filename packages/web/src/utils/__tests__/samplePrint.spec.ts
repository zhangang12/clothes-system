import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildSampleHtml, printSample, resolveMatCols, resolveMetaFields,
  SAMPLE_MAT_COLS, SAMPLE_META_FIELDS, SAMPLE_BLOCKS, DEFAULT_SAMPLE_LAYOUT,
} from '../samplePrint';
import { loadLayout, saveLayout, resetLayout, type PrintLayout } from '../printLayout';

const detail = {
  sample_no: 'S-1', style_no: 'I27.230.03929', garment_remark: '注意做工',
  materials: [{ item_name: '春亚纺', part: '大身', width: '145', composition: '涤 100%', qty: 3, remark: 'r' }],
  image1: '/a.png',
};
const L = (o: Partial<PrintLayout> = {}): PrintLayout => ({ ...DEFAULT_SAMPLE_LAYOUT, ...o });

/** 材料表的表头文字，按出现顺序。注意 (?:\s[^>]*)? —— [^>]* 会把 <thead> 也当成 <th 匹配进来 */
function headOf(html: string): string[] {
  const t = html.split('材料明细')[1] ?? '';
  return [...t.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/g)].map((m) => m[1]);
}
/** 各区块标题的出现顺序 */
function blockOrder(html: string): string[] {
  return [...html.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1]);
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('材料明细列', () => {
  it('砍掉成份/码带/克重后表头里就没有它们（用户原话：占格子）', () => {
    const head = headOf(buildSampleHtml(detail, L({ matCols: ['idx', 'item_name', 'part', 'qty', 'remark'] })));
    expect(head).toEqual(['#', '品名', '部位', '数量', '备注']);
  });

  it('列顺序按配置走：部位排在品名之后', () => {
    const head = headOf(buildSampleHtml(detail, L({ matCols: ['item_name', 'part'] })));
    expect(head.indexOf('部位')).toBeGreaterThan(head.indexOf('品名'));
  });

  it('数据单元格跟着表头一起减少，不错位', () => {
    const html = buildSampleHtml(detail, L({ matCols: ['item_name', 'part'] }));
    const body = html.split('<tbody>')[1].split('</tbody>')[0];
    expect([...body.matchAll(/<td/g)]).toHaveLength(2);
    expect(body).toContain('春亚纺');
    expect(body).not.toContain('涤 100%'); // 成份没选就不该出现
  });

  it('无材料明细时占位行的 colspan 跟着列数走', () => {
    const html = buildSampleHtml({ sample_no: 'S', materials: [] }, L({ matCols: ['item_name', 'part', 'qty'] }));
    expect(html).toContain('colspan="3"');
  });

  it('认不出的列忽略；全无效则退回默认，绝不产出没有列的表', () => {
    expect(resolveMatCols(['item_name', 'zzz']).map((c) => c.key)).toEqual(['item_name']);
    expect(resolveMatCols(['zzz']).map((c) => c.key)).toEqual(DEFAULT_SAMPLE_LAYOUT.matCols);
  });
});

describe('页面区块', () => {
  it('取消勾选的区块整块不打印', () => {
    const html = buildSampleHtml(detail, L({
      blocks: SAMPLE_BLOCKS.map((b) => ({ key: b.key, on: b.key === 'materials' })),
    }));
    expect(blockOrder(html)).toEqual(['材料明细']);
    expect(html).not.toContain('注意做工'); // 成衣备注被关掉
  });

  it('区块顺序按拖拽后的顺序输出', () => {
    const html = buildSampleHtml(detail, L({
      blocks: [{ key: 'materials', on: true }, { key: 'meta', on: true }],
    }));
    expect(blockOrder(html)).toEqual(['材料明细', '基本信息']);
  });

  it('本来就没内容的区块不会印出空标题（备注为空 / 单轮寄样）', () => {
    const html = buildSampleHtml({ sample_no: 'S', materials: [] }, L());
    expect(html).not.toContain('<h3>成衣备注</h3>');
    expect(html).not.toContain('<h3>寄样轮次</h3>');
  });
});

describe('基本信息字段', () => {
  it('只印勾选的字段，且按配置顺序', () => {
    const html = buildSampleHtml(detail, L({ metaFields: ['sample_no', 'style_no'] }));
    const labels = [...html.matchAll(/<b>(.*?)：<\/b>/g)].map((m) => m[1]);
    // 寄样跟踪区也有 <b>xx：</b>，只取基本信息那段
    const metaPart = html.split('材料明细')[0];
    const metaLabels = [...metaPart.matchAll(/<b>(.*?)：<\/b>/g)].map((m) => m[1]);
    expect(metaLabels).toEqual(['样衣编号', '客户款号']);
    expect(labels).not.toContain('中间商');
  });

  it('认不出的字段忽略；全无效退回默认', () => {
    expect(resolveMetaFields(['style_no', 'zzz']).map((f) => f.key)).toEqual(['style_no']);
    expect(resolveMetaFields(['zzz']).map((f) => f.key)).toEqual(DEFAULT_SAMPLE_LAYOUT.metaFields);
  });
});

describe('纸张与字号', () => {
  it('横版改 @page 方向，并把基本信息排成三列', () => {
    const html = buildSampleHtml(detail, L({ paper: 'A4L' }));
    expect(html).toContain('size: A4 landscape');
    expect(html).toContain('grid-template-columns:1fr 1fr 1fr');
  });

  it('竖版是两列', () => {
    expect(buildSampleHtml(detail, L()).replace(/\s+/g, ' ')).toContain('grid-template-columns:1fr 1fr;');
  });

  it('字号落到正文，标题跟着放大', () => {
    const html = buildSampleHtml(detail, L({ fontSize: 10 }));
    expect(html).toContain('font-size:10px');
    expect(html).toContain('font-size:18px'); // 标题 = 正文 + 8
  });
});

// 这条守住「所见即所得」：操作台的预览和真打印必须是同一份 HTML，
// 只差一个自动调起打印的开关。两边一旦分叉，用户调半天打出来是另一个样。
describe('预览与打印同源', () => {
  it('除 autoPrint 外逐字相同', () => {
    const preview = buildSampleHtml(detail, L(), false);
    const toPrint = buildSampleHtml(detail, L(), true);
    expect(toPrint).toContain('onload="window.print()"');
    expect(preview).not.toContain('window.print()');
    expect(toPrint.replace(' onload="window.print()"', '')).toBe(preview);
  });

  it('printSample 写进新窗口的就是 autoPrint 版', () => {
    let written = '';
    const win: any = { document: { open: vi.fn(), write: (h: string) => { written = h; }, close: vi.fn() } };
    vi.stubGlobal('open', vi.fn().mockReturnValue(win));
    printSample(detail, L());
    expect(written).toBe(buildSampleHtml(detail, L(), true));
  });

  it('弹窗被拦截时给出可操作的提示，而不是静默什么都没发生', () => {
    vi.stubGlobal('open', vi.fn().mockReturnValue(null));
    expect(() => printSample(detail, L())).toThrow('允许弹出窗口');
  });
});

describe('排版方案存取', () => {
  const D = DEFAULT_SAMPLE_LAYOUT;

  it('没配过时返回默认（老用户打开不该发现单据变样）', () => {
    expect(loadLayout('sample', D)).toEqual(D);
  });

  it('存了能读回来', () => {
    saveLayout('sample', { ...D, paper: 'A4L', fontSize: 10, matCols: ['item_name'] });
    const l = loadLayout('sample', D);
    expect(l.paper).toBe('A4L');
    expect(l.fontSize).toBe(10);
    expect(l.matCols).toEqual(['item_name']);
  });

  it('存档里没有的新区块自动补默认值，不会因为版本旧就少印一块', () => {
    saveLayout('sample', { ...D, blocks: [{ key: 'materials', on: true }] });
    const l = loadLayout('sample', D);
    expect(l.blocks[0].key).toBe('materials');
    expect(l.blocks.map((b) => b.key).sort()).toEqual(SAMPLE_BLOCKS.map((b) => b.key).sort());
  });

  it('存坏了/字段越界一律退回默认，不让打印崩掉', () => {
    localStorage.setItem('i9.printLayout.sample', 'not json');
    expect(loadLayout('sample', D)).toEqual(D);
    localStorage.setItem('i9.printLayout.sample', JSON.stringify({ paper: 'A3', fontSize: 999, matCols: [1, 2] }));
    const l = loadLayout('sample', D);
    expect(l.paper).toBe('A4');
    expect(l.fontSize).toBe(D.fontSize);
    expect(l.matCols).toEqual(D.matCols);
  });

  it('迁移上一版只存列的旧键，用户刚配过的不白配', () => {
    localStorage.setItem('i9.printCols.sample', JSON.stringify(['item_name', 'qty']));
    expect(loadLayout('sample', D).matCols).toEqual(['item_name', 'qty']);
  });

  it('恢复默认会把旧键也清掉，否则下次又被迁回来', () => {
    localStorage.setItem('i9.printCols.sample', JSON.stringify(['item_name']));
    saveLayout('sample', { ...D, fontSize: 9 });
    resetLayout('sample');
    expect(loadLayout('sample', D)).toEqual(D);
  });

  it('不同单据互不干扰', () => {
    saveLayout('sample', { ...D, fontSize: 9 });
    expect(loadLayout('contract', D).fontSize).toBe(D.fontSize);
  });

  it('默认列/字段的 key 必须都在全集里（防以后加项时写错）', () => {
    const cols = new Set(SAMPLE_MAT_COLS.map((c) => c.key));
    for (const k of D.matCols) expect(cols.has(k)).toBe(true);
    const metas = new Set(SAMPLE_META_FIELDS.map((f) => f.key));
    for (const k of D.metaFields) expect(metas.has(k)).toBe(true);
  });
});
