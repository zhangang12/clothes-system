/* 本地端到端浏览器冒烟(真无头 Chromium → 真 web → 真 API → 真 MySQL/Redis)
 * 跑法:bash infra/scripts/local-dev-macos.sh smoke
 * 依赖:local-dev-macos.sh up 已把全栈起好(web:5173 / api:3001)
 *
 * 它做三件事,每件都是 mock 单测/构建永远测不出、必须真栈才现形的:
 *   1) 登录(admin/Admin@123)后逐个列表页数渲染行数
 *   2) 工厂列表:API 返回 N 家,但页面渲染几行?(响应展平 P0)
 *   3) 打开「新建客户」,后端是否 400 拒掉引用下拉(size=200 P0)
 */
const { chromium, request } = require('@playwright/test');
const os = require('os'); const path = require('path'); const fs = require('fs');
const WEB = process.env.WEB_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:3001/api/v1';
const SHOTS = path.join(os.homedir(), '.i9-localdev', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const LISTS = [['工厂','/factories'],['客户','/customers'],['样衣','/samples'],['报价','/quotes'],
  ['订单','/orders'],['合同','/contracts'],['对账','/reconciliations'],['付款','/payments'],['结算','/settlements']];

async function login(page) {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.locator('.login-btn').click();
  await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
}

(async () => {
  let fails = 0;
  const rc = await request.newContext();
  const lg = await (await rc.post(`${API}/auth/login`, { data: { username: 'admin', password: 'Admin@123' } })).json();
  const token = lg.data?.access_token;
  const apiList = await (await rc.get(`${API}/factories?page=1&size=50`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const apiFactories = Array.isArray(apiList.data) ? apiList.data.length : (apiList.data?.items?.length ?? 0);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then(c => c.newPage());
  const api4xx = [];
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) api4xx.push(`${r.status()} ${r.request().method()} ${r.url().replace(WEB,'')}`); });

  await login(page);
  console.log(`登录: ${page.url().endsWith('/login') ? '✗ 失败' : '✓ ' + page.url()}`);

  console.log('\n列表页渲染行数:');
  for (const [name, route] of LISTS) {
    await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(700);
    const rows = await page.locator('.el-table__row').count().catch(() => -1);
    console.log(`  ${name.padEnd(4)} ${route.padEnd(18)} ${rows} 行`);
    await page.screenshot({ path: path.join(SHOTS, `list-${route.replace(/\//g,'')}.png`) });
  }

  // 关键断言 1:工厂 API 有 N 家,页面必须渲染 N 行
  await page.goto(`${WEB}/factories`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const uiRows = await page.locator('.el-table__row').count();
  console.log(`\n[断言1] 工厂: API 返回 ${apiFactories} 家 → 页面渲染 ${uiRows} 行 → ${apiFactories === uiRows ? '✓ 一致' : '✗ 不一致(列表展平 P0)'}`);
  if (apiFactories !== uiRows) fails++;

  // 关键断言 2:新建客户页不应触发被后端拒的请求
  api4xx.length = 0;
  await page.goto(`${WEB}/customers/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  console.log(`[断言2] 新建客户页 4xx 请求: ${api4xx.length ? '✗ ' + api4xx.join('; ') + '(size=200 P0)' : '✓ 无'}`);
  if (api4xx.length) fails++;

  await browser.close();
  console.log(`\n冒烟结果: ${fails === 0 ? '✓ 全部通过' : '✗ ' + fails + ' 项断言失败(见上)'};  截图: ${SHOTS}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('冒烟异常:', e); process.exit(2); });
