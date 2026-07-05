import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { StatsService } from './stats.service';

@ApiTags('报表统计')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Get('funnel')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '转化漏斗（样衣→报价→订单成单，含转化率）' })
  funnel() {
    return this.service.funnel();
  }

  @Get('win-rate')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '成单率（按业务员/客户）' })
  @ApiQuery({ name: 'dimension', required: false, enum: ['salesperson', 'customer'] })
  winRate(@Query('dimension') dimension?: string) {
    return this.service.winRate(dimension === 'customer' ? 'customer' : 'salesperson');
  }

  @Get('profit')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '利润汇总（按款号/月份/客户，含毛利率%，净利<0亏损预警）' })
  @ApiQuery({ name: 'dimension', required: false, enum: ['style', 'month', 'customer'] })
  profit(@Query('dimension') dimension?: string) {
    const dim = dimension === 'month' ? 'month' : dimension === 'customer' ? 'customer' : 'style';
    return this.service.profit(dim);
  }
}
