import { describe, it, expect } from 'vitest';
import { matchFactory, parseSupplierColumn, applySupplierColumn } from '../supplierPaste';

const FACTORIES = [
  { id: 1, name: '苏州市坤业纺织有限公司', short_name: '坤业' },
  { id: 2, name: '绍兴弘隆纺织品有限公司', short_name: '弘隆' },
  { id: 3, name: '东丽', short_name: null },
];

describe('粘贴供应商列（#84）', () => {
  it('全称、简称都能对上', () => {
    expect(matchFactory('苏州市坤业纺织有限公司', FACTORIES)).toMatchObject({ id: 1 });
    expect(matchFactory('坤业', FACTORIES)).toMatchObject({ id: 1 });
  });

  it('Excel 里常见的多余空格不影响匹配', () => {
    expect(matchFactory('苏州市坤业 纺织有限公司', FACTORIES)).toMatchObject({ id: 1 });
    expect(matchFactory('  东丽  ', FACTORIES)).toMatchObject({ id: 3 });
  });

  it('写少了字（「弘隆纺织」）也能唯一命中', () => {
    expect(matchFactory('弘隆纺织', FACTORIES)).toMatchObject({ id: 2 });
  });

  const TWINS = [
    { id: 1, name: '苏州鑫研服饰', short_name: null },
    { id: 2, name: '苏州鑫研服饰有限公司', short_name: null },
  ];

  it('名字完全对得上就是那一家，不因为库里还有个更长的同族名字而犹豫', () => {
    expect(matchFactory('苏州鑫研服饰', TWINS)).toMatchObject({ id: 1 });
    expect(matchFactory('苏州鑫研服饰有限公司', TWINS)).toMatchObject({ id: 2 });
  });

  it('写少了字、两家都沾边时不猜——猜错材料就订到别人家去了', () => {
    expect(matchFactory('鑫研', TWINS)).toBe('AMBIGUOUS');
  });

  it('工厂库里有名字为空的脏数据时，不能被它「包含」命中', () => {
    // 空串被任何字符串包含；不排掉的话贴什么都会认到这条脏数据上
    const dirty = [{ id: 9, name: '', short_name: null }, { id: 1, name: '东丽', short_name: null }];
    expect(matchFactory('东丽', dirty)).toMatchObject({ id: 1 });
    expect(matchFactory('查无此厂', dirty)).toBeNull();
  });

  it('工厂库里没有的返回 null，不硬塞一个', () => {
    expect(matchFactory('查无此厂', FACTORIES)).toBeNull();
  });

  it('空名字不匹配（否则包含判定会命中所有工厂）', () => {
    expect(matchFactory('', FACTORIES)).toBeNull();
    expect(matchFactory('   ', FACTORIES)).toBeNull();
  });

  it('解析 Excel 复制来的一列：去引号、去空行', () => {
    expect(parseSupplierColumn('"坤业"\n\n 东丽 \r\n弘隆\n')).toEqual(['坤业', '东丽', '弘隆']);
  });

  it('从指定行开始往下填，前面的行不动', () => {
    const rows: any[] = [{ supplierName: '原有' }, {}, {}];
    const r = applySupplierColumn(['坤业', '东丽'], rows, 1, FACTORIES);
    expect(r.ok).toBe(2);
    expect(rows[0].supplierName).toBe('原有');
    expect(rows[1]).toMatchObject({ supplierId: 1, supplierName: '苏州市坤业纺织有限公司' });
    expect(rows[2]).toMatchObject({ supplierId: 3, supplierName: '东丽' });
  });

  it('对不上的行保留原值并逐条报出来——静默跳过会让人以为都贴上了', () => {
    const rows: any[] = [{ supplierId: 9, supplierName: '原来的' }, {}];
    const r = applySupplierColumn(['查无此厂', '东丽'], rows, 0, FACTORIES);
    expect(r.ok).toBe(1);
    expect(rows[0]).toMatchObject({ supplierId: 9, supplierName: '原来的' });
    expect(r.fails[0]).toContain('查无此厂');
    expect(r.fails[0]).toContain('找不到');
  });

  it('粘的行数超过材料行数时说清楚，不静默丢掉', () => {
    const rows: any[] = [{}];
    const r = applySupplierColumn(['坤业', '东丽'], rows, 0, FACTORIES);
    expect(r.ok).toBe(1);
    expect(r.fails[0]).toContain('材料行不够了');
  });
});
