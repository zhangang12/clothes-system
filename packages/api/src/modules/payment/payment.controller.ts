import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query,
  ParseIntPipe, DefaultValuePipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, PaymentApprovalStatus } from '@i9/types';
import { PaymentService } from './payment.service';
import { CreatePrepaymentDto } from './dto/create-prepayment.dto';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';

@ApiTags('付款管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  // ——— Prepayment ———
  @Post('prepayments')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '创建预付款' })
  createPrepayment(@Body() dto: CreatePrepaymentDto, @Request() req: any) {
    return this.service.createPrepayment(dto, req.user.id);
  }

  @Get('prepayments')
  @ApiOperation({ summary: '预付款列表' })
  findPrepayments(
    @Query('factory_id') factoryId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number = 20,
  ) {
    return this.service.findPrepayments(factoryId ? Number(factoryId) : undefined, page, size);
  }

  @Get('prepayments/balance')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '查询工厂预付款余额' })
  getPrepayBalance(@Query('factory_id', ParseIntPipe) factoryId: number) {
    return this.service.getAvailablePrepayBalance(factoryId);
  }

  // ——— Payment Request ———
  @Post('requests')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '创建付款申请' })
  createPaymentRequest(@Body() dto: CreatePaymentRequestDto, @Request() req: any) {
    return this.service.createPaymentRequest(dto, req.user.id);
  }

  @Get('requests')
  @ApiOperation({ summary: '付款申请列表' })
  findPaymentRequests(
    @Query('factory_id') factoryId?: string,
    @Query('approval_status') approvalStatus?: PaymentApprovalStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number = 20,
  ) {
    return this.service.findPaymentRequests(factoryId ? Number(factoryId) : undefined, approvalStatus, page, size);
  }

  @Patch('requests/:id/submit')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '提交付款申请（DRAFT→PENDING）' })
  submitPaymentRequest(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.submitPaymentRequest(id, req.user.id);
  }

  @Patch('requests/:id/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '审批通过（PENDING→APPROVED）+ 冲抵预付款' })
  approvePaymentRequest(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.approvePaymentRequest(id, req.user.id);
  }

  @Patch('requests/:id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '驳回付款申请（PENDING→REJECTED）' })
  rejectPaymentRequest(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body('reason') reason: string,
  ) {
    return this.service.rejectPaymentRequest(id, req.user.id, reason);
  }

  @Patch('requests/:id/paid')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '标记已付款（APPROVED→PAID），上传水单' })
  markPaid(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkPaidDto,
    @Request() req: any,
  ) {
    return this.service.markPaid(id, dto.slip_url, req.user.id);
  }

  @Delete('requests/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除付款申请（草稿状态，逻辑删除）' })
  removePaymentRequest(@Param('id', ParseIntPipe) id: number) {
    return this.service.removePaymentRequest(id);
  }
}
