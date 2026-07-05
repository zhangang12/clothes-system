import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { SettlementService } from './settlement.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { AddCostDto } from './dto/add-cost.dto';
import { AddReceiptDto } from './dto/add-receipt.dto';
import { QuerySettlementDto } from './dto/query-settlement.dto';

@ApiTags('结算管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settlements')
export class SettlementController {
  constructor(private readonly service: SettlementService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '创建结算单（含费用明细）' })
  create(@Body() dto: CreateSettlementDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '结算单列表（分页）' })
  findAll(@Query() query: QuerySettlementDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '结算单详情（含费用明细、回款记录）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post(':id/costs')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '添加费用明细' })
  addCost(@Param('id', ParseIntPipe) id: number, @Body() dto: AddCostDto) {
    return this.service.addCost(id, dto);
  }

  @Post(':id/receipts')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '登记回款' })
  addReceipt(@Param('id', ParseIntPipe) id: number, @Body() dto: AddReceiptDto) {
    return this.service.addReceipt(id, dto);
  }

  @Patch(':id/refresh-cost')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '刷新付款汇总（按款号重算总货款）' })
  refreshCost(@Param('id', ParseIntPipe) id: number) {
    return this.service.refreshCost(id);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '确认结算单（DRAFT→CONFIRMED）' })
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.service.confirm(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除结算单（草稿状态，逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
