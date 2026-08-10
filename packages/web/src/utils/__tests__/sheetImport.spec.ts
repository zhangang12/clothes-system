import { describe, it, expect } from 'vitest';
import { guessMapping, rowsToMaterials, parseSheetFile, MATERIAL_FIELDS, QUOTE_ITEM_FIELDS } from '../sheetImport';

// 以用户截图的真实工艺单结构为基准：面里料部分|单耗|位置|颜色1|备注（带分区行/空行）
const CRAFT_SHEET = [
  ['面里料部分', '单耗', '位置', '颜色1', '备注'],
  ['400消光春亚纺-反面压光 53GSM', '', '帽子，大身，里襟，口袋', '13金', ''],
  ['290涤丝纺', '', '帽里，大身里，袋布', '13金', ''],
  ['辅料部分', '', '', '', ''], // 分区行：单耗/位置均空——按当前实现会作为材料行带出（品名非空）
  ['5#尼龙双开带logo 橡胶漆', '1', '门襟', '13金', '110cm'],
  ['印花', '1', '穿者后背右下方，见图稿', '白色', ''],
];

describe('guessMapping 列映射自动推断', () => {
  it('命中表头关键词并给出列号', () => {
    const { mapping, hasHeader } = guessMapping(CRAFT_SHEET);
    expect(hasHeader).toBe(true);
    expect(mapping.itemName).toBe(0);
    expect(mapping.qty).toBe(1);
    expect(mapping.part).toBe(2);
    expect(mapping.colors).toBe(3);
    expect(mapping.remark).toBe(4);
  });

  it('无表头时 hasHeader=false 且映射为空', () => {
    const { mapping, hasHeader } = guessMapping([['春亚纺', '1.5', '大身'], ['涤丝纺', '2', '里布']]);
    expect(hasHeader).toBe(false);
    expect(mapping.itemName).toBeUndefined();
  });

  it('表头不在首行（首行是大标题）也能识别，headerRow 指向表头行', () => {
    const rows = [
      ['CHA273B550 工艺单'],
      ['品名', '门幅', '颜色', '部位'],
      ['400消光春亚纺防棉', '145', '01黑色', '大身'],
    ];
    const { mapping, hasHeader, headerRow } = guessMapping(rows);
    expect(hasHeader).toBe(true);
    expect(headerRow).toBe(1);
    expect(mapping.itemName).toBe(0);
    expect(mapping.width).toBe(1);
    expect(mapping.colors).toBe(2);
    expect(mapping.part).toBe(3);
  });

  it('门幅/供应商等扩展字段关键词命中', () => {
    const { mapping } = guessMapping([['品名', '门幅', '供应商', '参考价', '实际耗用', '安排日期']]);
    expect(mapping.width).toBe(1);
    expect(mapping.supplierName).toBe(2);
    expect(mapping.refPrice).toBe(3);
    expect(mapping.actualUsage).toBe(4);
    expect(mapping.arrangeDate).toBe(5);
  });

  it('字段关键词不互相抢列（每个字段各中各的列）', () => {
    for (const f of MATERIAL_FIELDS) {
      const header = MATERIAL_FIELDS.map((x) => x.label);
      const { mapping } = guessMapping([header]);
      expect(mapping[f.key]).toBe(header.indexOf(f.label));
    }
  });
});

describe('rowsToMaterials 行映射', () => {
  const mapping = { itemName: 0, qty: 1, part: 2, colors: 3, remark: 4 };

  it('按映射取列，品名为空的行被滤掉', () => {
    const rows = [
      ['春亚纺', '1.5', '大身', '白', '克重200'],
      ['', '', '', '', ''],           // 空行 → 滤掉
      ['', '2', '里布', '黑', ''],   // 品名空 → 滤掉
      ['涤丝纺', '2', '里布', '黑', ''],
    ];
    const out = rowsToMaterials(rows, mapping);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ itemName: '春亚纺', qty: '1.5', part: '大身', colors: '白', remark: '克重200' });
    expect(out[1].itemName).toBe('涤丝纺');
  });

  it('缺列的行按空串兜底', () => {
    const out = rowsToMaterials([['拉链', '1']], mapping);
    expect(out[0]).toMatchObject({ itemName: '拉链', qty: '1', part: '', colors: '', remark: '' });
  });

  it('只映射部分字段时其余字段为空串', () => {
    const out = rowsToMaterials([['面料A', '1.2']], { itemName: 0 });
    expect(out[0]).toMatchObject({ itemName: '面料A', qty: '', part: '', colors: '', remark: '', width: '', supplierName: '' });
  });

  it('门幅/供应商等扩展字段随映射带出', () => {
    const out = rowsToMaterials([['春亚纺', '145', '绍兴某纺织']], { itemName: 0, width: 1, supplierName: 2 });
    expect(out[0]).toMatchObject({ itemName: '春亚纺', width: '145', supplierName: '绍兴某纺织' });
  });
});

