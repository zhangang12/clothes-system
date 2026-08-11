import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileService } from '../../../common/services/file.service';
import { UploadController } from '../upload.controller';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';

// L9 回归：敏感标志不可纯客户端自声明(供应商上传强制私有)；
// /uploads/sign 须校验文件存在且确属 private/，供应商 token 不得兑换。
describe('FileService 敏感判定与签发校验(L9)', () => {
  let service: FileService;
  let uploadRoot: string;

  beforeEach(async () => {
    uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i9-upload-'));
    const module = await Test.createTestingModule({
      providers: [
        FileService,
        {
          provide: ConfigService,
          useValue: { get: (k: string, d?: any) => (k === 'UPLOAD_ROOT' ? uploadRoot : d) },
        },
      ],
    }).compile();
    service = module.get(FileService);
    service.onModuleInit();
  });

  afterEach(() => {
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  });

  describe('isSensitiveUpload()', () => {
    it('UT-UP-01: 客户端显式 sensitive=1 按敏感处理', () => {
      expect(service.isSensitiveUpload({ query: { sensitive: '1' }, user: { type: 'admin' } })).toBe(true);
      expect(service.isSensitiveUpload({ body: { sensitive: '1' }, user: { type: 'admin' } })).toBe(true);
    });

    it('UT-UP-02: 供应商账号即使漏传 sensitive 也强制私有兜底', () => {
      expect(service.isSensitiveUpload({ query: {}, user: { type: 'supplier' } })).toBe(true);
    });

    it('UT-UP-03: 内部员工未传 sensitive 仍走公共目录(不破坏既有公共流)', () => {
      expect(service.isSensitiveUpload({ query: {}, user: { type: 'admin' } })).toBe(false);
    });
  });

  describe('canSign()', () => {
    const exist = 'private/2026/07/a.pdf';

    beforeEach(() => {
      // 造一份真实存在的 private 文件 + 一份公共目录文件
      fs.mkdirSync(path.join(uploadRoot, 'private/2026/07'), { recursive: true });
      fs.writeFileSync(path.join(uploadRoot, exist), 'x');
      fs.mkdirSync(path.join(uploadRoot, 'misc/2026/07'), { recursive: true });
      fs.writeFileSync(path.join(uploadRoot, 'misc/2026/07/b.pdf'), 'x');
    });

    it('UT-UP-04: private/ 下真实存在的文件可签发', () => {
      expect(service.canSign(exist)).toBe(true);
    });

    it('UT-UP-05: private/ 下不存在的文件拒绝签发', () => {
      expect(service.canSign('private/2026/07/not-exists.pdf')).toBe(false);
    });

    it('UT-UP-06: 公共目录文件无需(也不允许)签发', () => {
      expect(service.canSign('misc/2026/07/b.pdf')).toBe(false);
    });

    it('UT-UP-07: 路径穿越一律拒绝', () => {
      expect(service.canSign('private/../private/2026/07/a.pdf')).toBe(false);
      expect(service.canSign('private/../../etc/passwd')).toBe(false);
      expect(service.canSign('')).toBe(false);
    });
  });
});

describe('UploadController sign(L9)', () => {
  let controller: UploadController;
  const mockFileService = {
    canSign: jest.fn(),
    signToken: jest.fn().mockReturnValue('1234567890.abcd'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [{ provide: FileService, useValue: mockFileService }],
    }).compile();
    controller = module.get(UploadController);
  });

  it('UT-UP-08: 校验通过返回带令牌的访问链接', () => {
    mockFileService.canSign.mockReturnValue(true);
    const res = controller.sign('private/2026/07/a.pdf');
    expect(res.url).toContain('p=private%2F2026%2F07%2Fa.pdf');
    expect(res.url).toContain('&t=1234567890.abcd');
  });

  it('UT-UP-09: 越权/不存在统一抛 404,不暴露文件存在性差异', () => {
    mockFileService.canSign.mockReturnValue(false);
    expect(() => controller.sign('private/2026/07/not-exists.pdf')).toThrow(NotFoundException);
    expect(() => controller.sign('private/2026/07/not-exists.pdf')).toThrow('文件不存在或不可签发访问链接');
    expect(mockFileService.signToken).not.toHaveBeenCalled();
  });

  it('UT-UP-10: 缺少 p 直接 400', () => {
    expect(() => controller.sign('')).toThrow(BadRequestException);
  });

  it('UT-UP-11: sign 端点守卫链含 RolesGuard(供应商 token 一律拒签)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UploadController.prototype.sign) ?? [];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(RolesGuard);
  });
});

