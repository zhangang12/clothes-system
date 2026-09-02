import { describe, it, expect } from 'vitest';
import { checkGoodsLines, isEmptyLine } from '../lineCheck';

const ok = (over = {}) => ({ item_name: '门襟拉链', qty: 105, color: '粉色', ...over });

describe('货物明细校验', () => {
  it('UT-GL-01: 全部合格时放行', () => {
    expect(checkGoodsLines([ok(), ok({ qty: 221 })])).toBeNull();
  });

  it('UT-GL-02: 一行都没有时提示至少 1 行', () => {
    expect(checkGoodsLines([])).toContain('至少 1 行');
  });

  it('UT-GL-03: 点名到第几行——原来只说「品名必填」，二三十行里没人找得到', () => {
    const msg = checkGoodsLines([ok(), ok(), { qty: 5, color: '黑' }])!;
    expect(msg).toContain('第 3 行');
    expect(msg).toContain('品名');
  });

  it('UT-GL-04: 数量不合格时把填的值原样带出来，好对照', () => {
    const msg = checkGoodsLines([ok({ qty: 0 })])!;
    expect(msg).toContain('第 1 行');
    expect(msg).toContain('0');
  });

  it('UT-GL-05: 空行说「删掉」而不是「去补品名」——它是多出来的，不是填错的', () => {
    const msg = checkGoodsLines([ok(), {}])!;
    expect(msg).toContain('第 2 行');
    expect(msg).toContain('空行');
    expect(msg).toContain('删除');
  });

  it('UT-GL-06: 空行与填错的行分开说，两种处理方式不一样', () => {
    const msg = checkGoodsLines([{}, { qty: 3 }])!;
    expect(msg).toContain('空行');
    expect(msg).toContain('品名');
  });

  it('UT-GL-07: 填了别的列但没填品名，算「填了一半」不算空行', () => {
    expect(isEmptyLine({ color: '黑色' })).toBe(false);
    const msg = checkGoodsLines([{ color: '黑色' }])!;
    expect(msg).toContain('品名');
    expect(msg).not.toContain('空行');
  });

  it('UT-GL-08: 空白字符不算填了内容', () => {
    expect(isEmptyLine({ item_name: '   ', qty: '' })).toBe(true);
  });

  it('UT-GL-09: 毛病多时最多点 3 行，并说明还有多少——列全了反而看不过来', () => {
    const rows = Array.from({ length: 6 }, () => ({ qty: 1 }));
    const msg = checkGoodsLines(rows)!;
    expect(msg).toContain('第 1 行');
    expect(msg).toContain('第 3 行');
    expect(msg).not.toContain('第 4 行');
    expect(msg).toContain('6');
  });

  it('UT-GL-10: 数量是文本时也拦下来（不会被当成 0 悄悄放过）', () => {
    const msg = checkGoodsLines([ok({ qty: '若干' })])!;
    expect(msg).toContain('若干');
  });
});

// ── 「填了一半会被静默丢掉」的行（8-26 举一反三查出：报价与样衣保存时
//    form.items.filter(i => i.itemName) 会把没填品名的行悄悄扔掉）──
import { halfFilledRows, halfFilledMessage } from '../lineCheck';

const QUOTE_TOUCHED = ['part', 'width', 'color', 'supplier', 'unit', 'quoteUsage', 'rmbPrice', 'remark'];

