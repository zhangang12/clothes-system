#!/usr/bin/env python3
# 从 infra/mysql/init.sql(HEAD)自动生成「全量结构补齐」段,写入 hotfix-schema.sql 标记区。
#
# 背景(2026-07-09 生产事故):hotfix-schema.sql 只覆盖了较新的手工增量,而生产库基线更老,
# 导致 8+ 张表大面积 Unknown column 500(Customer.type / OrderMain.style_no / Factory.can_invoice…)。
# 根治:每次发版由本脚本从 HEAD init.sql 重新生成——
#   ① 每张表整表 CREATE TABLE IF NOT EXISTS(老库缺整表时补表);
#   ② 每张表每一列 _i9_add_col(老库缺列时按 HEAD 定义补列,已存在跳过);
#   ③ 每张表每个 KEY / UNIQUE KEY _i9_add_index / _i9_add_unique(老库缺索引时补索引)。
# 任意历史版本的存量库跑一遍即可补齐到 HEAD 结构(幂等,可重复执行)。
#
# ③ 的由来(2026-08-03 真库 diff 实证):本脚本原先把所有约束行直接跳过,只生成建表和补列,
# 于是 init.sql 里声明的索引对存量库永远补不上——生产库实测缺 customer.idx_type /
# factory.idx_type / feedback.idx_user / reconciliation.idx_style_no / settlement.idx_style_no
# 5 个索引(只影响查询性能不影响正确性,但同一漏洞对以后每个新增索引都成立)。
# 现在无法识别的约束行会**直接报错退出**,不再静默丢弃——宁可发版前失败,也不要再漏一次。
#
# 用法:python3 infra/scripts/gen-column-sync.py   (改动 init.sql 后必跑,提交前跑)
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INIT = ROOT / 'infra' / 'mysql' / 'init.sql'
HOTFIX = ROOT / 'infra' / 'scripts' / 'hotfix-schema.sql'
BEGIN = '-- ▼▼ AUTO-GENERATED COLUMN SYNC(gen-column-sync.py 生成,勿手改)▼▼'
END = '-- ▲▲ AUTO-GENERATED COLUMN SYNC ▲▲'

# 建表体里「不以反引号开头」的行一律是约束行(已核对 init.sql 全部 45 张表:只有
# PRIMARY KEY / KEY / UNIQUE KEY 三种)。主键随建表产生、也不能用 ADD INDEX 补,故跳过;
# 其余必须能被 INDEX_RE 认出,认不出就报错(见文件头 ③)。
SKIP_CONSTRAINT = ('PRIMARY KEY',)
# KEY / UNIQUE KEY / INDEX / UNIQUE INDEX `名字` (`列`[,`列`...]) —— 只认这种朴素形式。
# 前缀长度 `col`(20) / DESC / FULLTEXT / SPATIAL / USING 等都匹配不上,会走报错分支:
# 那些形式 _i9_add_index 的 ADD INDEX 拼法表达不了,须人工在手工段处理。
INDEX_RE = re.compile(r'^(UNIQUE\s+)?(?:KEY|INDEX)\s+`(\w+)`\s*\(\s*(`\w+`(?:\s*,\s*`\w+`)*)\s*\)$', re.I)


def parse_tables(sql: str):
    """返回 [(table, full_ddl, [(col, col_ddl), ...], [(idx, idx_cols, is_unique), ...]), ...]"""
    tables = []
    for m in re.finditer(r'CREATE TABLE IF NOT EXISTS `(\w+)` \(([\s\S]*?)\n\) (ENGINE=[^;]*);', sql):
        name, body, tail = m.group(1), m.group(2), m.group(3)
        full_ddl = f'CREATE TABLE IF NOT EXISTS `{name}` ({body}\n) {tail};'
        cols, idxs = [], []
        for raw in body.split('\n'):
            line = raw.strip().rstrip(',')
            if not line or line.startswith('--'):
                continue
            if not line.startswith('`'):  # 约束行
                if line.upper().startswith(SKIP_CONSTRAINT):
                    continue
                im = INDEX_RE.match(line)
                if not im:
                    print(f'✗ {name}:无法解析的约束行,拒绝静默跳过(索引漏补是 2026-08-03 实证过的坑):\n    {line}\n'
                          f'  → 要么扩展本脚本的 INDEX_RE,要么在 hotfix-schema.sql 手工段自行补该约束。',
                          file=sys.stderr)
                    sys.exit(1)
                # 多列索引保持 init.sql 里的列序(索引列序决定能否命中,不可重排)
                idx_cols = ','.join(f'`{c}`' for c in re.findall(r'`(\w+)`', im.group(3)))
                idxs.append((im.group(2), idx_cols, bool(im.group(1))))
                continue
            cm = re.match(r'`(\w+)`\s+(.+)$', line)
            if not cm:
                continue
            col, ddl = cm.group(1), cm.group(2).strip()
            if 'AUTO_INCREMENT' in ddl.upper():
                continue  # 主键 id 列必然存在
            cols.append((col, ddl))
        tables.append((name, full_ddl, cols, idxs))
    return tables


