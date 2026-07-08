import {
  Controller, Get, Patch, Param, Query, Body, Res, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { ErrorLogService } from './error-log.service';

@ApiTags('系统报错记录')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN) // 仅管理员可见
@Controller('error-logs')
export class ErrorLogController {
  constructor(private readonly service: ErrorLogService) {}

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
