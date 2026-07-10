import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ChangeLogService } from './change-log.service';

@ApiTags('改值留痕')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('change-logs')
export class ChangeLogController {
  constructor(private readonly service: ChangeLogService) {}

  @Get()
  @ApiOperation({ summary: '单据改值留痕（原值→新值，P2#21）' })
  list(@Query('biz_type') bizType: string, @Query('biz_id', ParseIntPipe) bizId: number) {
    return this.service.list(bizType, bizId);
  }
}
