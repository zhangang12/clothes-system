import { describe, it, expect } from 'vitest';
import { fileNameOf, kindOf, extOf } from '../filePreview';

/**
 * B021：全站水单/发票/对账单点「查看」都显示「无法预览」。
 * 根因是按**调用方传的中文标题**判类型（'付款水单'、'发票 xxx'、'对账单' 都没有扩展名），
 * 判型必须看 URL——敏感附件地址形如 /api/v1/uploads/file?p=private%2F2026%2F09%2Fxxx.pdf。
 */
const PRIVATE_PDF = '/api/v1/uploads/file?p=private%2F2026%2F09%2Fa1b2.pdf';
const PRIVATE_PDF_SIGNED = `${PRIVATE_PDF}&t=abc123`;
const PUBLIC_PNG = '/api/v1/uploads/file?p=misc%2F2026%2F09%2Fshot.png';
const PRIVATE_XLSX = '/api/v1/uploads/file?p=private%2F2026%2F09%2Fstatement.xlsx';

describe('filePreview 按 URL 判文件类型（B021）', () => {
  it('B021 从 p 参数解出真实文件名（URL 编码过，取最后一段）', () => {
    expect(fileNameOf(PRIVATE_PDF)).toBe('a1b2.pdf');
    expect(fileNameOf(PRIVATE_PDF_SIGNED)).toBe('a1b2.pdf'); // 带签名令牌也要认得出
    expect(fileNameOf(PUBLIC_PNG)).toBe('shot.png');
  });

  it('B021 没有 p 参数的老地址退回路径尾段', () => {
    expect(fileNameOf('/uploads/2026/09/old.jpg')).toBe('old.jpg');
    expect(fileNameOf('https://x.com/a/b/c.pdf?v=2')).toBe('c.pdf');
  });

  it('B021 中文标题不带扩展名——这正是原来判成「未知格式」的输入', () => {
    expect(extOf(fileNameOf('付款水单'))).toBe('');
    expect(kindOf('付款水单')).toBe('other');
  });

  it('B021 水单/发票 PDF → pdf（原来是 other，弹窗显示「没法在页面里预览」）', () => {
    expect(kindOf(PRIVATE_PDF)).toBe('pdf');
    expect(kindOf(PRIVATE_PDF_SIGNED)).toBe('pdf');
  });

  it('B021 图片水单 → image', () => {
    expect(kindOf(PUBLIC_PNG)).toBe('image');
    for (const e of ['jpg', 'jpeg', 'gif', 'webp', 'bmp']) {
      expect(kindOf(`/api/v1/uploads/file?p=misc%2Fa.${e}`)).toBe('image');
    }
  });

  it('B021 对账单 xlsx → sheet（页面内解析成表格）；xls 老格式只能下载', () => {
    expect(kindOf(PRIVATE_XLSX)).toBe('sheet');
    expect(kindOf('/api/v1/uploads/file?p=private%2Fold.xls')).toBe('other');
  });

  it('B021 扩展名只认结尾，不被路径里的点号骗到', () => {
    expect(kindOf('/api/v1/uploads/file?p=private%2Fa.pdf.docx')).toBe('other');
    expect(kindOf('/api/v1/uploads/file?p=private%2F2026.09%2Fb.png')).toBe('image');
  });
});
