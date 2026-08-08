import {
  Controller, Get, Post, Patch, Body, Param, Query, Request, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SupplierGuard } from '../../common/guards/supplier.guard';
import { FeedbackService } from './feedback.service';
import { FeedbackUserType } from './feedback.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

/**
 * 供应商门户的反馈入口（2026-08-08 反馈：「供应商门户没有反馈问题小泡泡，要加」）。
 *
 * 【为什么不复用 /feedbacks】那套控制器整体挂 `@Roles(...INTERNAL_ROLES)`，供应商账号
 * 拿的是 `type=supplier` 的令牌，调过去一律 403。这里单开一个走 SupplierGuard 的门户口。
 *
 * 【为什么每个方法都显式传 SUPPLIER】内部用户与供应商账号是两套各自独立的自增 ID，
 * 只按 user_id 过滤会串号（内部用户#5 能看到供应商#5 的反馈）。user_type 是那道隔离，
 * 少传一次就漏一处，所以这里全部显式写出来，不依赖默认值。
 */
@ApiTags('供应商门户')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SupplierGuard)
@Controller('portal/feedbacks')
export class PortalFeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  @ApiOperation({ summary: '供应商提交反馈' })
  create(@Body() dto: CreateFeedbackDto, @Request() req: any) {
    return this.service.create(dto, req.user.id, req.user.username, FeedbackUserType.SUPPLIER);
  }

  @Get('mine')
  @ApiOperation({ summary: '我的反馈（含管理员回复）' })
  mine(@Query() query: { page?: number; size?: number }, @Request() req: any) {
    return this.service.mine(req.user.id, query, FeedbackUserType.SUPPLIER);
  }

  @Get('mine/unread')
  @ApiOperation({ summary: '我的未读回复数（气泡红点）' })
  unread(@Request() req: any) {
    return this.service.unreadCount(req.user.id, FeedbackUserType.SUPPLIER);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: '标记某条回复已读（消红点，仅本人）' })
  markRead(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.markRead(id, req.user.id, FeedbackUserType.SUPPLIER);
  }
}