def main():
    sql = INIT.read_text(encoding='utf-8')
    tables = parse_tables(sql)
    if not tables:
        print('✗ 未从 init.sql 解析到任何表', file=sys.stderr)
        sys.exit(1)

    out = [BEGIN,
           '-- 目的:任意历史版本存量库 → HEAD 结构。①缺整表补表 ②缺列按 HEAD 定义补列 ③缺索引补索引(均幂等)。',
           '-- 注意:NOT NULL 无默认列由 MySQL DDL 隐式默认值填充存量行(数值0/字符串空),优于缺列 500。',
           '']
    for name, full_ddl, _, _ in tables:
        out.append(full_ddl)
        out.append('')
    out.append('-- —— 逐列补齐 + 类型同步(缺列补列;列在但类型≠HEAD 则 MODIFY,含枚举扩值/列宽) ——')
    n_cols = 0
    for name, _, cols, _ in tables:
        out.append(f'-- {name}')
        for col, ddl in cols:
            esc = ddl.replace('"', '\\"')
            tm = re.match(r'^([A-Za-z]+(?:\([^)]*\))?)', ddl)
            ctype = (tm.group(1) if tm else ddl).replace('"', '\\"')
            out.append(f'CALL _i9_add_col(\'{name}\',\'{col}\',"{esc}");')
            out.append(f'CALL _i9_sync_col(\'{name}\',\'{col}\',"{ctype}","{esc}");')
            n_cols += 1
        out.append('')
    # 索引必须排在「所有表的列都补齐」之后:新增列上的索引,列不存在时 ADD INDEX 会直接报错中断发版。
    out.append('-- —— 索引补齐(init.sql 里 KEY→_i9_add_index / UNIQUE KEY→_i9_add_unique;索引已存在则跳过) ——')
    out.append('-- 判重只看索引名:同名但列不同的老索引不会被重建(保守,不动存量);同列不同名会多出一条冗余索引(无害)。')
    out.append('-- 唯一索引若因存量重复值加不上,_i9_add_unique 的 CONTINUE HANDLER 只告警不中断发版。')
    n_idx = 0
    for name, _, _, idxs in tables:
        if not idxs:
            continue
        out.append(f'-- {name}')
        for idx, idx_cols, uniq in idxs:
            proc = '_i9_add_unique' if uniq else '_i9_add_index'
            out.append(f"CALL {proc}('{name}','{idx}','{idx_cols}');")
            n_idx += 1
        out.append('')
    out.append(END)
    block = '\n'.join(out)

    hotfix = HOTFIX.read_text(encoding='utf-8')
    if BEGIN in hotfix:
        hotfix = re.sub(re.escape(BEGIN) + r'[\s\S]*?' + re.escape(END), block, hotfix, count=1)
    else:
        # 首次:插到幂等助手过程定义结束(DELIMITER ;)之后、手工 CALL 之前
        anchor = 'DELIMITER ;\n'
        idx = hotfix.find(anchor)
        if idx < 0:
            print('✗ hotfix-schema.sql 未找到 DELIMITER ; 插入点', file=sys.stderr)
            sys.exit(1)
        idx += len(anchor)
        hotfix = hotfix[:idx] + '\n' + block + '\n' + hotfix[idx:]
    HOTFIX.write_text(hotfix, encoding='utf-8')
    print(f'✓ 已生成:{len(tables)} 张表 / {n_cols} 列 / {n_idx} 索引 → {HOTFIX.name} 标记区')


if __name__ == '__main__':
    main()