describe('parseSheetFile（csv/txt 路径）', () => {
  it('按行拆分、支持逗号与制表符、去引号', async () => {
    const csv = '品名,单耗,位置\n"春亚纺",1.5,"帽子,大身"\n涤丝纺\t2\t里布';
    const file = new File([csv], 'craft.csv', { type: 'text/csv' });
    const rows = await parseSheetFile(file);
    expect(rows).toEqual([
      ['品名', '单耗', '位置'],
      ['春亚纺', '1.5', '帽子,大身'],
      ['涤丝纺', '2', '里布'],
    ]);
  });

  it('.xls 老格式给出明确另存提示', async () => {
    await expect(parseSheetFile(new File(['x'], 'a.xls'))).rejects.toThrow('另存为 .xlsx');
  });

  it('不支持的扩展名抛错', async () => {
    await expect(parseSheetFile(new File(['x'], 'a.docx'))).rejects.toThrow('仅支持');
  });
});

describe('rowsToMaterials extraColorCols（多组颜色按源列分列，用户反馈 7-30）', () => {
  const mapping = { itemName: 0, colors: 1, part: 3 };

  it('颜色二列各自成色组按序拼接，不合并不去重', () => {
    const rows = [
      ['150D小牛津', '62 Olive橄榄绿色', '01 Black 黑色', '大身'],
      ['撞色面料2', '10 White 增白色', '10 White 增白色', '拼块'], // 两组同值也保留两列结构
    ];
    const out = rowsToMaterials(rows, mapping, [2]);
    expect(out[0].colors).toBe('62 Olive橄榄绿色，01 Black 黑色');
    expect(out[1].colors).toBe('10 White 增白色，10 White 增白色');
  });

  it('颜色二列为空的行不悬空拼接', () => {
    const out = rowsToMaterials([['面料A', '黑色', '', '大身']], mapping, [2]);
    expect(out[0].colors).toBe('黑色');
  });

  it('未映射颜色列时 extraColorCols 也能独立成色组', () => {
    const out = rowsToMaterials([['面料A', '', '黑色', '大身']], { itemName: 0, part: 3 }, [1, 2]);
    expect(out[0].colors).toBe('黑色');
  });

  // ── 色组以「源列」为边界（2026-08-04 Nina 反馈）──────────────────
  // 这两条守着一个很容易被下次"修复"弄反的边界：
  // 跨列 = 多个色组（Helen 7-29/7-30 要的）；列内 = 一个色组，内部逗号不是分隔符（Nina 要的）。
  it('单元格内部的逗号不构成色组边界——一列就是一个色组', () => {
    const out = rowsToMaterials([['5号尼龙开口', '拉头古银，齿和码带黑色', '', '门禁']], mapping, [2]);
    expect(out[0].colorGroups).toEqual(['拉头古银，齿和码带黑色']);
    expect(out[0].colorGroups).toHaveLength(1); // 不是 ['拉头古银','齿和码带黑色']
  });

  it('半角逗号同样不拆——中英文标点都只是内容', () => {
    const out = rowsToMaterials([['织带', 'A,B', '', '袖口']], mapping, [2]);
    expect(out[0].colorGroups).toEqual(['A,B']);
  });

  it('跨列仍各自成组，且 colors 逗号串照旧生成（落库格式不变）', () => {
    const out = rowsToMaterials([['面料A', '黑色', '白色', '大身']], mapping, [2]);
    expect(out[0].colorGroups).toEqual(['黑色', '白色']);
    expect(out[0].colors).toBe('黑色，白色');
  });

  // ── 表头叫「色组」也要认（2026-08-06 Nina 反馈）──────────────────────
  // 系统自己的 UI 全叫色组（列头「颜色（色组）」/ 按钮「＋色组」/ 预览列「色组1」「色组2」），
  // 用户照着命名工艺单列，旧关键词只有 /颜色|color/ 一个都不认，导致「一款打两组色」永远只导进一组。
  describe('色组表头识别', () => {
    it('「色组一」能被识别成颜色列', () => {
      const { mapping } = guessMapping([['品名', '部位', '色组一', '色组二']]);
      expect(mapping.colors).toBe(2);
    });

    it('「配色」「色组1」同样认', () => {
      expect(guessMapping([['品名', '配色']]).mapping.colors).toBe(1);
      expect(guessMapping([['品名', '色组1']]).mapping.colors).toBe(1);
    });

    it('色组一/色组二两列 → 两个独立色组（一款打两组色）', () => {
      const rows = [['主面料', '大身', '05 RED', '01 黑色']];
      const out = rowsToMaterials(rows, { itemName: 0, part: 1, colors: 2 }, [3]);
      expect(out[0].colorGroups).toEqual(['05 RED', '01 黑色']);
      expect(out[0].colors).toBe('05 RED，01 黑色');
    });

    it('不误伤其它字段的表头', () => {
      const { mapping } = guessMapping([['品名', '部位', '成份', '码带', '拉头', '尺寸']]);
      expect(mapping.colors).toBeUndefined();
      expect(mapping.part).toBe(1);
      expect(mapping.codeBand).toBe(3);
      expect(mapping.puller).toBe(4);
    });
  });
});