// 图片缓存（2026-08-12 性能）：上传文件名是 uuid、内容不会变，必须让浏览器缓存下来。
// 之前没有 Cache-Control，sendFile 默认 max-age=0，合同/样衣的材料明细一页几十张图
// 每次进页面都要逐张回源到 Node——这就是"点开合同要转半天"的来源。
describe('UploadController getFile 缓存头', () => {
  let controller: UploadController;
  const mockFileService = {
    isPrivate: jest.fn(),
    verifyToken: jest.fn().mockReturnValue(true),
    resolvePath: jest.fn().mockReturnValue('/data/uploads/misc/2026/08/x.png'),
    contentTypeFor: jest.fn().mockReturnValue('image/png'),
  };
  /** 假 Response：只截住 sendFile 收到的 headers */
  const makeRes = () => {
    const captured: any = {};
    return { res: { sendFile: (_p: string, opt: any) => { Object.assign(captured, opt?.headers ?? {}); } } as any, captured };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFileService.verifyToken.mockReturnValue(true);
    mockFileService.resolvePath.mockReturnValue('/data/uploads/misc/2026/08/x.png');
    mockFileService.contentTypeFor.mockReturnValue('image/png');
    const module = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [{ provide: FileService, useValue: mockFileService }],
    }).compile();
    controller = module.get(UploadController);
  });

  it('UT-UP-12: 公共文件长期强缓存(uuid 文件名，内容不会变)', () => {
    mockFileService.isPrivate.mockReturnValue(false);
    const { res, captured } = makeRes();
    controller.getFile('misc/2026/08/x.png', undefined, res);
    expect(captured['Cache-Control']).toBe('public, max-age=31536000, immutable');
  });

  it('UT-UP-13: 敏感附件只私有缓存且短，跟签名 5 分钟有效期对齐', () => {
    mockFileService.isPrivate.mockReturnValue(true);
    const { res, captured } = makeRes();
    controller.getFile('private/2026/08/slip.png', 'tok', res);
    // 不能是 public：签名链接被中间层/共享代理缓存下来就等于泄给了别人
    expect(captured['Cache-Control']).toBe('private, max-age=300');
    expect(captured['Cache-Control']).not.toContain('public');
  });

  it('UT-UP-14: 加缓存头没有把原来的安全头挤掉', () => {
    mockFileService.isPrivate.mockReturnValue(false);
    const { res, captured } = makeRes();
    controller.getFile('misc/2026/08/x.png', undefined, res);
    expect(captured['X-Content-Type-Options']).toBe('nosniff');
    expect(captured['Content-Type']).toBe('image/png');
    expect(captured['Content-Disposition']).toBe('inline');
  });

  it('UT-UP-15: 非图片/PDF 仍然强制下载，不因缓存改动被内联执行', () => {
    mockFileService.isPrivate.mockReturnValue(false);
    mockFileService.contentTypeFor.mockReturnValue('application/vnd.ms-excel');
    const { res, captured } = makeRes();
    controller.getFile('misc/2026/08/x.xls', undefined, res);
    expect(captured['Content-Disposition']).toBe('attachment');
  });

  it('UT-UP-16: 敏感附件签名不对照旧 403，缓存头不能变成绕过口', () => {
    mockFileService.isPrivate.mockReturnValue(true);
    mockFileService.verifyToken.mockReturnValue(false);
    const { res } = makeRes();
    expect(() => controller.getFile('private/2026/08/slip.png', 'bad', res)).toThrow(ForbiddenException);
  });
});
