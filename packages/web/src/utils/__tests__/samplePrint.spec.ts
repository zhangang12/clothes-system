import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildSampleHtml, printSample, resolveMatCols, resolveMetaFields,
  SAMPLE_MAT_COLS, SAMPLE_META_FIELDS, SAMPLE_BLOCKS, DEFAULT_SAMPLE_LAYOUT,
  defaultColWidth,
} from '../samplePrint';
import { loadLayout, saveLayout, resetLayout, type PrintLayout } from '../printLayout';
import { splitColorGroups, maxColorGroups, colorGroupLabel } from '../colorGroups';

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

// ── 颜色按色组分列（2026-08-10 Grace，附了工厂真实工艺单）───────────────────
// 工厂要横着看「每个色组下这条辅料用什么颜色」；此前所有色组挤在一格里（"粉色，砖红"），
// 得自己数第几个逗号对应第几个色，很容易对错行。
describe('材料明细 · 颜色按色组分列', () => {
  const multi = {
    sample_no: 'S-1',
    materials: [
      { item_name: '主面料', colors: '藏青，红色，绿色' },
      { item_name: '5#尼龙拉链', colors: '蓝色，藏青，藏青' },
      { item_name: '洗标', colors: '' },                    // 没填颜色的行也要能对齐
    ],
  };

  it('多色组时摊成 颜色一/颜色二/颜色三', () => {
    const head = headOf(buildSampleHtml(multi, L()));
    expect(head).toContain('颜色一');
    expect(head).toContain('颜色二');
    expect(head).toContain('颜色三');
    expect(head).not.toContain('颜色四');
    expect(head.filter((h) => h === '颜色')).toHaveLength(0); // 原来那个合并列没了
  });

  it('每行的值落到各自的色组列，不再挤成一格', () => {
    const html = buildSampleHtml(multi, L());
    const body = html.split('<tbody>')[1].split('</tbody>')[0];
    const rows = body.split('</tr>');
    expect(rows[0]).toContain('藏青');
    expect(rows[0]).toContain('红色');
    expect(rows[0]).toContain('绿色');
    expect(rows[0]).not.toContain('藏青，红色'); // 不能还是逗号串
  });

  it('色组数不足的行补空格，列不会错位', () => {
    const html = buildSampleHtml({
      sample_no: 'S', materials: [{ item_name: 'A', colors: '红，蓝' }, { item_name: 'B', colors: '黑' }],
    }, L());
    const body = html.split('<tbody>')[1].split('</tbody>')[0];
    const cellCounts = body.split('</tr>').filter((r) => r.includes('<td')).map((r) => (r.match(/<td/g) ?? []).length);
    expect(new Set(cellCounts).size).toBe(1); // 每行单元格数一致
  });

  it('只有一个色组时保持单列「颜色」，不给单色样衣平白加空列', () => {
    const head = headOf(buildSampleHtml({ sample_no: 'S', materials: [{ item_name: 'A', colors: '黑色' }] }, L()));
    expect(head).toContain('颜色');
    expect(head).not.toContain('颜色一');
  });

  it('用户在操作台里关掉了颜色列，就不该自作主张加回来', () => {
    const head = headOf(buildSampleHtml(multi, L({ matCols: ['item_name', 'qty'] })));
    expect(head.some((h) => h.startsWith('颜色'))).toBe(false);
  });
});

describe('colorGroups 拆分口径', () => {
  it('中英文逗号都认，去空白与空项', () => {
    expect(splitColorGroups('红, 蓝，  绿 ,')).toEqual(['红', '蓝', '绿']);
    expect(splitColorGroups('')).toEqual([]);
    expect(splitColorGroups(null)).toEqual([]);
  });

  it('取一批材料里最多的色组数', () => {
    expect(maxColorGroups([{ colors: '红，蓝' }, { colors: '黑' }, { colors: '' }])).toBe(2);
    expect(maxColorGroups([])).toBe(0);
  });

  it('列名到十为止用中文，超出退回数字', () => {
    expect(colorGroupLabel(0)).toBe('颜色一');
    expect(colorGroupLabel(9)).toBe('颜色十');
    expect(colorGroupLabel(10)).toBe('颜色11');
  });
});


