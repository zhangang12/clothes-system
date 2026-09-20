import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankPriceRows, blankPriceMessage, localDateStr, isPastDue, amountText } from '../contractChecks';

const src = (f: string) => readFileSync(join(process.cwd(), 'src', 'views', 'contract', f), 'utf8');

describe('合同页纯逻辑（2026-09-20 审查）', () => {
  // ── B098：货物明细单价留空保存无提示 ──
  it('B098 单价为空/0/非数字的行都要被点名，行号按表格行号（1 起）', () => {
    expect(blankPriceRows([
      { unit_price: 8 }, { unit_price: undefined }, { unit_price: 0 }, { unit_price: '' }, { unit_price: 'abc' }, { unit_price: 0.035 },
    ])).toEqual([2, 3, 4, 5]);
    expect(blankPriceRows([])).toEqual([]);
  });

  it('B098 提示最多点名 3 行，并说清后果', () => {
    expect(blankPriceMessage([])).toBeNull();
    expect(blankPriceMessage([2])).toBe('货物明细第 2 行没填单价，合同总价会按 0 计算。仍要保存吗？');
    expect(blankPriceMessage([1, 2, 3, 4, 5])).toBe('货物明细第 1、2、3 行 等 5 行没填单价，合同总价会按 0 计算。仍要保存吗？');
  });

  // ── B101 / B091：datetime 直接截前 10 位会少一天 ──
  it('B101 UTC ISO 串按本地日历日取值，DATE 串原样返回', () => {
    expect(localDateStr('2026-09-20')).toBe('2026-09-20');
    const iso = '2026-09-19T16:00:00.000Z';   // 北京时间 09-20 00:00
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    expect(localDateStr(iso)).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    if (d.getTimezoneOffset() < 0) expect(localDateStr(iso)).toBe('2026-09-20'); // 东区必须是 09-20，不是截出来的 09-19
    expect(localDateStr(null)).toBe('');
    expect(localDateStr('')).toBe('');
    expect(localDateStr('not-a-date')).toBe('not-a-date');
  });

  // ── B099：合同到期判断用 UTC 零点解析，当天到期从 8:01 起就标逾期 ──
  it('B099 到期日当天不算逾期，前一天才算；空值不算', () => {
    expect(isPastDue('2026-09-20', '2026-09-20')).toBe(false);
    expect(isPastDue('2026-09-19', '2026-09-20')).toBe(true);
    expect(isPastDue('2026-09-21', '2026-09-20')).toBe(false);
    expect(isPastDue(null, '2026-09-20')).toBe(false);
    // 到期日以 UTC ISO 下发（北京 09-20 00:00）时，今天 09-20 同样不算逾期
    const iso = '2026-09-19T16:00:00.000Z';
    expect(isPastDue(iso, localDateStr(iso))).toBe(false);
  });

  // ── B149：详情抽屉金额没做 null 兜底 ──
  it('B149 金额为空显示「—」，字段缺失不显示 NaN', () => {
    expect(amountText('CNY', null)).toBe('—');
    expect(amountText('CNY', undefined)).toBe('—');
    expect(amountText('CNY', 'abc')).toBe('—');
    expect(amountText('CNY', 12000)).toBe('CNY 12000.00');
    expect(amountText('CNY', '0')).toBe('CNY 0.00');
  });
});

// 页面组件太重（表单 + 十几个子表），这几条按源码钉住，与仓库既有的 *-guard.spec 同一路数
describe('合同页守卫（2026-09-20 审查）', () => {
  it('B023 编辑权限：editable 同时看状态与角色，无权账号点「查看」进草稿合同也不能改', () => {
    const s = src('ContractEditView.vue');
    expect(s).toMatch(/const canEdit = computed\(\(\) => authStore\.hasRole\(UserRole\.ADMIN\) \|\| authStore\.hasRole\(UserRole\.BUSINESS\)\)/);
    expect(s).toMatch(/const editable = computed\(\(\) => !statusLocked\.value && canEdit\.value\)/);
    // 保存/推送/复制/补料这些写操作按钮都要跟着权限走，别摆在那儿让人点了才 403
    expect(s).toMatch(/v-if="!editable && contractId && canEdit"/);          // 保存备注
    expect(s).toMatch(/form\.portal_status === 'DRAFT' && canEdit/);          // 推送
    expect(s).toMatch(/v-if="contractId && canEdit" plain @click="goCopy"/);  // 复制
    expect(s).toMatch(/<el-input v-model="form\.remark" :disabled="!canEdit" \/>/);
  });

  it('B096 两个订单下拉都走远程搜索（主下拉 + 「选订单款号带入」弹窗），不是前 100 条本地过滤', () => {
    const s = src('ContractEditView.vue');
    const blocks = [...s.matchAll(/<el-select\b([\s\S]*?)>([\s\S]*?)<\/el-select>/g)]
      .filter((m) => /\.order_no\b/.test(m[2]));
    expect(blocks).toHaveLength(2);
    for (const b of blocks) {
      expect(b[1]).toMatch(/(^|\s):?remote(?![-\w])/);
      expect(b[1]).toMatch(/\bfilterable\b/);
      expect(b[1]).toMatch(/remote-method/);
    }
    // 不再有「拉前 100 条当全部」的取数（B102 同类）
    expect(s).not.toMatch(/orderApi\.list\(\{ page: 1, size: 100 \}\)/);
  });

  it('B097 默认签约日期走 todayStr()（不是 toISOString 的 UTC 日期）', () => {
    const s = src('ContractEditView.vue');
    expect(s).toMatch(/sign_place: '', sign_date: todayStr\(\)/);
    expect(s).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  });

  it('B110/B107/B152/B160：列表页状态按钮有进行中标志、搜索重置页码、导出走全量、排序不跨页', () => {
    const s = src('ContractListView.vue');
    expect(s).toMatch(/const acting = ref<string \| null>\(null\)/);
    expect(s).toMatch(/:loading="acting === `push:\$\{row\.id\}`"/);
    expect(s).toMatch(/function search\(\) \{ query\.page = 1; load\(\); \}/);
    expect(s).toMatch(/await exportAll\(/);
    expect(s).toMatch(/:sortable="sortableLocal"/);
  });

  it('B155：本司主体列表拉失败时不让保存（别存出没有乙方抬头的合同）', () => {
    const s = src('ContractEditView.vue');
    expect(s).toMatch(/companiesFailed\.value = true/);
    expect(s).toMatch(/if \(companiesFailed\.value && !form\.company_id\) return '本司主体列表加载失败/);
  });
});
