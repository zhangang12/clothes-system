#!/usr/bin/env python3
# 从 infra/mysql/init.sql(HEAD)自动生成「全量结构补齐」段,写入 hotfix-schema.sql 标记区。
#
# 背景(2026-07-09 生产事故):hotfix-schema.sql 只覆盖了较新的手工增量,而生产库基线更老,
# 导致 8+ 张表大面积 Unknown column 500(Customer.type / OrderMain.style_no / Factory.can_invoice…)。
# 根治:每次发版由本脚本从 HEAD init.sql 重新生成——
#   ① 每张表整表 CREATE TABLE IF NOT EXISTS(老库缺整表时补表);
#   ② 每张表每一列 _i9_add_col(老库缺列时按 HEAD 定义补列,已存在跳过)。
# 任意历史版本的存量库跑一遍即可补齐到 HEAD 结构(幂等,可重复执行)。
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

CONSTRAINT_PREFIX = ('PRIMARY KEY', 'UNIQUE KEY', 'KEY ', 'CONSTRAINT', 'FOREIGN KEY', 'INDEX ')


def parse_tables(sql: str):
    """返回 [(table, full_ddl, [(col, col_ddl), ...]), ...]"""
    tables = []
    for m in re.finditer(r'CREATE TABLE IF NOT EXISTS `(\w+)` \(([\s\S]*?)\n\) (ENGINE=[^;]*);', sql):
        name, body, tail = m.group(1), m.group(2), m.group(3)
        full_ddl = f'CREATE TABLE IF NOT EXISTS `{name}` ({body}\n) {tail};'
        cols = []
        for raw in body.split('\n'):
            line = raw.strip().rstrip(',')
            if not line or line.startswith('--'):
                continue
            if any(line.upper().startswith(p) for p in CONSTRAINT_PREFIX):
                continue
            cm = re.match(r'`(\w+)`\s+(.+)$', line)
            if not cm:
                continue
            col, ddl = cm.group(1), cm.group(2).strip()
            if 'AUTO_INCREMENT' in ddl.upper():
                continue  # 主键 id 列必然存在
            cols.append((col, ddl))
        tables.append((name, full_ddl, cols))
    return tables


def main():
    sql = INIT.read_text(encoding='utf-8')
    tables = parse_tables(sql)
    if not tables:
        print('✗ 未从 init.sql 解析到任何表', file=sys.stderr)
        sys.exit(1)

    out = [BEGIN,
           '-- 目的:任意历史版本存量库 → HEAD 结构。①缺整表补表 ②缺列按 HEAD 定义补列(均幂等)。',
           '-- 注意:NOT NULL 无默认列由 MySQL DDL 隐式默认值填充存量行(数值0/字符串空),优于缺列 500。',
           '']
    for name, full_ddl, _ in tables:
        out.append(full_ddl)
        out.append('')
    out.append('-- —— 逐列补齐 + 类型同步(缺列补列;列在但类型≠HEAD 则 MODIFY,含枚举扩值/列宽) ——')
    n_cols = 0
    for name, _, cols in tables:
        out.append(f'-- {name}')
        for col, ddl in cols:
            esc = ddl.replace('"', '\\"')
            tm = re.match(r'^([A-Za-z]+(?:\([^)]*\))?)', ddl)
            ctype = (tm.group(1) if tm else ddl).replace('"', '\\"')
            out.append(f'CALL _i9_add_col(\'{name}\',\'{col}\',"{esc}");')
            out.append(f'CALL _i9_sync_col(\'{name}\',\'{col}\',"{ctype}","{esc}");')
            n_cols += 1
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
    print(f'✓ 已生成:{len(tables)} 张表 / {n_cols} 列 → {HOTFIX.name} 标记区')


if __name__ == '__main__':
    main()
