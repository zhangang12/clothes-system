import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { SysUser } from './sys-user.entity';
import { SupplierAccount } from './supplier-account.entity';

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
}
