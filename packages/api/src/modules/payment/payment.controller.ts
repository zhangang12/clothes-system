import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query,
  ParseIntPipe, DefaultValuePipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { PaymentService } from './payment.service';
import { CreatePrepaymentDto } from './dto/create-prepayment.dto';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { QueryPaymentRequestDto } from './dto/query-payment-request.dto';
import { QueryFactoryStatementDto } from './dto/query-factory-statement.dto';

@ApiTags('付款管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  // ——— Prepayment ———
  // 与「创建付款申请」同一档放开到业务（2026-08-22 用户拍板）：登记一笔预付本身是发起动作，
  // 而这笔钱要真花出去，仍须走付款申请并由管理员/财务审批（冲抵就发生在 approve 那一步），
  // 所以业务能登记、但动不了钱。审批/实付/删除维持只给管理员与财务。
  @Post('prepayments')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建预付款（管理员/主管/财务/业务）' })
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

  // 跟着创建一起放开：能登记预付却看不到余额，登记完就是一笔糊涂账
  @Get('prepayments/balance')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS)
  @ApiOperation({ summary: '查询工厂预付款余额（管理员/主管/财务/业务）' })
  getPrepayBalance(@Query('factory_id', ParseIntPipe) factoryId: number) {
    return this.service.getAvailablePrepayBalance(factoryId);
  }

  // ——— Payment Request ———
  @Post('requests')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建付款申请（业务可发起无合同付款，P3#40/对账E3）' })
  createPaymentRequest(@Body() dto: CreatePaymentRequestDto, @Request() req: any) {
    return this.service.createPaymentRequest(dto, req.user.id);
  }

  @Get('requests')
  @ApiOperation({ summary: '付款申请列表（工厂+申请日期组合检索；reconcile_id 可按对账单反查）' })
  // 散参收为 DTO：原 10 个 Query 参数散落无校验，收敛后 forbidNonWhitelisted 生效，
  // 但日期/状态字段用 @IsString() 宽松校验——前端清空筛选项时发出空串 ''（不通过 IsDateString/IsEnum）
  findPaymentRequests(@Query() query: QueryPaymentRequestDto) {
    return this.service.findPaymentRequests(query);
  }

  // 工厂账单（2026-08-11 qiao）。**不额外加 @Roles**：内容与本页两个 Tab 列表逐字段一致，
  // 只是按工厂汇到一起，没有新增任何暴露面；加了反而让业务看不到导出按钮、又来一条"找不到入口"。
  @Get('factory-statement')
  @ApiOperation({ summary: '工厂账单：某工厂的付款申请/实付记录/预付款/对账单 + 汇总（导出用）' })
  getFactoryStatement(@Query() query: QueryFactoryStatementDto) {
    return this.service.getFactoryStatement(query.factory_id, query.start_date, query.end_date);
  }

  @Patch('requests/:id/submit')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '提交付款申请（DRAFT→PENDING）' })
  submitPaymentRequest(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.submitPaymentRequest(id, req.user.id);
  }

  @Patch('requests/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '审批通过（PENDING→APPROVED）+ 冲抵预付款' })
  approvePaymentRequest(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.approvePaymentRequest(id, req.user.id);
  }

  @Patch('requests/:id/reject')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '驳回付款申请（PENDING→REJECTED）' })
  rejectPaymentRequest(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body('reason') reason: string,
  ) {
    return this.service.rejectPaymentRequest(id, req.user.id, reason);
  }

  @Post('requests/:id/records')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: '分批付款登记（多次付款自动累计已付/未付，余额=0 整单转已付清，设计稿 06 v1.1）' })
  addRecord(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Request() req: any) {
    return this.service.addPaymentRecord(id, dto, req.user.id);
  }

  @Get('requests/:id/records')
  @ApiOperation({ summary: '付款申请的分批付款记录' })
  getRecords(@Param('id', ParseIntPipe) id: number) {
    return this.service.getPaymentRecords(id);
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

  // 改草稿（2026-08-10 King：非合同付款草稿建错了没法调）。放行 BUSINESS 但**只能改自己建的**，
  // 不动既有角色矩阵——提交/审批/付款仍是财务/管理员
  @Patch('requests/:id')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS)
  @ApiOperation({ summary: '修改草稿态付款申请（仅 DRAFT；业务限本人创建的）' })
  updatePaymentRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreatePaymentRequestDto>,
    @Request() req: any,
  ) {
    return this.service.updatePaymentRequest(id, dto, { id: req.user.id, role: req.user.role });
  }

  @Delete('requests/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除付款申请（草稿状态，逻辑删除）' })
  removePaymentRequest(@Param('id', ParseIntPipe) id: number) {
    return this.service.removePaymentRequest(id);
  }
}
