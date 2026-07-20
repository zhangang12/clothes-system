import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
