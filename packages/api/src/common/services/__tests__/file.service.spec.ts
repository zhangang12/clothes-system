import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileService } from '../file.service';
import { UploadController } from '../../../modules/upload/upload.controller';

// 2026-09-20 审查 B001/B002：敏感附件的「落盘位置」与「读取判定」两侧的漏洞，都用真实 FileService + 临时目录复现。
describe('FileService 路径归一化与敏感判定(B002)', () => {
  let service: FileService;
  let uploadRoot: string;
  const PRIV = 'private/2026/09/id-card.pdf';
  const PUB = 'misc/2026/09/photo.png';

  beforeEach(async () => {
    uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i9-file-'));
    const module = await Test.createTestingModule({
      providers: [
        FileService,
        { provide: ConfigService, useValue: { get: (k: string, d?: any) => (k === 'UPLOAD_ROOT' ? uploadRoot : d) } },
      ],
    }).compile();
    service = module.get(FileService);
    service.onModuleInit();
    for (const rel of [PRIV, PUB]) {
      fs.mkdirSync(path.dirname(path.join(uploadRoot, rel)), { recursive: true });
      fs.writeFileSync(path.join(uploadRoot, rel), 'x');
    }
  });

  afterEach(() => fs.rmSync(uploadRoot, { recursive: true, force: true }));

  // 每个变体：isPrivate 必须为 true，且 resolvePath 指向的正是那份 private 文件（判定与落盘同一口径）
  const PRIVATE_VARIANTS = [
    './private/2026/09/id-card.pdf',
    '/./private/2026/09/id-card.pdf',
    './/private/2026/09/id-card.pdf',
    '//./private/2026/09/id-card.pdf',
    'private/./2026/09/id-card.pdf',
    '.\\private\\2026\\09\\id-card.pdf',
    '%2e/private/2026/09/id-card.pdf',        // 双重编码后 express 只解一层残留的变体
    '%2e%2fprivate%2f2026%2f09%2fid-card.pdf',
    'private%2F2026%2F09%2Fid-card.pdf',
  ];

  it.each(PRIVATE_VARIANTS)('B002 isPrivate 归一化后判定：%s → 敏感', (variant) => {
    expect(service.isPrivate(variant)).toBe(true);
  });

  it.each(PRIVATE_VARIANTS)('B002 resolvePath 与 isPrivate 同口径：%s → 解析到同一份 private 文件', (variant) => {
    const full = service.resolvePath(variant);
    expect(full).toBe(path.resolve(uploadRoot, PRIV));
  });

  it('B002 归一化：正常公共路径仍是公开、仍能解析', () => {
    expect(service.isPrivate(PUB)).toBe(false);
    expect(service.isPrivate('/' + PUB)).toBe(false);
    expect(service.resolvePath(PUB)).toBe(path.resolve(uploadRoot, PUB));
  });

  it('B002 含 .. 的路径一律解析失败（不再靠删掉 .. 猜一个路径），canSign 也拒绝', () => {
    expect(service.normalizeRelPath('misc/../private/2026/09/id-card.pdf')).toBeNull();
    expect(service.resolvePath('misc/../private/2026/09/id-card.pdf')).toBeNull();
    expect(service.resolvePath('../../etc/passwd')).toBeNull();
    expect(service.resolvePath('%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    expect(service.canSign('private/../private/2026/09/id-card.pdf')).toBe(false);
    expect(service.canSign('')).toBe(false);
  });

  it('B002 canSign 对 ./private/ 变体与规范写法结论一致（真实存在即可签）', () => {
    expect(service.canSign(PRIV)).toBe(true);
    expect(service.canSign('./' + PRIV)).toBe(true);
    expect(service.canSign('private/2026/09/nope.pdf')).toBe(false);
    expect(service.canSign(PUB)).toBe(false);
  });

  describe('通过真实 UploadController.getFile 复现绕过', () => {
    let controller: UploadController;
    const res = () => ({ sendFile: jest.fn() } as any);

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [UploadController],
        providers: [{ provide: FileService, useValue: service }],
      }).compile();
      controller = module.get(UploadController);
    });

    it.each(['./private/2026/09/id-card.pdf', '/./private/2026/09/id-card.pdf', '.\\private\\2026\\09\\id-card.pdf'])(
      'B002 不带令牌用 %s 取敏感附件 → 403，不得返回文件',
      (variant) => {
        const r = res();
        expect(() => controller.getFile(variant, undefined, r)).toThrow(ForbiddenException);
        expect(r.sendFile).not.toHaveBeenCalled();
      },
    );

    it('B002 ./private/ 变体带**对该路径签发**的令牌可读，Cache-Control 走 private 分支', () => {
      const p = './private/2026/09/id-card.pdf';
      const r = res();
      controller.getFile(p, service.signToken(p), r);
      expect(r.sendFile).toHaveBeenCalledTimes(1);
      const [full, opt] = r.sendFile.mock.calls[0];
      expect(full).toBe(path.resolve(uploadRoot, PRIV));
      expect(opt.headers['Cache-Control']).toBe('private, max-age=300');
    });

    it('B002 公共文件无令牌照常可读（不破坏 <img src> 直连）', () => {
      const r = res();
      controller.getFile(PUB, undefined, r);
      expect(r.sendFile).toHaveBeenCalledTimes(1);
    });

    it('B002 穿越路径 → 404（不是 500，也不落到别的文件）', () => {
      expect(() => controller.getFile('misc/../private/2026/09/id-card.pdf', undefined, res())).toThrow(NotFoundException);
    });
  });
});

