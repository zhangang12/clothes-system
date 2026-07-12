import { Controller, Get, Header, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OpsService } from './ops.service';

// 轻量访问口令（可用环境变量 OPS_STATUS_KEY 覆盖）。仅暴露聚合运维指标，非敏感数据。
const KEY = process.env.OPS_STATUS_KEY || 'ops_7yQ2k9Xz';

/**
 * 公开只读监控接口 —— 无鉴权守卫（本 controller 不挂 JwtAuthGuard），
 * 单独回 Access-Control-Allow-Origin:* 以便本地 file:// 打开的离线监控页直接 fetch。
 * 简单 GET + query 口令，不触发 CORS 预检。
 */
@ApiTags('运维监控')
@Controller('ops')
export class OpsController {
  constructor(private readonly service: OpsService) {}

  @Get('status')
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '定时作业/系统监控只读状态（供离线监控页运行时拉取）' })
  status(@Query('k') k?: string) {
    if (k !== KEY) throw new UnauthorizedException('bad key');
    return this.service.status();
  }
}
