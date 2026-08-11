import {
  Controller, Get, Post, Patch, Param, Query, Body, Req, Res, ParseIntPipe, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { ErrorLogService } from './error-log.service';
import { ReportClientErrorDto } from './dto/report-client-error.dto';

@ApiTags('系统报错记录')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN) // 仅管理员可见
@Controller('error-logs')
export class ErrorLogController {
  constructor(private readonly service: ErrorLogService) {}

  /**
   * 前端错误上报。**类级 @Roles(ADMIN) 在这里被方法级覆盖**——任何登录用户都要能报，
   * 否则最需要证据的业务同事那边一条也收不上来。
   *
   * 安全与容量上的考虑：①只写不读，读还是管理员的事；②service.record 按指纹去重聚合，
   * 同一个错反复发只会 count+1，不会把表撑爆；③全局限流 300 次/分钟仍然管着这个接口；
   * ④前端自己还有"同错 30 秒一次、单页最多 5 条"的闸门。
   */
  @Post('client')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE, UserRole.PATTERNMAKER,
    UserRole.SUPERVISOR, UserRole.SAMPLE_MAKER, UserRole.SHIPPING)
  @HttpCode(204)
  @ApiOperation({ summary: '前端错误上报（白屏/渲染异常等，任何登录用户可报）' })
  async reportClient(@Body() dto: ReportClientErrorDto, @Req() req: any): Promise<void> {
    await this.service.record({
      method: 'CLIENT',
      path: dto.path || '-',
      statusCode: 0,
      code: 0,
      errorType: `FE_${dto.kind}`,
      message: dto.message,
      stack: dto.stack,
      // 版本号和 UA 塞进 req_input：判断"用户是不是跑在旧版本上"全靠它
      body: { build_id: dto.build_id, ua: dto.ua },
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      ip: req.ip,
    });
  }

  @Get()
  @ApiOperation({ summary: '系统报错记录列表(去重聚合)' })
  findAll(@Query() query: { page?: number; size?: number; status?: string }) {
    return this.service.findAll(query);
  }

  @Get('export')
  @ApiOperation({ summary: '导出 HTML(仅未处理)' })
  async export(@Res() res: Response) {
    const html = await this.service.exportHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="error-logs-${Date.now()}.html"`);
    res.send(html);
  }

  @Get(':id')
  @ApiOperation({ summary: '报错详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id/handled')
  @ApiOperation({ summary: '标记已处理/未处理' })
  markHandled(@Param('id', ParseIntPipe) id: number, @Body('handled') handled?: boolean) {
    return this.service.markHandled(id, handled !== false);
  }
}
