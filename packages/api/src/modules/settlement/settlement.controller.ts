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
import { maskSettlement } from '../../common/masking/field-mask';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { AddCostDto } from './dto/add-cost.dto';
import { AddReceiptDto } from './dto/add-receipt.dto';
import { UpdateSettlementDto } from './dto/update-settlement.dto';
import { QuerySettlementDto } from './dto/query-settlement.dto';

@ApiTags('结算管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settlements')
export class SettlementController {
  constructor(private readonly service: SettlementService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建结算单（含费用明细；出货后业务可建·结算串流程 rec）' })
  create(@Body() dto: CreateSettlementDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '结算单列表（分页；成本/毛利限财务/管理）' })
  async findAll(@Query() query: QuerySettlementDto, @Request() req: any) {
    return maskSettlement(await this.service.findAll(query), req.user.role);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '列表徽标统计:待收汇/亏损预警/待重算(P2#26)' })
  stats() {
    return this.service.stats();
  }

  @Get(':id')
  @ApiOperation({ summary: '结算单详情（含费用/回款；成本/毛利限财务/管理）' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return maskSettlement(await this.service.findOne(id), req.user.role);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '编辑结算单（草稿限定；财务两步走——收汇后补汇率/发票金额/费用）' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSettlementDto, @Request() req: any) {
    return this.service.update(id, dto, req.user.id);
  }

  @Patch(':id/reopen')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '红冲重开（已确认→草稿重算，版本快照留痕，P2#22）' })
  reopen(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.reopen(id, req.user.id);
  }

  @Post(':id/costs')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '添加费用明细' })
  addCost(@Param('id', ParseIntPipe) id: number, @Body() dto: AddCostDto) {
    return this.service.addCost(id, dto);
  }

  @Delete(':id/costs/:costId')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '删除成本行（草稿限定；AUTO 行可由「刷新付款汇总」重建）' })
  removeCost(@Param('id', ParseIntPipe) id: number, @Param('costId', ParseIntPipe) costId: number) {
    return this.service.removeCost(id, costId);
  }

  @Post(':id/receipts')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '登记回款（可带该笔汇率+银行水单；各笔齐备时结算金额=Σ金额×汇率）' })
  addReceipt(@Param('id', ParseIntPipe) id: number, @Body() dto: AddReceiptDto) {
    return this.service.addReceipt(id, dto);
  }

  @Delete(':id/receipts/:receiptId')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '删除收汇记录（草稿限定）' })
  removeReceipt(@Param('id', ParseIntPipe) id: number, @Param('receiptId', ParseIntPipe) receiptId: number) {
    return this.service.removeReceipt(id, receiptId);
  }

  @Patch(':id/refresh-cost')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '刷新付款汇总（按款号重算总货款）' })
  refreshCost(@Param('id', ParseIntPipe) id: number) {
    return this.service.refreshCost(id);
  }

  @Patch(':id/refund-received')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '退税到账确认（可按实到金额覆盖，留痕，P3#39）' })
  refundReceived(@Param('id', ParseIntPipe) id: number, @Body('amount') amount: number | undefined, @Request() req: any) {
    return this.service.refundReceived(id, amount != null ? +amount : undefined, req.user.id);
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