describe('填了一半的明细行', () => {
  it('UT-HF-01: 填了数量/颜色却没填品名 —— 必须揪出来，否则保存时被静默丢掉', () => {
    const rows = [{ itemName: '主面料', color: '黑' }, { color: '深灰', quoteUsage: '1.2' }];
    expect(halfFilledRows(rows, 'itemName', QUOTE_TOUCHED)).toEqual([2]);
  });

  it('UT-HF-02: 纯空行不算 —— 表单会自动补一行占位，丢掉它是对的', () => {
    const rows = [{ itemName: '主面料' }, { part: '', color: '', quoteUsage: '' }];
    expect(halfFilledRows(rows, 'itemName', QUOTE_TOUCHED)).toEqual([]);
  });

  it('UT-HF-03: 有默认值的列不参与判断（报价的 lossRate 自带统一损耗%）', () => {
    const rows = [{ itemName: '', lossRate: 3 }];
    expect(halfFilledRows(rows, 'itemName', QUOTE_TOUCHED)).toEqual([]);
  });

  it('UT-HF-04: 色组这类数组，空数组算没填、非空算填了', () => {
    expect(halfFilledRows([{ itemName: '', colorGroups: [] }], 'itemName', ['colorGroups'])).toEqual([]);
    expect(halfFilledRows([{ itemName: '', colorGroups: ['黑'] }], 'itemName', ['colorGroups'])).toEqual([1]);
  });

  it('UT-HF-05: 品名只有空格也算没填', () => {
    expect(halfFilledRows([{ itemName: '   ', color: '黑' }], 'itemName', QUOTE_TOUCHED)).toEqual([1]);
  });

  it('UT-HF-06: 提示里点名行号，并说清楚不补品名会丢数据', () => {
    const msg = halfFilledMessage('报价明细', [2, 5])!;
    expect(msg).toContain('第 2、5 行');
    expect(msg).toContain('丢掉');
  });

  it('UT-HF-07: 超过 3 行时只点前 3 行并给总数', () => {
    const msg = halfFilledMessage('材料明细', [1, 2, 3, 4, 5])!;
    expect(msg).toContain('第 1、2、3 行');
    expect(msg).toContain('5 行');
  });

  it('UT-HF-08: 没有问题行时不提示', () => {
    expect(halfFilledMessage('报价明细', [])).toBeNull();
  });
});

// ── 8-26 深度审查：按「保存时的保留条件」抽象，覆盖客户联系人/银行/快递、出口发票款项 ──
import { droppedButFilledRows, droppedMessage } from '../lineCheck';

describe('会被保存时丢掉、但人填了东西的行', () => {
  const keptContact = (r: any) => !!(r.name || r.mobile || r.phone);
  const CONTACT_TOUCHED = ['department', 'gender', 'title', 'mobile1', 'mobile2', 'email', 'remark'];

  it('UT-DR-01: 联系人只填了部门和邮箱——会被丢，必须拦下来', () => {
    const rows = [{ name: '张三', mobile: '138' }, { department: '采购', email: 'a@b.c' }];
    expect(droppedButFilledRows(rows, keptContact, CONTACT_TOUCHED)).toEqual([2]);
  });

  it('UT-DR-02: 关键字段填了就不算丢（哪怕别的都空）', () => {
    expect(droppedButFilledRows([{ mobile: '139' }], keptContact, CONTACT_TOUCHED)).toEqual([]);
  });

  it('UT-DR-03: 整行全空不算——表单会自动补占位行，丢掉是对的', () => {
    expect(droppedButFilledRows([{ department: '', email: '' }], keptContact, CONTACT_TOUCHED)).toEqual([]);
  });

  it('UT-DR-04: 出口发票——选了订单/填了款号却没填金额，会被丢', () => {
    const kept = (r: any) => Number(r.amount) > 0;
    const rows = [{ amount: 100 }, { style_no: 'WR02', amount: 0 }, { order_id: 5 }];
    expect(droppedButFilledRows(rows, kept, ['order_id', 'style_no'])).toEqual([2, 3]);
  });

  it('UT-DR-05: 金额是文本时按"留不住"处理，不能当成填好了', () => {
    const kept = (r: any) => Number(r.amount) > 0;
    expect(droppedButFilledRows([{ style_no: 'X', amount: '若干' }], kept, ['style_no'])).toEqual([1]);
  });

  it('UT-DR-06: 提示写明缺什么、以及不改会被丢掉', () => {
    const msg = droppedMessage('联系人', [2], '缺姓名/手机/电话')!;
    expect(msg).toContain('第 2 行');
    expect(msg).toContain('缺姓名/手机/电话');
    expect(msg).toContain('丢掉');
  });

  it('UT-DR-07: 超过 3 行只点前 3 行并给总数', () => {
    const msg = droppedMessage('款项明细', [1, 2, 3, 4], '金额没填')!;
    expect(msg).toContain('第 1、2、3 行');
    expect(msg).toContain('4 行');
  });

  it('UT-DR-08: 没有问题行时不提示', () => {
    expect(droppedMessage('联系人', [], '缺姓名')).toBeNull();
  });
});

// ── #120：同名材料多行 + 标了拆分 → 保存前必拦（规则本体在 @i9/types，前后端共用） ──
import { duplicateSplitGroups, duplicateSplitMessage } from '../lineCheck';
import { findSplitDupConflicts, matrixColorsOf, colorPiecesOf, perColorRowErrors } from '@i9/types';

