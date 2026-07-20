import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './auth.service';
import { SysUser } from './sys-user.entity';
import { SupplierAccount } from './supplier-account.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    @InjectRepository(SupplierAccount) private readonly supplierRepo: Repository<SupplierAccount>,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET env var is required');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // 每请求回库校验一次（停用即 401），并以库内 role/factory_id 为准，避免降权/换厂后旧 token 继续提权
  async validate(payload: JwtPayload) {
    if (!payload?.sub) throw new UnauthorizedException();
    if (payload.type === 'supplier') {
      const acc = await this.supplierRepo.findOne({
        where: { id: payload.sub },
        select: ['id', 'status', 'factory_id'],
      });
      if (!acc || acc.status !== 1) throw new UnauthorizedException('账号已被停用');
      return {
        id: Number(acc.id),
        username: payload.username,
        role: 'supplier',
        type: 'supplier' as const,
        factory_id: Number(acc.factory_id),
      };
    }
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'username', 'role', 'status'],
    });
    if (!user || user.status !== 1) throw new UnauthorizedException('账号已被停用');
    return {
      id: Number(user.id),
      username: user.username,
      role: user.role,
      type: 'admin' as const,
    };
  }
}