describe('FileService 敏感标志与 multipart 字段顺序(B001)', () => {
  let service: FileService;
  let uploadRoot: string;

  const makeFile = (rel: string): Express.Multer.File => {
    const full = path.join(uploadRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'x');
    return {
      path: full, destination: path.dirname(full), filename: path.basename(full),
      originalname: 'a.png', mimetype: 'image/png', size: 1,
    } as any;
  };

  beforeEach(async () => {
    uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i9-file-'));
    const module = await Test.createTestingModule({
      providers: [
        FileService,
        { provide: ConfigService, useValue: { get: (k: string, d?: any) => (k === 'UPLOAD_ROOT' ? uploadRoot : d) } },
      ],
    }).compile();
    service = module.get(FileService);
    service.onModuleInit();
  });

  afterEach(() => fs.rmSync(uploadRoot, { recursive: true, force: true }));

  it('B001 sensitive 字段排在 file 之后（destination 阶段没看到）→ 落盘后搬进 private/，返回路径须签名', () => {
    const file = makeFile('misc/2026/09/uuid-1.png');
    const oldPath = file.path;
    // 模拟：destination 时 body 为空落了 misc/，上传结束后 req.body.sensitive 才出现
    service.relocateIfSensitive({ query: {}, body: { sensitive: '1' }, user: { type: 'admin' } }, file);
    const info = service.buildFileInfo(file);
    expect(info.relativePath).toMatch(/^private\/\d{4}\/\d{2}\/uuid-1\.png$/);
    expect(service.isPrivate(info.relativePath)).toBe(true);
    expect(fs.existsSync(file.path)).toBe(true);
    expect(fs.existsSync(oldPath)).toBe(false);
  });

  it('B001 供应商账号漏传 sensitive 同样兜底搬进 private/', () => {
    const file = makeFile('misc/2026/09/uuid-2.pdf');
    service.relocateIfSensitive({ query: {}, body: {}, user: { type: 'supplier' } }, file);
    expect(service.buildFileInfo(file).relativePath.startsWith('private/')).toBe(true);
  });

  it('B001 非敏感上传不动；已在 private/ 的也不重复搬', () => {
    const pub = makeFile('misc/2026/09/uuid-3.png');
    service.relocateIfSensitive({ query: {}, body: {}, user: { type: 'admin' } }, pub);
    expect(service.buildFileInfo(pub).relativePath).toBe('misc/2026/09/uuid-3.png');
    const priv = makeFile('private/2026/01/uuid-4.png');
    service.relocateIfSensitive({ query: { sensitive: '1' }, body: {}, user: { type: 'admin' } }, priv);
    expect(service.buildFileInfo(priv).relativePath).toBe('private/2026/01/uuid-4.png');
  });
});
