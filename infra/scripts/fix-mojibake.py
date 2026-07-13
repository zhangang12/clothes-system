#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
# 全库「双重编码乱码」扫描 / 修复（UTF-8 被当 Latin1 存入，如 æˆ˜ç•¥=战略）
#   安全判定：仅当 双重解码后【变短】且【不产生 ? 替换符】且【确有变化】才算真乱码
#            → 正确中文(解码会变成 ??? )、纯 ASCII、正常 Latin 文本 一律不动。
#   在服务器上运行（用 docker exec i9_mysql）。
#   用法：  python3 fix-mojibake.py            # 只扫描并报告（只读）
#           python3 fix-mojibake.py --fix      # 先整库备份，再修，再复扫归零
#   需环境变量 MYSQL_ROOT_PASSWORD（脚本会尝试从 .env.production 读取）。
# ============================================================
import subprocess, sys, os, re

DB = 'i9_clothes'
CONTAINER = 'i9_mysql'

def load_pw():
    pw = os.environ.get('MYSQL_ROOT_PASSWORD')
    if pw:
        return pw
    for p in ('/opt/i9/clothes-system/.env.production',
              os.path.join(os.path.dirname(__file__), '..', '..', '.env.production')):
        try:
            for line in open(p, encoding='utf-8'):
                m = re.match(r'^MYSQL_ROOT_PASSWORD=(.*)$', line.strip())
                if m:
                    return m.group(1).strip().strip('"').strip("'")
        except OSError:
            pass
    sys.exit('未找到 MYSQL_ROOT_PASSWORD')

PW = load_pw()

def q(sql):
    r = subprocess.run(
        ['docker', 'exec', '-i', CONTAINER, 'mysql', '-uroot', '-p' + PW,
         '--default-character-set=utf8mb4', '-N', '-B', DB, '-e', sql],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
    if r.returncode != 0:
        sys.stderr.write('SQL 失败: ' + r.stderr[:200] + '\n')
    return r.stdout

def fixexpr(c):
    return f"CONVERT(BINARY(CONVERT(`{c}` USING latin1)) USING utf8mb4)"

def cond(c):
    f = fixexpr(c)
    # 真乱码：有变化 + 不产生 ? + 解码后变短（多字节 latin1 → 单个汉字）
    return (f"`{c}` IS NOT NULL AND `{c}` <> '' AND `{c}` <> {f} "
            f"AND {f} NOT LIKE '%?%' "
            f"AND CHAR_LENGTH({f}) < CHAR_LENGTH(`{c}`)")

def main():
    do_fix = '--fix' in sys.argv
    cols = q("SELECT table_name,column_name FROM information_schema.columns "
             f"WHERE table_schema='{DB}' AND data_type IN "
             "('varchar','char','text','tinytext','mediumtext','longtext') "
             "ORDER BY table_name,ordinal_position")
    affected = []
    for line in cols.strip().split('\n'):
        if '\t' not in line:
            continue
        t, c = line.split('\t')[:2]
        n = q(f"SELECT COUNT(*) FROM `{t}` WHERE {cond(c)}").strip()
        if n.isdigit() and int(n) > 0:
            sample = q(f"SELECT CONCAT(LEFT(`{c}`,16),'  =>  ',LEFT({fixexpr(c)},16)) "
                       f"FROM `{t}` WHERE {cond(c)} LIMIT 2").strip().replace('\n', '   |   ')
            affected.append((t, c, int(n)))
            print(f"  {t}.{c:<22} {n:>4} 行   例: {sample}")

    total = sum(x[2] for x in affected)
    print(f"\n共 {len(affected)} 列 / {total} 行 疑似乱码")

    if not do_fix or not affected:
        if do_fix and not affected:
            print("无需修复。")
        return

    ts = q("SELECT DATE_FORMAT(NOW(),'%Y%m%d_%H%i%s')").strip()
    dump = f"/data/backups/{DB}_pre_mojibake_{ts}.sql.gz"
    print(f"\n① 修复前整库备份 → {dump}")
    subprocess.run(
        f"docker exec {CONTAINER} mysqldump -uroot -p{PW} --single-transaction "
        f"--routines --triggers {DB} 2>/dev/null | gzip > {dump}", shell=True)
    if not (os.path.exists(dump) and os.path.getsize(dump) > 0):
        sys.exit('备份失败，已中止（未改动数据）')
    print(f"   备份完成 {os.path.getsize(dump)//1024} KB")

    print("② 逐列修复…")
    for t, c, n in affected:
        q(f"UPDATE `{t}` SET `{c}` = {fixexpr(c)} WHERE {cond(c)}")

    print("③ 复扫验证…")
    rem = 0
    for t, c, _ in affected:
        rem += int(q(f"SELECT COUNT(*) FROM `{t}` WHERE {cond(c)}").strip() or 0)
    print(f"   剩余乱码行 = {rem}  ({'✓ 已清零' if rem == 0 else '⚠ 仍有残留'})")

if __name__ == '__main__':
    main()
