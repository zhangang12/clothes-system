/* 浏览器自动化:登录管理端 → 导出「系统报错」+「用户反馈」HTML 报告并下载;
 * 反馈报告再渲染成 PNG(内嵌用户截图随之加载),便于直接查看。
 * 用法: node infra/scripts/ops-fetch-reports.cjs [WEB_URL] [OUT_DIR] [user] [pass]
 * 输出: <OUT_DIR>/报错报告.html / 反馈报告.html / 反馈报告.png + 控制台摘要行 OPS_SUMMARY=... */
const { chromium } = require('/Users/zhangang/Desktop/样衣管理系统/clothes-system/node_modules/@playwright/test');
const fs = require('fs'); const path = require('path');
const WEB = process.argv[2] || 'http://123.57.87.30';
const OUT = process.argv[3] || require('os').homedir() + '/.i9-ops-reports';
const USER = process.argv[4] || 'admin';
const PASS = process.argv[5] || 'Admin@123';
fs.mkdirSync(OUT, { recursive: true });

const grabTotal = async (page, route) => {
  await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1000);
  const t = await page.locator('.el-pagination__total, .el-pagination .el-pagination__total').first().innerText().catch(() => '');
  const m = t.match(/(\d+)/); return m ? +m[1] : (await page.locator('.el-table__row').count().catch(() => 0));
};

const exportReport = async (page, saveTo) => {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: /导出 HTML/ }).first().click(),
  ]);
  await dl.saveAs(saveTo);
};

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const jsErr = []; page.on('pageerror', e => jsErr.push(String(e).slice(0, 120)));

  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('请输入用户名').fill(USER);
  await page.getByPlaceholder('请输入密码').fill(PASS);
  await page.locator('.login-btn').click();
  await page.waitForTimeout(1500);
  if (page.url().endsWith('/login')) { console.log('OPS_SUMMARY=登录失败'); await b.close(); process.exit(1); }

  // 系统报错
  const errN = await grabTotal(page, '/error-logs');
  let errFile = ''; if (errN > 0) { errFile = path.join(OUT, '报错报告.html'); await exportReport(page, errFile).catch(() => errFile = ''); }
  // 用户反馈
  const fbN = await grabTotal(page, '/feedbacks');
  let fbFile = '', fbShot = '';
  if (fbN > 0) {
    fbFile = path.join(OUT, '反馈报告.html');
    await exportReport(page, fbFile).catch(() => fbFile = '');
    // 从反馈报告解析用户截图 URL,用已登录上下文逐张下载(反馈图为公共能力URL)
    if (fbFile) {
      const html = fs.readFileSync(fbFile, 'utf8');
      const urls = [...new Set((html.match(/uploads\/file\?p=[^"'\s<>]+/g) || []))]
        .map(u => u.startsWith('http') ? u : `${WEB}/api/v1/${u.replace(/^\/?(api\/v1\/)?/, '')}`);
      let n = 0;
      for (const u of urls) {
        try {
          const resp = await ctx.request.get(u);
          if (resp.ok()) {
            const f = path.join(OUT, `反馈图-${++n}.png`);
            fs.writeFileSync(f, await resp.body());
          }
        } catch {}
      }
      fbShot = n ? `${n}张(反馈图-1..${n}.png)` : '无';
    }
  }

  await b.close();
  console.log(`OPS_SUMMARY=报错${errN}条|反馈${fbN}条|报错报告=${errFile || '无'}|反馈报告=${fbFile || '无'}|反馈截图=${fbShot || '无'}|JS错=${jsErr.length}`);
})().catch(e => { console.log('OPS_SUMMARY=异常:' + e.message.slice(0, 80)); process.exit(1); });
