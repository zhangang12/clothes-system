import { Injectable, UnauthorizedException, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { JwtPayload, pwdTsKey } from './auth.service';
import { SysUser } from './sys-user.entity';
import { SupplierAccount } from './supplier-account.entity';
import { REDIS_CLIENT } from '../../common/services/numbering.service';

// 改密吊销校验读 Redis 的时限；本机 Redis 正常 1ms 内返回
const REVOKE_CHECK_TIMEOUT_MS = 300;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    @InjectRepository(SupplierAccount) private readonly supplierRepo: Repository<SupplierAccount>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET env var is required');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * B031：改密/重置密码后签发在此之前的 token 一律拒绝（AuthService 改密时把时间写进 Redis，见 pwdTsKey）。
   * Redis 读失败只记日志放行：与发号服务同口径——Redis 抖一下不能把全站登录一起拖死；没有记录=从未改过密。
   */
  private async assertNotRevoked(type: 'admin' | 'supplier', id: number, iat?: number): Promise<void> {
    let ts: string | null;
    // 限时读：ioredis 断线时命令默认进离线队列、重试 20 次，一条 get 要十几秒才报错——
    // 这里每个请求都要读，不限时的话 Redis 一断全站请求一起卡住（前端 15 秒超时），与上面「读失败就放行」的本意相反
    let timer: NodeJS.Timeout | undefined;
    try {
      ts = await Promise.race([
        this.redis.get(pwdTsKey(type, id)),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`超过 ${REVOKE_CHECK_TIMEOUT_MS}ms`)), REVOKE_CHECK_TIMEOUT_MS); }),
      ]);
    } catch (e) {
      this.logger.warn(`读取改密时间失败(${type}#${id})，本次跳过校验: ${(e as Error)?.message}`);
      return;
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!ts) return;
    if (!iat || iat < Number(ts)) throw new UnauthorizedException('密码已修改，请重新登录');
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
      await this.assertNotRevoked('supplier', Number(acc.id), payload.iat);
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
      // menu_keys 一起取：账号级菜单权限要在**接口层**也认（见 MenuGuard）。
      // 每次请求本来就查这一行，多带一列不额外增加查询；且改完菜单立刻生效，不必等重新登录。
      select: ['id', 'username', 'role', 'status', 'menu_keys'],
    });
    if (!user || user.status !== 1) throw new UnauthorizedException('账号已被停用');
    await this.assertNotRevoked('admin', Number(user.id), payload.iat);
    return {
      id: Number(user.id),
      username: user.username,
      role: user.role,
      menu_keys: user.menu_keys ?? null,
      type: 'admin' as const,
    };
  }
}
