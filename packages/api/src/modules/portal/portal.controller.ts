import {
  Controller, Get, Patch, Body, Param, Query,
  ParseIntPipe, DefaultValuePipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SupplierGuard } from '../../common/guards/supplier.guard';
import { PortalService } from './portal.service';
import { ConfirmShipDto } from './dto/confirm-ship.dto';
import { UploadInvoiceDto } from './dto/upload-invoice.dto';
import { StampDto } from './dto/stamp.dto';

@ApiTags('供应商门户')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SupplierGuard)
@Controller('portal/contracts')
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Get()
  @ApiOperation({ summary: '门户合同列表（供应商视角）' })
  getContracts(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
    @Query('portal_status') portalStatus?: string,
  ) {
    return this.service.getContracts(req.user.factory_id, page, size, portalStatus);
  }

  @Get(':id')
  @ApiOperation({ summary: '合同详情（含材料明细和操作日志）' })
  getContract(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.getContract(id, req.user.factory_id);
  }

  @Patch(':id/stamp')
  @ApiOperation({ summary: '供应商盖章（须勾选同意条款；PUSHED→STAMPED，锁定快照）' })
  stamp(@Param('id', ParseIntPipe) id: number, @Body() dto: StampDto, @Request() req: any) {
    return this.service.stamp(id, req.user.username, req.user.factory_id, dto.agreed);
  }

  @Patch(':id/ship')
  @ApiOperation({ summary: '确认出货（STAMPED→SHIPPING）' })
  confirmShipping(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() dto: ConfirmShipDto,
  ) {
    return this.service.confirmShipping(id, req.user.username, req.user.factory_id, dto);
  }

  @Patch(':id/invoice')
  @ApiOperation({ summary: '上传增值税发票（记录日志）' })
  uploadInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() dto: UploadInvoiceDto,
  ) {
    return this.service.uploadInvoice(id, req.user.username, req.user.factory_id, dto);
  }
}