// ── 报价明细导入（2026-08-10 Grace：老系统里已有报价，想直接导 Excel）──────────
// 与样衣材料共用同一套「靠表头关键词自适应」的机制，只是字段表不同——
// 她手上的老表列序五花八门，要求对齐固定模板等于没解决问题。
describe('QUOTE_ITEM_FIELDS 报价明细字段表', () => {
  it('认得报价单常见表头', () => {
    const { mapping, hasHeader } = guessMapping(
      [['品名', '部位', '门幅', '颜色', '供应商', '单位', '报价耗用', '人民币单价', '损耗%', '备注']],
      QUOTE_ITEM_FIELDS,
    );
    expect(hasHeader).toBe(true);
    expect(mapping.itemName).toBe(0);
    expect(mapping.part).toBe(1);
    expect(mapping.color).toBe(3);
    expect(mapping.supplier).toBe(4);
    expect(mapping.quoteUsage).toBe(6);
    expect(mapping.rmbPrice).toBe(7);
    expect(mapping.lossRate).toBe(8);
  });

  it('表头不在首行也能认（老系统导出常带大标题行）', () => {
    const { hasHeader, headerRow } = guessMapping(
      [['某某公司报价单'], ['品名', '单价', '数量'], ['面料A', '10', '2']],
      QUOTE_ITEM_FIELDS,
    );
    expect(hasHeader).toBe(true);
    expect(headerRow).toBe(1);
  });

  it('字段关键词不互相抢列', () => {
    for (const f of QUOTE_ITEM_FIELDS) {
      const header = QUOTE_ITEM_FIELDS.map((x) => x.label);
      const { mapping } = guessMapping([header], QUOTE_ITEM_FIELDS);
      expect(mapping[f.key]).toBe(header.indexOf(f.label));
    }
  });

  it('「损耗%」不会被「单价」或「耗用」抢走', () => {
    const { mapping } = guessMapping([['品名', '报价耗用', '人民币单价', '损耗%']], QUOTE_ITEM_FIELDS);
    expect(mapping.quoteUsage).toBe(1);
    expect(mapping.rmbPrice).toBe(2);
    expect(mapping.lossRate).toBe(3);
  });

  it('行映射按报价字段出对象，品名为空的行滤掉', () => {
    const rows = [['面料A', '大身', '10', '2'], ['', '', '', ''], ['里布B', '里襟', '5', '1']];
    const out = rowsToMaterials(rows, { itemName: 0, part: 1, rmbPrice: 2, quoteUsage: 3 }, [], QUOTE_ITEM_FIELDS);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ itemName: '面料A', part: '大身', rmbPrice: '10', quoteUsage: '2' });
    // 报价没有色组概念，不该混进 colorGroups
    expect(out[0].colorGroups).toBeUndefined();
  });

  it('不影响样衣材料的既有行为（默认字段表仍是 MATERIAL_FIELDS）', () => {
    const out = rowsToMaterials([['春亚纺', '黑色']], { itemName: 0, colors: 1 });
    expect(out[0].colorGroups).toEqual(['黑色']); // 样衣路径照旧产出色组
    expect(MATERIAL_FIELDS.some((f) => f.key === 'gramWeight')).toBe(true);
  });
});