describe('同名拆分行防呆（#120）', () => {
  // fixture 按订单 O-20260901-001 真实数据：金属丝底PU 各行填了不同颜色，合同翻倍多签 20.2 万
  const rows = [
    { itemName: '金属丝底PU', color: '米白', splitMode: 'BY_COLOR' },
    { itemName: '中斜纹', color: '', splitMode: 'BY_COLOR' },
    { itemName: '金属丝底PU', color: '咖色', splitMode: 'BY_COLOR' },
    { itemName: '30G有胶衬', color: '', splitMode: 'NONE' },
  ];

  it('UT-DS-01: 订单73版型（一色一行）要被点名，含行号与原因', () => {
    const g = duplicateSplitGroups(rows, 'itemName', 'splitMode', 'part', 'color');
    expect(g).toHaveLength(1);
    expect(g[0].name).toBe('金属丝底PU');
    expect(g[0].rowNos).toEqual([1, 3]);
    expect(g[0].reason).toContain('不同颜色');
  });

  it('UT-DS-02: 同名但全是「不拆」不拦——一料两部位/两供应商是正常用法', () => {
    const ok = [
      { itemName: '主标', splitMode: 'NONE' },
      { itemName: '主标', splitMode: 'NONE' },
    ];
    expect(duplicateSplitGroups(ok, 'itemName', 'splitMode')).toEqual([]);
  });

  it('UT-DS-03: 只要有一行标了拆分就拦（另一行 NONE 也一样翻倍）', () => {
    const mixed = [
      { itemName: '拉链', splitMode: 'NONE' },
      { itemName: '拉链', splitMode: 'BY_BOTH' },
    ];
    expect(duplicateSplitGroups(mixed, 'itemName', 'splitMode')).toHaveLength(1);
  });

  it('UT-DS-04: 品名空的行不参与比对（占位空行别误报）', () => {
    expect(duplicateSplitGroups([{ itemName: '', splitMode: 'BY_COLOR' }, { itemName: ' ', splitMode: 'BY_COLOR' }], 'itemName', 'splitMode')).toEqual([]);
  });

  it('UT-DS-05: 订单42版型（部位互异非空+颜色全空=按部位分摊净耗）必须放行', () => {
    const o42 = [
      { itemName: '双面呢', part: '前胸后背', color: '', splitMode: 'BY_COLOR' },
      { itemName: '双面呢', part: '大袖', color: '', splitMode: 'BY_COLOR' },
      { itemName: '双面呢', part: '前下片', color: '', splitMode: 'BY_COLOR' },
    ];
    expect(duplicateSplitGroups(o42, 'itemName', 'splitMode', 'part', 'color')).toEqual([]);
  });

  it('UT-DS-06: 部位互异但有一行填了颜色 → 不再是纯部位分摊，要拦', () => {
    const g = findSplitDupConflicts([
      { name: '双面呢', part: '前胸后背', color: '黑色', mode: 'BY_COLOR' },
      { name: '双面呢', part: '大袖', color: '', mode: 'BY_COLOR' },
    ]);
    expect(g).toHaveLength(1);
  });

  it('UT-DS-07: 部位重复+颜色全空 → 看起来是誊行，拦并说明', () => {
    const g = findSplitDupConflicts([
      { name: '里布', part: '', color: '', mode: 'BY_SIZE' },
      { name: '里布', part: '', color: '', mode: 'BY_SIZE' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].reason).toContain('誊');
  });

  it('UT-DS-07b: 部位非空但重复（两行都写「大袖」）→ 不是按部位分摊，拦', () => {
    const g = findSplitDupConflicts([
      { name: '双面呢', part: '大袖', color: '', mode: 'BY_COLOR' },
      { name: '双面呢', part: '大袖', color: '', mode: 'BY_COLOR' },
    ]);
    expect(g).toHaveLength(1);
  });

  it('UT-DS-08: 各行颜色相同的誊行，文案不能说成「不同颜色」', () => {
    const g = findSplitDupConflicts([
      { name: '拉链', part: '', color: '黑色', mode: 'BY_COLOR' },
      { name: '拉链', part: '', color: '黑色', mode: 'BY_COLOR' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].reason).toContain('颜色相同');
    expect(g[0].reason).not.toContain('不同颜色');
  });

  it('UT-DS-09: 文案带原因和两条出路', () => {
    const msg = duplicateSplitMessage('材料明细', [{ name: '金属丝底PU', rowNos: [1, 3], reason: '各行填了不同颜色' }])!;
    expect(msg).toContain('第 1、3 行');
    expect(msg).toContain('不同颜色');
    expect(msg).toContain('不拆');
  });

  it('UT-DS-10: 多组问题时报第一组并给总数', () => {
    const msg = duplicateSplitMessage('材料明细', [
      { name: 'A', rowNos: [1, 2] }, { name: 'B', rowNos: [3, 4] },
    ])!;
    expect(msg).toContain('A');
    expect(msg).toContain('另有 1 组');
  });

  it('UT-DS-11: 没问题时不打扰', () => {
    expect(duplicateSplitMessage('材料明细', [])).toBeNull();
  });
});

// ── 按色单行（PER_COLOR，#122 daisy：同一种料不同颜色不同供应商/单价）──
describe('按色单行的防呆与算量（前后端共用 @i9/types）', () => {
  // 订单 73 的矩阵：米白 2264 件、浅棕 2264 件（各 4 码）
  const ROWS = [
    { color: '米白11-0602', size: 'PP', qtys: [336] }, { color: '米白11-0602', size: 'P', qtys: [526] },
    { color: '米白11-0602', size: 'M', qtys: [740] }, { color: '米白11-0602', size: 'G', qtys: [662] },
    { color: '浅棕18-1048', size: 'PP', qtys: [455] }, { color: '浅棕18-1048', size: 'P', qtys: [552] },
    { color: '浅棕18-1048', size: 'M', qtys: [718] }, { color: '浅棕18-1048', size: 'G', qtys: [539] },
    { color: '', size: '', qtys: [0] },   // 占位空行不算颜色
  ];

  it('UT-PC-01 同名多行全是按色单行、颜色互异 → 放行（这正是它的用法）', () => {
    expect(findSplitDupConflicts([
      { name: '金属丝底PU', part: '', color: '米白11-0602', mode: 'PER_COLOR' },
      { name: '金属丝底PU', part: '', color: '浅棕18-1048', mode: 'PER_COLOR' },
    ])).toEqual([]);
  });

  it('UT-PC-02 按色单行与自动分色混用 → 拦，说明不能混', () => {
    const g = findSplitDupConflicts([
      { name: '金属丝底PU', part: '', color: '米白11-0602', mode: 'PER_COLOR' },
      { name: '金属丝底PU', part: '', color: '', mode: 'BY_COLOR' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].reason).toContain('混用');
  });

  it('UT-PC-03 两行选了同一个颜色 / 有行没选颜色 → 拦', () => {
    expect(findSplitDupConflicts([
      { name: 'A', part: '', color: '米白11-0602', mode: 'PER_COLOR' },
      { name: 'A', part: '', color: '米白11-0602', mode: 'PER_COLOR' },
    ])[0].reason).toContain('一色一行');
    expect(findSplitDupConflicts([
      { name: 'A', part: '', color: '米白11-0602', mode: 'PER_COLOR' },
      { name: 'A', part: '', color: '', mode: 'PER_COLOR' },
    ])).toHaveLength(1);
  });

  it('UT-PC-04 与不拆的同名行混用也拦（不拆那行是整单量，叠上去就重复）', () => {
    expect(findSplitDupConflicts([
      { name: 'A', part: '', color: '米白11-0602', mode: 'PER_COLOR' },
      { name: 'A', part: '', color: '白色', mode: 'NONE' },
    ])).toHaveLength(1);
  });

  it('UT-PC-05 矩阵颜色：去空去重、按录入顺序', () => {
    expect(matrixColorsOf(ROWS)).toEqual(['米白11-0602', '浅棕18-1048']);
  });

  it('UT-PC-06 该色件数跨码合计；两边都去空格；不在矩阵的颜色是 0', () => {
    expect(colorPiecesOf(ROWS, '米白11-0602')).toBe(2264);
    expect(colorPiecesOf(ROWS, ' 浅棕18-1048 ')).toBe(2264);
    expect(colorPiecesOf(ROWS, '咖色')).toBe(0);
    expect(colorPiecesOf(ROWS, '')).toBe(0);
  });

  it('UT-PC-07 行级校验：只管按色单行；空颜色、不在矩阵里的颜色都点名', () => {
    const errs = perColorRowErrors([
      { color: '米白11-0602', mode: 'PER_COLOR' },
      { color: '咖色', mode: 'PER_COLOR' },
      { color: '', mode: 'PER_COLOR' },
      { color: '咖色', mode: 'NONE' },          // 不拆的行颜色随便填
    ], matrixColorsOf(ROWS));
    expect(errs.map((e) => e.rowNo)).toEqual([2, 3]);
    expect(errs[0].reason).toContain('咖色');
  });
});

