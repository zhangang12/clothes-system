// 打印窗口里的「打印 / 保存为 PDF」条（2026-09-16 #143 YSM：「PDF 导出来不能保存文件么」）。
//
// 打印/PDF 都是 window.open 一个空白窗口写入 HTML、onload 自动弹打印框。打印框一旦点了「取消」，
// 留下的是一个 about:blank 窗口：没有菜单、没有按钮，Ctrl+S 存下来也只是网页——人就卡住了。
// 这里在页面顶部放一条只在屏幕上显示的操作条：随时能重新弹打印框，并说清「存成文件」怎么选。
// 打印/存 PDF 时这条自动隐藏，不会印进单据里。
export const PRINT_TOOLBAR_CSS = `
  .pdf-bar { position:sticky; top:0; z-index:9; display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    margin:0 0 12px; padding:8px 12px; background:#FFF8EC; border:1px solid #F0D9B5; border-radius:6px;
    font-size:13px; color:#5C4A2E; }
  .pdf-bar button { padding:6px 14px; border:0; border-radius:4px; background:#1E3A5F; color:#fff; font-size:13px; cursor:pointer; }
  @media print { .pdf-bar { display:none !important; } }`;

export const PRINT_TOOLBAR_HTML = `<div class="pdf-bar"><button type="button" onclick="window.print()">打印 / 保存为 PDF</button>`
  + `<span>要存成文件：在打印窗口里把「打印机」选成「另存为 PDF」，再点「保存」。</span></div>`;

/**
 * 给「写进打印窗口」的整页 HTML 加上操作条：样式插在第一个 </style> 前，操作条插在 <body…> 后。
 * 单据正文一个字不动——样衣制作单要求「操作台预览与真打印逐字相同」（samplePrint.spec），
 * 所以操作条只在开窗口这一步加，不进各单据的 HTML 生成函数。
 */
export function withPrintToolbar(html: string): string {
  return html
    .replace('</style>', `${PRINT_TOOLBAR_CSS}\n</style>`)
    .replace(/<body([^>]*)>/, (_m, attrs) => `<body${attrs}>${PRINT_TOOLBAR_HTML}`);
}

