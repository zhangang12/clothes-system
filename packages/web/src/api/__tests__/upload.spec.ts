import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPost = vi.fn().mockResolvedValue({ data: { url: '/api/v1/uploads/file?p=misc%2Fa.pdf' } });
vi.mock('../index', () => ({ http: { post: (...a: any[]) => mockPost(...a) } }));

import { uploadApi, UPLOAD_TIMEOUT_MS } from '../upload';

const fileOf = (name: string) => ({ name, size: 10 * 1024 * 1024 } as unknown as File);

describe('uploadApi 超时（B089）', () => {
  beforeEach(() => { mockPost.mockClear(); });

  it('B089 上传单独给更长超时——全局 15s 对 20MB 附件必报「上传失败」，服务端却可能已落盘', () => {
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('B089 每次上传都把这个超时带上', async () => {
    await uploadApi.upload(fileOf('对账单.pdf'));
    expect(mockPost).toHaveBeenCalledWith('/uploads', expect.anything(),
      expect.objectContaining({ timeout: UPLOAD_TIMEOUT_MS }));
  });

  it('B089 敏感附件走 sensitive=1，超时同样放宽', async () => {
    await uploadApi.upload(fileOf('水单.pdf'), { sensitive: true });
    expect(mockPost).toHaveBeenCalledWith('/uploads?sensitive=1', expect.anything(),
      expect.objectContaining({ timeout: UPLOAD_TIMEOUT_MS }));
  });

  it('B089 Content-Type 仍是 multipart（别把 headers 覆盖掉）', async () => {
    await uploadApi.upload(fileOf('a.png'));
    expect(mockPost.mock.calls[0][2].headers['Content-Type']).toBe('multipart/form-data');
  });
});
