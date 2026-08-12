// 整列粘贴供应商（2026-08-12 daisy #84：「供应商这栏希望可以复制粘贴，不需要一个个去重复找再点」）。
//
// 「批量设置供应商」只解决"几十行同一个供应商"；她的场景是**每行不同、名单在 Excel 里**，
// 所以要能把一整列贴进来。匹配逻辑单独放这里，是因为它是全流程里最容易出错的一环：
// 认错一家工厂，材料就会订到别人那儿去，而界面上看不出任何异常。

export interface FactoryLite { id: number; name?: string | null; short_name?: string | null }

const norm = (x: unknown) => String(x ?? '').replace(/\s+/g, '');

/**
 * 按名称找工厂。依次尝试：完全相同 → 去空格相同 → 唯一包含。
 *
 * 【为什么撞车时返回 AMBIGUOUS 而不是取第一个】工厂库里「苏州鑫研服饰」和「苏州鑫研服饰有限公司」
 * 这种互相包含的名字很常见。猜错了材料就订到另一家去了，而界面上完全看不出来——
 * 宁可让人自己选一次，也不能替他猜。
 */
export function matchFactory(name: string, list: FactoryLite[]): FactoryLite | 'AMBIGUOUS' | null {
  const raw = String(name ?? '').trim();
  if (!raw) return null;

  const exact = list.filter((f) => f.name === raw || f.short_name === raw);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return 'AMBIGUOUS';

  const n = norm(raw);
  const same = list.filter((f) => norm(f.name) === n || norm(f.short_name) === n);
  if (same.length === 1) return same[0];
  if (same.length > 1) return 'AMBIGUOUS';

  // 工厂名为空的记录要排掉：空串被任何字符串「包含」，不排会命中一片
  const inc = list.filter((f) => {
    const fn = norm(f.name);
    return !!fn && (fn.includes(n) || n.includes(fn));
  });
  if (inc.length === 1) return inc[0];
  if (inc.length > 1) return 'AMBIGUOUS';
  return null;
}

/** 剪贴板文本 → 一列名字（去掉 Excel 复制常带的引号与空行） */
export function parseSupplierColumn(text: string): string[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((x) => x.replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
}

export interface PasteResult { ok: number; fails: string[] }

/**
 * 从 startIdx 起逐行填入供应商。
 * **匹配不到的行原样保留、不清空**，并逐条报出来——静默跳过的话业务会以为都贴上了，
 * 等到生成合同才发现有几行没供应商。
 */
export function applySupplierColumn(
  names: string[],
  rows: Array<{ supplierId?: number; supplierName?: string }>,
  startIdx: number,
  factories: FactoryLite[],
): PasteResult {
  const fails: string[] = [];
  let ok = 0;
  for (let i = 0; i < names.length; i++) {
    const row = rows[startIdx + i];
    if (!row) { fails.push(`第 ${i + 1} 个「${names[i]}」：材料行不够了`); continue; }
    const f = matchFactory(names[i], factories);
    if (f === 'AMBIGUOUS') { fails.push(`「${names[i]}」：工厂库里有多家对得上，没敢猜`); continue; }
    if (!f) { fails.push(`「${names[i]}」：工厂库里找不到`); continue; }
    row.supplierId = f.id;
    row.supplierName = f.name ?? '';
    ok += 1;
  }
  return { ok, fails };
}
