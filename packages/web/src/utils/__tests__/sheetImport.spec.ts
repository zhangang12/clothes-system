import { describe, it, expect } from 'vitest';
import { guessMapping, rowsToMaterials, parseSheetFile, MATERIAL_FIELDS } from '../sheetImport';

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
    expect(out[0]).toEqual({ itemName: '春亚纺', qty: '1.5', part: '大身', colors: '白', remark: '克重200' });
    expect(out[1].itemName).toBe('涤丝纺');
  });

  it('缺列的行按空串兜底', () => {
    const out = rowsToMaterials([['拉链', '1']], mapping);
    expect(out[0]).toEqual({ itemName: '拉链', qty: '1', part: '', colors: '', remark: '' });
  });

  it('只映射部分字段时其余字段为空串', () => {
    const out = rowsToMaterials([['面料A', '1.2']], { itemName: 0 });
    expect(out[0]).toEqual({ itemName: '面料A', qty: '', part: '', colors: '', remark: '' });
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

  it('不支持的扩展名抛错', async () => {
    await expect(parseSheetFile(new File(['x'], 'a.docx'))).rejects.toThrow('仅支持');
  });
});
