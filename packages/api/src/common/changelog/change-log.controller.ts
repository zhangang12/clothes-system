import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@i9/types';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { ChangeLogService } from './change-log.service';

@ApiTags('改值留痕')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('change-logs')
export class ChangeLogController {
  constructor(private readonly service: ChangeLogService) {}

  @Get()
  // 留痕含汇率/利润率/数量原值→新值，与结算脱敏口径一致，仅财务/管理可见（供应商 token 被 RolesGuard 直接 403）
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '单据改值留痕（原值→新值，P2#21）' })
  list(@Query('biz_type') bizType: string, @Query('biz_id', ParseIntPipe) bizId: number) {
    return this.service.list(bizType, bizId);
  }
}
