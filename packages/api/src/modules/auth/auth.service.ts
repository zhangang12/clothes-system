import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserRole, MENU_REGISTRY } from '@i9/types';
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

// 账号管理的越权防线（用户拍板：主管可管账号但限指派 5 种非管理角色，不能碰 ADMIN/SUPERVISOR 账号）
const ADMIN_TIER: string[] = [UserRole.ADMIN, UserRole.SUPERVISOR];
const SUPERVISOR_ASSIGNABLE: string[] = [
  UserRole.BUSINESS, UserRole.FINANCE, UserRole.PATTERNMAKER, UserRole.SAMPLE_MAKER, UserRole.SHIPPING,
];
const MENU_KEYS = MENU_REGISTRY.map((m) => m.key);
/** 非法 key 过滤 + ADMIN 角色强制 NULL（管理员恒全菜单，防误配把管理员锁死） */
function normMenuKeys(role: string, menuKeys?: string[] | null): string[] | null {
  if (role === UserRole.ADMIN || menuKeys == null) return null;
  return menuKeys.filter((k) => MENU_KEYS.includes(k));
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
      menu_keys: user.menu_keys ?? null, // web 侧栏/路由按此过滤；账号管理改菜单后下次登录生效
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

  // ── 账号管理：内部用户 ──
  async adminListUsers() {
    return this.userRepo.find({
      select: ['id', 'username', 'real_name', 'role', 'status', 'menu_keys', 'created_at'],
      order: { id: 'ASC' },
    });
  }

  async createUser(
    dto: { username: string; real_name: string; role: string; password: string; menuKeys?: string[] | null },
    acting: { role?: string },
  ) {
    if (acting.role === UserRole.SUPERVISOR && !SUPERVISOR_ASSIGNABLE.includes(dto.role)) {
      throw new ForbiddenException('主管只能指派 业务员/版师/船务/财务/打样间 角色');
    }
    const exists = await this.userRepo.findOne({ where: { username: dto.username } });
    if (exists) throw new BadRequestException(`用户名「${dto.username}」已存在`);
    const u = await this.userRepo.save(this.userRepo.create({
      username: dto.username, real_name: dto.real_name, role: dto.role as any,
      password: await bcrypt.hash(dto.password, 10), status: 1,
      menu_keys: normMenuKeys(dto.role, dto.menuKeys),
    } as any));
    return { id: (u as any).id, username: dto.username };
  }

  async updateUser(
    id: number,
    dto: { real_name?: string; role?: string; status?: number; menuKeys?: string[] | null },
    acting: { id: number; role?: string },
  ) {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('用户不存在');
    // 主管防线：不能碰管理角色账号、不能把任何人提成管理角色
    if (acting.role === UserRole.SUPERVISOR) {
      if (ADMIN_TIER.includes(u.role)) throw new ForbiddenException('无权修改管理员/主管账号');
      if (dto.role && !SUPERVISOR_ASSIGNABLE.includes(dto.role)) {
        throw new ForbiddenException('主管只能指派 业务员/版师/船务/财务/打样间 角色');
      }
    }
    // 兜底：不允许把最后一个启用的管理员降权/停用，避免自锁系统
    const demotingAdmin = u.role === 'ADMIN' && ((dto.role && dto.role !== 'ADMIN') || dto.status === 0);
    if (demotingAdmin) {
      const admins = await this.userRepo.count({ where: { role: 'ADMIN' as any, status: 1 } });
      if (admins <= 1) throw new BadRequestException('这是最后一个启用的管理员，不能降权或停用');
    }
    if (id === acting.id && dto.status === 0) throw new BadRequestException('不能停用当前登录的自己');
    const nextRole = dto.role ?? u.role;
    await this.userRepo.update(id, {
      ...(dto.real_name !== undefined && { real_name: dto.real_name }),
      ...(dto.role !== undefined && { role: dto.role as any }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.menuKeys !== undefined && { menu_keys: normMenuKeys(nextRole, dto.menuKeys) }),
    });
    return { ok: true };
  }

  async resetUserPassword(id: number, newPwd: string, acting: { role?: string }) {
    const u = await this.userRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('用户不存在');
    if (acting.role === UserRole.SUPERVISOR && ADMIN_TIER.includes(u.role)) {
      throw new ForbiddenException('无权重置管理员/主管账号密码');
    }
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
