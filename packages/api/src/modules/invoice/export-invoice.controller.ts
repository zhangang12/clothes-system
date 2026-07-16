import {
  Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, DefaultValuePipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { ExportInvoiceService, CreateInvoiceDto } from './export-invoice.service';

@ApiTags('出口发票')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('export-invoices')
export class ExportInvoiceController {
  constructor(private readonly service: ExportInvoiceService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS)
  @ApiOperation({ summary: '登记出口发票（一票多款款项行，结算Q12）' })
  create(@Body() dto: CreateInvoiceDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '出口发票列表（含款项行/收汇合计；order_id 可按订单反查）' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
    @Query('keyword') keyword?: string,
    @Query('order_id') orderId?: string,
  ) {
    return this.service.findAll(page, size, keyword, orderId ? Number(orderId) : undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: '出口发票详情（款项行+逐笔收汇+差额）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post(':id/receipts')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '登记逐笔收汇（多笔多汇率+水单，结算Q12/Q13）' })
  addReceipt(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.addReceipt(id, dto);
  }

  @Delete(':id/receipts/:receiptId')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '删除收汇记录' })
  removeReceipt(@Param('id', ParseIntPipe) id: number, @Param('receiptId', ParseIntPipe) receiptId: number) {
    return this.service.removeReceipt(id, receiptId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除发票（无收汇时，逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
