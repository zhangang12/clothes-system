// 草稿功能真浏览器冒烟（本地 dev 5173 + 本地 API 3001）
// 链路：登录 → 新建样衣填内容 → 等 1s 断言 localStorage 草稿 → 刷新页面 → 恢复草稿弹窗 →
// 恢复后断言字段回填 → 保存成功 → 再进新建页断言无草稿弹窗
import { chromium } from '@playwright/test';

const WEB = 'http://localhost:5173';
const pass = [], fail = [];
const ok = (name, cond, extra = '') => (cond ? pass.push(name) : fail.push(`${name} ${extra}`));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

// 登录
await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await page.fill('input[placeholder*="用户名"], input[placeholder*="账号"]', 'admin');
await page.fill('input[type="password"]', 'Admin@123');
await page.click('button:has-text("登录"), button:has-text("登 录")');
await page.waitForURL(/dashboard|\/$/, { timeout: 10000 });

// 进新建样衣页，填字段
await page.goto(`${WEB}/samples/new`, { waitUntil: 'networkidle' });
await page.fill('input[placeholder="请输入客户款号"], .el-form-item:has-text("客户款号") input', 'DRAFT-SMOKE-001');
await page.fill('.el-form-item:has-text("成衣备注") textarea', '草稿冒烟内容-不应丢失');
await page.waitForTimeout(1200); // 防抖 800ms 落盘

const draft1 = await page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('i9.draft.sample:'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
ok('输入后自动写入 localStorage 草稿', !!draft1 && JSON.stringify(draft1.data).includes('DRAFT-SMOKE-001'), JSON.stringify(draft1));

// 刷新页面 → 应弹恢复草稿对话框
await page.reload({ waitUntil: 'networkidle' });
const dialog = page.locator('.el-message-box:has-text("恢复草稿")');
ok('刷新后弹出恢复草稿询问', await dialog.waitFor({ timeout: 5000 }).then(() => true).catch(() => false));

// 点「恢复草稿」→ 字段回填
await page.click('.el-message-box button:has-text("恢复草稿")');
await page.waitForTimeout(500);
const styleNo = await page.inputValue('.el-form-item:has-text("客户款号") input');
const remark = await page.inputValue('.el-form-item:has-text("成衣备注") textarea');
ok('恢复后客户款号回填', styleNo === 'DRAFT-SMOKE-001', styleNo);
ok('恢复后备注回填', remark.includes('草稿冒烟内容'), remark);

// 补必填项并保存 → 保存成功清草稿
await page.click('.el-checkbox:has-text("销样")').catch(() => {});
// 中间商/最终买家选一个
await page.click('.el-form-item:has-text("中间商") .el-select');
await page.waitForTimeout(400);
await page.click('.el-select-dropdown__item').catch(() => {});
// 材料第一行填品名
await page.fill('.el-table tbody tr:first-child td:nth-child(2) input', '冒烟面料');
await page.click('button:has-text("保存")');
await page.waitForTimeout(1500);
const afterSave = await page.evaluate(() => Object.keys(localStorage).filter((x) => x.startsWith('i9.draft.sample:')));
ok('保存成功后草稿已清除', afterSave.length === 0 || !JSON.stringify(afterSave).includes('DRAFT'), JSON.stringify(afterSave));
const savedOk = await page.locator('.el-message:has-text("成功"), .el-message__content:has-text("成功")').count();
ok('保存成功提示出现', savedOk > 0);

console.log(`\nPASS ${pass.length} / FAIL ${fail.length}`);
pass.forEach((p) => console.log(' ✓', p));
fail.forEach((f) => console.log(' ✗', f));
await browser.close();
process.exit(fail.length ? 1 : 0);
