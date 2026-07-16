import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { SysUser } from './sys-user.entity';
import { SupplierAccount } from './supplier-account.entity';
import { Factory } from '../factory/factory.entity';

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
  type: 'admin' | 'supplier';
  factory_id?: number;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    @InjectRepository(SupplierAccount) private readonly supplierRepo: Repository<SupplierAccount>,
    private readonly jwt: JwtService,
  ) {}

  async loginAdmin(username: string, password: string) {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('用户名或密码错误');

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      type: 'admin',
    };
    return {
      access_token: this.jwt.sign(payload),
      role: user.role,
      real_name: user.real_name,
    };
  }

  async loginSupplier(account: string, password: string) {
    const supplier = await this.supplierRepo.findOne({ where: { account } });
    if (!supplier || supplier.status !== 1) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const valid = await bcrypt.compare(password, supplier.password);
    if (!valid) throw new UnauthorizedException('账号或密码错误');

    // 更新最后登录时间
    await this.supplierRepo.update(supplier.id, { last_login_at: new Date() });

    const payload: JwtPayload = {
      sub: supplier.id,
      username: supplier.account,
      role: 'supplier',
      type: 'supplier',
      factory_id: supplier.factory_id,
    };
    return {
      access_token: this.jwt.sign(payload, { expiresIn: '30d' }),
      factory_id: supplier.factory_id,
    };
  }

  // 供管理端创建供应商账号使用
  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  // 内部用户清单（客户机密授权选人 / 制版师下拉；不含密码等敏感列；可按角色过滤）
  async listUsers(role?: string) {
    return this.userRepo.find({
      where: { status: 1, ...(role && { role: role as any }) },
      select: ['id', 'username', 'real_name', 'role'],
      order: { id: 'ASC' },
    });
  }

  // ── 本人改密：内部用户与供应商共用，按 token 里的 type 分流，须先验原密码 ──
  async changePassword(user: { id: number; type: 'admin' | 'supplier' }, oldPwd: string, newPwd: string) {
    if (user.type === 'supplier') {
      const acc = await this.supplierRepo.findOne({ where: { id: user.id } });
      if (!acc || !(await bcrypt.compare(oldPwd, acc.password))) throw new BadRequestException('原密码不正确');
      if (await bcrypt.compare(newPwd, acc.password)) throw new BadRequestException('新密码不能与原密码相同');
      await this.supplierRepo.update(acc.id, { password: await bcrypt.hash(newPwd, 10) });
    } else {
      const u = await this.userRepo.findOne({ where: { id: user.id } });
      if (!u || !(await bcrypt.compare(oldPwd, u.password))) throw new BadRequestException('原密码不正确');
      if (await bcrypt.compare(newPwd, u.password)) throw new BadRequestException('新密码不能与原密码相同');
      await this.userRepo.update(u.id, { password: await bcrypt.hash(newPwd, 10) });
    }
    return { ok: true };
  }

  // ── 管理员：内部用户管理 ──
  async adminListUsers() {
    return this.userRepo.find({
      select: ['id', 'username', 'real_name', 'role', 'status', 'created_at'],
      order: { id: 'ASC' },
    });
  }

  async createUser(dto: { username: string; real_name: string; role: string; password: string }) {
    const exists = await this.userRepo.findOne({ where: { username: dto.username } });
    if (exists) throw new BadRequestException(`用户名「${dto.username}」已存在`);
    const u = await this.userRepo.save(this.userRepo.create({
      username: dto.username, real_name: dto.real_name, role: dto.role as any,
      password: await bcrypt.hash(dto.password, 10), status: 1,
    } as any));
    return { id: (u as any).id, username: dto.username };
  }

  async updateUser(id: number, dto: { real_name?: string; role?: string; status?: number }, actingUserId: number) {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('用户不存在');
    // 兜底：不允许把最后一个启用的管理员降权/停用，避免自锁系统
    const demotingAdmin = u.role === 'ADMIN' && ((dto.role && dto.role !== 'ADMIN') || dto.status === 0);
    if (demotingAdmin) {
      const admins = await this.userRepo.count({ where: { role: 'ADMIN' as any, status: 1 } });
      if (admins <= 1) throw new BadRequestException('这是最后一个启用的管理员，不能降权或停用');
    }
    if (id === actingUserId && dto.status === 0) throw new BadRequestException('不能停用当前登录的自己');
    await this.userRepo.update(id, {
      ...(dto.real_name !== undefined && { real_name: dto.real_name }),
      ...(dto.role !== undefined && { role: dto.role as any }),
      ...(dto.status !== undefined && { status: dto.status }),
    });
    return { ok: true };
  }

  async resetUserPassword(id: number, newPwd: string) {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('用户不存在');
    await this.userRepo.update(id, { password: await bcrypt.hash(newPwd, 10) });
    return { ok: true };
  }

  // ── 管理员：供应商门户账号管理 ──
  async adminListSuppliers() {
    // 带出工厂名，免得只显示 factory_id
    return this.supplierRepo.createQueryBuilder('s')
      .leftJoin(Factory, 'f', 'f.id = s.factory_id')
      .select([
        's.id AS id', 's.account AS account', 's.factory_id AS factory_id',
        'f.name AS factory_name', 's.status AS status', 's.last_login_at AS last_login_at', 's.created_at AS created_at',
      ])
      .orderBy('s.id', 'ASC')
      .getRawMany();
  }

  async resetSupplierPassword(id: number, newPwd: string) {
    const acc = await this.supplierRepo.findOne({ where: { id } });
    if (!acc) throw new NotFoundException('供应商账号不存在');
    await this.supplierRepo.update(id, { password: await bcrypt.hash(newPwd, 10) });
    return { ok: true };
  }

  async updateSupplier(id: number, status: number) {
    const acc = await this.supplierRepo.findOne({ where: { id } });
    if (!acc) throw new NotFoundException('供应商账号不存在');
    await this.supplierRepo.update(id, { status });
    return { ok: true };
  }
}
