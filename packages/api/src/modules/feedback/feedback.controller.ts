import {
  Controller, Get, Post, Patch, Body, Param, Query, Res, Request, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

const INTERNAL_ROLES = [
  UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE,
  UserRole.PATTERNMAKER, UserRole.SUPERVISOR, UserRole.SAMPLE_MAKER,
];

@ApiTags('用户反馈')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('feedbacks')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  @Roles(...INTERNAL_ROLES) // 任意内部登录用户可提交
  @ApiOperation({ summary: '提交反馈(问题描述+图片)' })
  create(@Body() dto: CreateFeedbackDto, @Request() req: any) {
    return this.service.create(dto, req.user.id, req.user.username);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '反馈列表(管理员)' })
  findAll(@Query() query: { page?: number; size?: number; status?: string }) {
    return this.service.findAll(query);
  }

  @Get('export')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '导出 HTML(仅未处理)' })
  async export(@Res() res: Response) {
    const html = await this.service.exportHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="feedbacks-${Date.now()}.html"`);
    res.send(html);
  }

  @Patch(':id/handled')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '标记已处理/未处理(可附回复)' })
  markHandled(
    @Param('id', ParseIntPipe) id: number,
    @Body('handled') handled?: boolean,
    @Body('reply') reply?: string,
  ) {
    return this.service.markHandled(id, handled !== false, reply);
  }
}
