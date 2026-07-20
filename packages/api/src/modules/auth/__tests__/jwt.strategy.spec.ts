import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtStrategy } from '../jwt.strategy';
import { SysUser } from '../sys-user.entity';
import { SupplierAccount } from '../supplier-account.entity';

const mockUserRepo = { findOne: jest.fn() };
const mockSupplierRepo = { findOne: jest.fn() };
const mockConfig = { get: jest.fn().mockReturnValue('test-secret') };

describe('JwtStrategy.validate()（M5：停用即 401，库内角色为准）', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue('test-secret');
    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRepositoryToken(SysUser), useValue: mockUserRepo },
        { provide: getRepositoryToken(SupplierAccount), useValue: mockSupplierRepo },
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
});
