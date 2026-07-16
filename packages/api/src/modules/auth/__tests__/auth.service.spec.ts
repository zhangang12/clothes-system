import { Test } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { SysUser } from '../sys-user.entity';
import { SupplierAccount } from '../supplier-account.entity';
import { Factory } from '../../factory/factory.entity';

// Mock bcryptjs to keep unit tests fast and deterministic
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockImplementation((plain) => Promise.resolve(`hashed:${plain}`)),
  compare: jest.fn().mockImplementation((plain, hash) => Promise.resolve(hash === `hashed:${plain}`)),
}));

const mockUserRepo = { findOne: jest.fn(), update: jest.fn(), count: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn((x) => x) };
const mockSupplierRepo = { findOne: jest.fn(), update: jest.fn(), createQueryBuilder: jest.fn() };
const mockJwt = { sign: jest.fn().mockReturnValue('mock-token') };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(SysUser), useValue: mockUserRepo },
        { provide: getRepositoryToken(SupplierAccount), useValue: mockSupplierRepo },
        { provide: getRepositoryToken(Factory), useValue: {} },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('loginAdmin()', () => {
    it('UT-AUTH-01: returns token and role on valid credentials', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 1, username: 'admin', password: 'hashed:password123', role: 'ADMIN', real_name: '管理员', status: 1,
      });
      const result = await service.loginAdmin('admin', 'password123');
      expect(result.access_token).toBe('mock-token');
      expect(result.role).toBe('ADMIN');
      expect(result.real_name).toBe('管理员');
    });

    it('UT-AUTH-02: throws UnauthorizedException if user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(service.loginAdmin('nobody', 'pass')).rejects.toThrow(UnauthorizedException);
    });

    it('UT-AUTH-03: throws UnauthorizedException if user status is 0 (disabled)', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 1, username: 'admin', password: 'hashed:pass', status: 0,
      });
      await expect(service.loginAdmin('admin', 'pass')).rejects.toThrow(UnauthorizedException);
    });

    it('UT-AUTH-04: throws UnauthorizedException on wrong password', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 1, username: 'admin', password: 'hashed:correct', status: 1,
      });
      await expect(service.loginAdmin('admin', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('UT-AUTH-05: JWT payload includes correct type=admin', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 2, username: 'user', password: 'hashed:pass', role: 'BUSINESS', real_name: '业务员', status: 1,
      });
      await service.loginAdmin('user', 'pass');
      expect(mockJwt.sign).toHaveBeenCalledWith(expect.objectContaining({ type: 'admin', sub: 2 }));
    });
  });

  describe('loginSupplier()', () => {
    it('UT-AUTH-06: returns token and factory_id on valid credentials', async () => {
      mockSupplierRepo.findOne.mockResolvedValue({
        id: 10, account: 'factory_a', password: 'hashed:sup123', status: 1, factory_id: 5,
      });
      mockSupplierRepo.update.mockResolvedValue({});
      const result = await service.loginSupplier('factory_a', 'sup123');
      expect(result.access_token).toBe('mock-token');
      expect(result.factory_id).toBe(5);
    });

    it('UT-AUTH-07: throws UnauthorizedException if supplier not found', async () => {
      mockSupplierRepo.findOne.mockResolvedValue(null);
      await expect(service.loginSupplier('nobody', 'pass')).rejects.toThrow(UnauthorizedException);
    });

    it('UT-AUTH-08: throws UnauthorizedException if supplier disabled', async () => {
      mockSupplierRepo.findOne.mockResolvedValue({
        id: 1, account: 'sup', password: 'hashed:pass', status: 0, factory_id: 1,
      });
      await expect(service.loginSupplier('sup', 'pass')).rejects.toThrow(UnauthorizedException);
    });

    it('UT-AUTH-09: updates last_login_at after successful login', async () => {
      mockSupplierRepo.findOne.mockResolvedValue({
        id: 3, account: 'sup', password: 'hashed:pass', status: 1, factory_id: 2,
      });
      mockSupplierRepo.update.mockResolvedValue({});
      await service.loginSupplier('sup', 'pass');
      expect(mockSupplierRepo.update).toHaveBeenCalledWith(3, expect.objectContaining({ last_login_at: expect.any(Date) }));
    });

    it('UT-AUTH-10: JWT payload includes type=supplier and factory_id', async () => {
      mockSupplierRepo.findOne.mockResolvedValue({
        id: 4, account: 'sup2', password: 'hashed:pass', status: 1, factory_id: 7,
      });
      mockSupplierRepo.update.mockResolvedValue({});
      await service.loginSupplier('sup2', 'pass');
      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'supplier', factory_id: 7 }),
        expect.objectContaining({ expiresIn: '30d' }),
      );
    });
  });

  describe('hashPassword()', () => {
    it('UT-AUTH-11: returns bcrypt hash verifiable by compare', async () => {
      const hash = await service.hashPassword('mySecret');
      const bcrypt = require('bcryptjs');
      const valid = await bcrypt.compare('mySecret', hash);
      expect(valid).toBe(true);
    });
  });

  describe('changePassword()', () => {
    it('UT-AUTH-12: 内部用户原密码正确则更新为新哈希', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, password: 'hashed:old12345' });
      await service.changePassword({ id: 1, type: 'admin' }, 'old12345', 'new12345');
      expect(mockUserRepo.update).toHaveBeenCalledWith(1, { password: 'hashed:new12345' });
    });

    it('UT-AUTH-13: 原密码错误抛 BadRequest，不更新', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, password: 'hashed:correct1' });
      await expect(service.changePassword({ id: 1, type: 'admin' }, 'wrong123', 'new12345'))
        .rejects.toThrow(BadRequestException);
      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it('UT-AUTH-14: 新密码与原密码相同则拒绝', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, password: 'hashed:same1234' });
      await expect(service.changePassword({ id: 1, type: 'admin' }, 'same1234', 'same1234'))
        .rejects.toThrow(BadRequestException);
    });

    it('UT-AUTH-15: 供应商按 type 分流到 supplierRepo', async () => {
      mockSupplierRepo.findOne.mockResolvedValue({ id: 9, password: 'hashed:old12345' });
      await service.changePassword({ id: 9, type: 'supplier' }, 'old12345', 'new12345');
      expect(mockSupplierRepo.update).toHaveBeenCalledWith(9, { password: 'hashed:new12345' });
      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('updateUser()（最后管理员保护）', () => {
    it('UT-AUTH-16: 停用最后一个启用管理员被拒', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, role: 'ADMIN', status: 1 });
      mockUserRepo.count.mockResolvedValue(1);
      await expect(service.updateUser(1, { status: 0 }, 99)).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it('UT-AUTH-17: 还有其它管理员时可降权', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 2, role: 'ADMIN', status: 1 });
      mockUserRepo.count.mockResolvedValue(2);
      await service.updateUser(2, { role: 'BUSINESS' as any }, 99);
      expect(mockUserRepo.update).toHaveBeenCalledWith(2, { role: 'BUSINESS' });
    });

    it('UT-AUTH-18: 不能停用当前登录的自己', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 5, role: 'BUSINESS', status: 1 });
      await expect(service.updateUser(5, { status: 0 }, 5)).rejects.toThrow(BadRequestException);
    });
  });

  describe('createUser()', () => {
    it('UT-AUTH-19: 用户名重复被拒', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, username: 'dup' });
      await expect(service.createUser({ username: 'dup', real_name: 'x', role: 'BUSINESS', password: 'pass1234' }))
        .rejects.toThrow(BadRequestException);
    });

    it('UT-AUTH-20: 新用户密码入库为哈希', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      mockUserRepo.save.mockResolvedValue({ id: 7 });
      await service.createUser({ username: 'newu', real_name: '新', role: 'FINANCE', password: 'pass1234' });
      expect(mockUserRepo.save).toHaveBeenCalledWith(expect.objectContaining({ password: 'hashed:pass1234' }));
    });
  });
});