// ——— #85 行高与列宽可调（2026-08-12 YSM：「打印面的行高不能调整吗？一个字一行，很浪费纸」）———
describe('打印排版·行高与列宽', () => {
  it('默认列宽预算给品名/备注留得下（这就是「一个字一行」的根因）', () => {
    // A4 竖版正文约 680px；默认 11 列里品名、备注不设宽度，靠剩余空间撑
    const fixed = DEFAULT_SAMPLE_LAYOUT.matCols.reduce((s2, k) => s2 + defaultColWidth(k), 0);
    const autoCols = DEFAULT_SAMPLE_LAYOUT.matCols.filter((k) => !defaultColWidth(k)).length;
    const each = (680 - fixed) / autoCols;
    expect(autoCols).toBe(2);                 // 品名 + 备注
    expect(each).toBeGreaterThanOrEqual(80);  // 12px 字号下至少能排 6 个汉字，不会一个字一行
  });

  const base = { sample_no: 'S-001', materials: [{ item_name: '面料A', qty: 2 }] };
  const L = (over: any = {}) => ({ ...DEFAULT_SAMPLE_LAYOUT, ...over });

  it('不配行高时与改造前一致（padding:4px），老用户印出来不该变样', () => {
    const html = buildSampleHtml(base, L({ rowPad: undefined }), false);
    expect(html).toContain('padding:4px 6px');
  });

  it('行高可以调大调小', () => {
    expect(buildSampleHtml(base, L({ rowPad: 8 }), false)).toContain('padding:8px 6px');
    expect(buildSampleHtml(base, L({ rowPad: 1 }), false)).toContain('padding:1px 6px');
  });

  it('行高 0 是合法值（最省纸），不能被兜底成 4', () => {
    const html = buildSampleHtml(base, L({ rowPad: 0 }), false);
    expect(html).toContain('padding:0px 6px');
    expect(html).not.toContain('padding:4px 6px');
  });

  it('行高超出范围时钳到边界，不把离谱值原样写进样式', () => {
    expect(buildSampleHtml(base, L({ rowPad: 999 }), false)).toContain('padding:20px 6px');
    expect(buildSampleHtml(base, L({ rowPad: -5 }), false)).toContain('padding:0px 6px');
  });

  it('用 table-layout:fixed —— 这是「一个字一行」的解药', () => {
    // auto 布局下，写死 px 的列一多，剩给品名/备注的空间会被压到十几 px
    expect(buildSampleHtml(base, L(), false)).toContain('table-layout: fixed');
  });

  it('列宽可以逐列覆盖内置默认值', () => {
    const html = buildSampleHtml(base, L({ matCols: ['part'], colWidths: { part: 120 } }), false);
    expect(html).toContain('width:120px');
    expect(html).not.toContain(`width:${defaultColWidth('part')}px`);
  });

  it('没覆盖的列仍用内置宽度', () => {
    // 不写死具体数字：内置宽度会随排版预算调整（见 SAMPLE_MAT_COLS 的说明）
    const html = buildSampleHtml(base, L({ matCols: ['part'], colWidths: {} }), false);
    expect(html).toContain(`width:${defaultColWidth('part')}px`);
  });

  it('把列宽设成 0 视为自适应，不输出 width（长文本列要留给它自己撑）', () => {
    const html = buildSampleHtml(base, L({ matCols: ['part'], colWidths: { part: 0 } }), false);
    expect(html).toContain(`width:${defaultColWidth('part')}px`);   // 0 → 回落到内置默认
    // 品名本来就没有内置宽度：表头不应带 style（不能用整页 not.toContain('width:')，
    // CSS 里还有 max-width 之类，那样断言等于没断言）
    const html2 = buildSampleHtml(base, L({ matCols: ['item_name'], colWidths: {} }), false);
    expect(html2).toContain('<th>品名</th>');
  });
});
