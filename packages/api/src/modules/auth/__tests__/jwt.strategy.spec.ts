import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtStrategy } from '../jwt.strategy';
import { SysUser } from '../sys-user.entity';
import { SupplierAccount } from '../supplier-account.entity';
import { REDIS_CLIENT } from '../../../common/services/numbering.service';

const mockUserRepo = { findOne: jest.fn() };
const mockSupplierRepo = { findOne: jest.fn() };
const mockConfig = { get: jest.fn().mockReturnValue('test-secret') };
const mockRedis = { get: jest.fn().mockResolvedValue(null) };

describe('JwtStrategy.validate()（M5：停用即 401，库内角色为准）', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue('test-secret');
    mockRedis.get.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRepositoryToken(SysUser), useValue: mockUserRepo },
        { provide: getRepositoryToken(SupplierAccount), useValue: mockSupplierRepo },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();
    strategy = module.get(JwtStrategy);
  });

  it('UT-AUTH-21: 内部用户被停用后，已签发 token 直接拒绝', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 1, username: 'admin', role: 'ADMIN', status: 0 });
    await expect(
      strategy.validate({ sub: 1, username: 'admin', role: 'ADMIN', type: 'admin' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('UT-AUTH-22: 供应商被停用后，已签发 token 直接拒绝', async () => {
    mockSupplierRepo.findOne.mockResolvedValue({ id: 10, status: 0, factory_id: 5 });
    await expect(
      strategy.validate({ sub: 10, username: 'factory_a', role: 'supplier', type: 'supplier', factory_id: 5 }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('UT-AUTH-23: 账号已被删除（查不到）同样拒绝', async () => {
    mockUserRepo.findOne.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 99, username: 'ghost', role: 'BUSINESS', type: 'admin' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('UT-AUTH-24: 内部用户角色以库内为准（降权即时生效，不采信 token 旧角色）', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 2, username: 'user', role: 'BUSINESS', status: 1 });
    const result = await strategy.validate({ sub: 2, username: 'user', role: 'ADMIN', type: 'admin' });
    expect(result.role).toBe('BUSINESS');
    expect(result.type).toBe('admin');
  });

  it('UT-AUTH-25: 供应商正常时放行，factory_id 归一为数字', async () => {
    mockSupplierRepo.findOne.mockResolvedValue({ id: 10, status: 1, factory_id: '7' });
    const result = await strategy.validate({
      sub: 10, username: 'factory_a', role: 'supplier', type: 'supplier', factory_id: 7,
    });
    expect(result).toEqual({ id: 10, username: 'factory_a', role: 'supplier', type: 'supplier', factory_id: 7 });
  });

  // ── B031：改密/重置密码后，之前签发的 token 一律失效（Redis 记改密时间，iat 早于它即 401）──
  describe('B031 改密吊销旧 token', () => {
    const NOW = 1_800_000_000; // 任意秒级时间戳

    it('B031 内部用户：token.iat 早于改密时间 → 401「密码已修改」', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, username: 'admin', role: 'ADMIN', status: 1 });
      mockRedis.get.mockResolvedValue(String(NOW));
      await expect(
        strategy.validate({ sub: 1, username: 'admin', role: 'ADMIN', type: 'admin', iat: NOW - 1 }),
      ).rejects.toThrow('密码已修改');
      expect(mockRedis.get).toHaveBeenCalledWith('auth:pwdts:admin:1');
    });

    it('B031 内部用户：改密后重新登录的 token（iat ≥ 改密时间）放行', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, username: 'admin', role: 'ADMIN', status: 1 });
      mockRedis.get.mockResolvedValue(String(NOW));
      await expect(strategy.validate({ sub: 1, username: 'admin', role: 'ADMIN', type: 'admin', iat: NOW })).resolves.toMatchObject({ id: 1 });
      await expect(strategy.validate({ sub: 1, username: 'admin', role: 'ADMIN', type: 'admin', iat: NOW + 5 })).resolves.toMatchObject({ id: 1 });
    });

    it('B031 供应商：管理员重置密码后，手里 30 天的旧门户令牌当场失效；key 按类型分开不与内部用户同 id 撞车', async () => {
      mockSupplierRepo.findOne.mockResolvedValue({ id: 10, status: 1, factory_id: 5 });
      mockRedis.get.mockResolvedValue(String(NOW));
      await expect(
        strategy.validate({ sub: 10, username: 'factory_a', role: 'supplier', type: 'supplier', factory_id: 5, iat: NOW - 3600 }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockRedis.get).toHaveBeenCalledWith('auth:pwdts:supplier:10');
      expect(mockRedis.get).not.toHaveBeenCalledWith('auth:pwdts:admin:10');
    });

    it('B031 从未改过密（Redis 无记录）→ 照常放行；有记录但 token 没有 iat → 拒绝', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 2, username: 'u', role: 'BUSINESS', status: 1 });
      mockRedis.get.mockResolvedValue(null);
      await expect(strategy.validate({ sub: 2, username: 'u', role: 'BUSINESS', type: 'admin', iat: 1 })).resolves.toMatchObject({ id: 2 });
      mockRedis.get.mockResolvedValue(String(NOW));
      await expect(strategy.validate({ sub: 2, username: 'u', role: 'BUSINESS', type: 'admin' })).rejects.toThrow(UnauthorizedException);
    });

    it('B031 Redis 读失败不拖死登录（降级放行，与发号服务同口径）', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 2, username: 'u', role: 'BUSINESS', status: 1 });
      mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(strategy.validate({ sub: 2, username: 'u', role: 'BUSINESS', type: 'admin', iat: 1 })).resolves.toMatchObject({ id: 2 });
    });
  });
});
