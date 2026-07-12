import { Controller, Get, Header, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { OpsService } from './ops.service';

// 只读监控接口的验签公钥（ECDSA P-256）。公钥可公开、可入库；对应私钥内置在离线监控页里，
// 每次请求对时间戳签名，服务器用此公钥验签 —— 服务器不持有任何可用于调用的秘密。
// 可用环境变量 OPS_STATUS_PUBKEY 覆盖（PEM，换行写作字面 \n）。
const PUB_PEM = (
  process.env.OPS_STATUS_PUBKEY ||
  `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEP3xELKhOkLLkhyU/stzIsSCAbkzz
JExxL/RfTY+0e7FRak9+02c+hFTQMYQLSSqRa40NY9DWyI0jLUaZVfhTgw==
-----END PUBLIC KEY-----`
).replace(/\\n/g, '\n');

const SKEW_SEC = 180; // 时间戳时效窗口（兼顾时钟偏差 + 防重放）

/**
 * 公开只读监控接口 —— 无鉴权守卫；改用【非对称签名请求】鉴权：
 *   客户端(离线监控页)用私钥对 `ops-status|<ts>` 签名，query 带 ts+sig；
 *   服务端用公钥验签 + 校验 ts 新鲜度。URL 无可复用明文口令，过期即失效。
 *   单独回 Access-Control-Allow-Origin:* 以便本地 file:// 直接 fetch；简单 GET 不触发预检。
 */
@ApiTags('运维监控')
@Controller('ops')
export class OpsController {
  constructor(private readonly service: OpsService) {}

  @Get('status')
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '定时作业/系统监控只读状态（ECDSA 签名请求鉴权）' })
  status(@Query('ts') ts?: string, @Query('sig') sig?: string) {
    this.verify(ts, sig);
    return this.service.status();
  }

  /** 时间戳新鲜 + 公钥验签（签名为 WebCrypto 原生 r||s，即 ieee-p1363）。 */
  private verify(ts?: string, sig?: string) {
    const t = Number(ts);
    if (!Number.isFinite(t) || t <= 0 || Math.abs(Date.now() / 1000 - t) > SKEW_SEC) {
      throw new UnauthorizedException('stale or missing timestamp');
    }
    if (!sig) throw new UnauthorizedException('missing signature');
    let ok = false;
    try {
      const sigBuf = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      ok = crypto.verify(
        'sha256',
        Buffer.from(`ops-status|${t}`),
        { key: PUB_PEM, dsaEncoding: 'ieee-p1363' },
        sigBuf,
      );
    } catch {
      ok = false;
    }
    if (!ok) throw new UnauthorizedException('bad signature');
  }
}
