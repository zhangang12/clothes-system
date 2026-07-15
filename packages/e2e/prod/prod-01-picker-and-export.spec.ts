import { test, expect, Page } from '@playwright/test';

/**
 * 已部署环境只读验收：对账「搜款号→选合同→带出工厂」/ 付款工厂选择器 / 样衣导出 Excel。
 * 只浏览不建单——不在生产留下任何单据。
 */

// 口令一律从环境变量传入——生产凭据不进仓库：
//   E2E_USER=admin E2E_PASS='<口令>' npx playwright test -c playwright.prod.config.ts
const USER = process.env.E2E_USER ?? 'admin';
const PASS = process.env.E2E_PASS;
const STYLE = process.env.E2E_STYLE ?? 'I27.230.03929';

if (!PASS) throw new Error('缺少 E2E_PASS 环境变量（被测环境的登录口令，禁止写进仓库）');

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('[placeholder="请输入用户名"]', USER);
  await page.fill('[placeholder="请输入密码"]', PASS);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/dashboard/, { timeout: 20000 });
}

test.describe('生产验收：选择器与导出', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('对账新建：搜款号 → 选合同 → 自动带出工厂名称', async ({ page }) => {
    await page.goto('/reconciliations');
    await page.getByRole('button', { name: '新建对账单' }).click();
    const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新建对账单' });
    await expect(dialog).toBeVisible();

    // 选合同前应提示尚未选择
    await expect(dialog.locator('.picked-bar')).toContainText('尚未选择合同');

    await dialog.locator('input[placeholder="输入款号回车搜合同"]').fill(STYLE);
    await dialog.getByRole('button', { name: '搜合同' }).click();

    // 打开「选合同」下拉，应出现搜到的合同
    // 注：el-select 的 placeholder 渲染成独立 span 而非 input 属性，按 combobox 角色定位
    await dialog.getByRole('combobox', { name: '选合同' }).click();
    const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item');
    await expect(options.first()).toBeVisible({ timeout: 15000 });
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(0);
    await options.first().click();

    // 选中后带出工厂名称，而不是回退成「工厂#<数字ID>」
    const bar = dialog.locator('.picked-bar');
    await expect(bar).toContainText('选中合同带出工厂');
    const barText = (await bar.textContent()) ?? '';
    expect(barText).not.toMatch(/工厂#\d+/);
    console.log('  [对账] 搜到合同 %d 个；带出工厂 → %s', optionCount, barText.trim().split('补料')[0].trim());
  });

  test('付款新建付款申请：工厂是名称选择器（不是裸数字ID输入）', async ({ page }) => {
    await page.goto('/payments');
    await page.getByRole('tab', { name: '付款申请' }).click();
    await page.getByRole('button', { name: '新建付款申请' }).click();
    const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新建付款申请' });
    await expect(dialog).toBeVisible();

    const factoryItem = dialog.locator('.el-form-item').filter({ hasText: '工厂' }).first();
    // 改造前是 el-input-number（裸 ID），改造后应为可搜索的 el-select
    await expect(factoryItem.locator('.el-input-number')).toHaveCount(0);
    await factoryItem.locator('input').first().click();

    const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item');
    await expect(options.first()).toBeVisible({ timeout: 15000 });
    const names = await options.allTextContents();
    expect(names.length).toBeGreaterThan(0);
    // 下拉里给的是工厂名称，不是数字
    expect(names.every((n) => /^\d+$/.test(n.trim()))).toBe(false);
    console.log('  [付款] 工厂下拉 %d 项：%s', names.length, names.map((n) => n.trim()).join(' / '));
  });

  test('样衣列表：导出 Excel 能下出文件且内容正确（中文不乱码、款号不被截断）', async ({ page }) => {
    await page.goto('/samples');
    await expect(page.locator('.el-table')).toBeVisible();
    const firstRow = page.locator('.el-table__body tr').first();
    const styleNo = ((await firstRow.locator('td').allTextContents()).find((t) => /I\d/.test(t)) ?? '').trim();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      firstRow.getByRole('button', { name: '导出Excel' }).click(),
    ]);
    const name = download.suggestedFilename();
    expect(name).toMatch(/\.xls$/);

    const path = await download.path();
    const content = require('fs').readFileSync(path!, 'utf8');
    expect(content.charCodeAt(0)).toBe(0xfeff);            // BOM：Excel 按 UTF-8 打开，中文不乱码
    expect(content).toContain('mso-number-format');          // 款号强制文本，不被当数字截断
    expect(content).toContain('样衣制作单');
    expect(content).not.toContain('锟斤拷');                  // 乱码哨兵
    if (styleNo) expect(content).toContain(styleNo);
    // 生产现存样衣未填寄样轮次 → 走旧数据分支，不应渲染寄样跟踪表
    expect(content).not.toContain('寄样跟踪');
    console.log('  [样衣] 下载 %s（%d 字节）；含寄样跟踪表：%s', name, content.length, content.includes('寄样跟踪'));
  });

  // 生产现有样衣都没填寄样轮次，多轮分支在真实 UI 上无从触发。
  // 用请求拦截给详情响应注入轮次，跑的仍是线上 bundle，且不往生产写任何数据。
  test('样衣导出：多轮寄样的轮次明细与合计进入文件（拦截注入，不落库）', async ({ page }) => {
    await page.route('**/api/v1/samples/*', async (route) => {
      const resp = await route.fetch();
      const body = await resp.json();
      if (body?.data && !Array.isArray(body.data)) {
        body.data.shipRounds = [
          { round_no: 1, size: 'M', qty: 2, ship_date: '2026-07-08', ship_no: 'FH-001', return_date: '2026-07-10', labor_unit_price: 30, labor_amount: 60 },
          { round_no: 2, size: 'L', qty: 3, ship_date: '2026-07-12', ship_no: 'FH-002', return_date: '2026-07-14', labor_unit_price: 30, labor_amount: 90 },
        ];
        body.data.piece_count = 5;
        body.data.material_ship_no = null;
        body.data.ship_sample_date = null;
      }
      await route.fulfill({ response: resp, body: JSON.stringify(body) });
    });

    await page.goto('/samples');
    await expect(page.locator('.el-table')).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.locator('.el-table__body tr').first().getByRole('button', { name: '导出Excel' }).click(),
    ]);
    const content = require('fs').readFileSync((await download.path())!, 'utf8');

    expect(content).toContain('寄样跟踪');
    expect(content).toContain('FH-001');
    expect(content).toContain('FH-002');
    expect(content).toContain('2026-07-14');
    expect(content).toMatch(/合计<\/td><td class="k">5</);      // 件数 2+3
    expect(content).toMatch(/<td class="k">150<\/td>/);          // 工价 60+90
    // 基本信息的寄出单号/寄样日期回落首轮（旧单值列已不再回填）
    expect(/材料寄出单号<\/td><td>([^<]*)</.exec(content)?.[1]).toBe('FH-001');
    expect(/寄样日期<\/td><td>([^<]*)</.exec(content)?.[1]).toBe('2026-07-08');
    console.log('  [样衣·多轮] 寄样跟踪表已进导出；件数合计 5、工价合计 150、单号回落首轮 FH-001 ✓');
  });
});
