import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SysUser } from './sys-user.entity';
import { SupplierAccount } from './supplier-account.entity';

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
  type: 'admin' | 'supplier';
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    @InjectRepository(SupplierAccount) private readonly supplierRepo: Repository<SupplierAccount>,
    private readonly jwt: JwtService,
  ) {}

  async loginAdmin(username: string, password: string) {
    const user = await this.userRepo.findOne({ where: { username, deleted: 0 } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const payload: JwtPayload = { sub: user.id, username: user.username, role: user.role, type: 'admin' };
    return { access_token: this.jwt.sign(payload), role: user.role, real_name: user.real_name };
  }

  async loginSupplier(loginName: string, password: string) {
    const account = await this.supplierRepo.findOne({ where: { login_name: loginName, enabled: 1, deleted: 0 } });
    if (!account || !(await bcrypt.compare(password, account.password_hash))) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const payload: JwtPayload = { sub: account.id, username: account.login_name, role: 'supplier', type: 'supplier' };
    return { access_token: this.jwt.sign(payload, { expiresIn: '30d' }), factory_id: account.factory_id };
  }
}
