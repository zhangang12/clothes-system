import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { UserRole, APPROVAL_THRESHOLD_KEYS } from '@i9/types';
import { SysConfigService } from './sys-config.service';
import { SetThresholdsDto } from './dto/set-thresholds.dto';

@ApiTags('系统配置')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('config')
export class SysConfigController {
  constructor(private readonly service: SysConfigService) {}

  @Get('thresholds')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPERVISOR, UserRole.BUSINESS)
  @ApiOperation({ summary: '获取金额审批阈值（报价/订单/合同）' })
  getThresholds() {
    return this.service.getThresholds();
  }

  @Put('thresholds')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '设置金额审批阈值（0=不启用；仅管理员）' })
  async setThresholds(@Body() dto: SetThresholdsDto) {
    if (dto.quote !== undefined) await this.service.set(APPROVAL_THRESHOLD_KEYS.QUOTE, String(dto.quote), '报价审批阈值');
    if (dto.order !== undefined) await this.service.set(APPROVAL_THRESHOLD_KEYS.ORDER, String(dto.order), '订单审批阈值');
    if (dto.contract !== undefined) await this.service.set(APPROVAL_THRESHOLD_KEYS.CONTRACT, String(dto.contract), '合同审批阈值');
    return this.service.getThresholds();
  }
}
