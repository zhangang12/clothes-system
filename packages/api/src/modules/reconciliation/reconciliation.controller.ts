import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { ReconciliationService } from './reconciliation.service';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { GenerateLaborDto } from './dto/generate-labor.dto';
import { QueryReconciliationDto } from './dto/query-reconciliation.dto';

@ApiTags('对账管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reconciliations')
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建对账单（含出货明细/无合同费用明细；业务员可建·补充确认v1.1）' })
  create(@Body() dto: CreateReconciliationDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Post('labor')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS)
  @ApiOperation({ summary: '样衣打样工时对账：勾选多款样衣合并生成工时对账单（同一版师）' })
  generateLabor(@Body() dto: GenerateLaborDto, @Request() req: any) {
    return this.service.generateLabor(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '对账单列表（分页）' })
  findAll(@Query() query: QueryReconciliationDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '对账单详情（含出货明细）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id/submit')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS)
  @ApiOperation({ summary: '提交复核（业务员初审，DRAFT→PENDING）' })
  submit(@Param('id', ParseIntPipe) id: number) {
    return this.service.submit(id);
  }

  @Patch(':id/confirm')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '主管复核确认（PENDING→CONFIRMED，二级审批）' })
  confirm(@Param('id', ParseIntPipe) id: number, @Body('over_reason') overReason?: string) {
    return this.service.confirm(id, overReason);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '主管整单退回（PENDING→DRAFT，记录退回批注）' })
  reject(@Param('id', ParseIntPipe) id: number, @Body('remark') remark?: string) {
    return this.service.reject(id, remark);
  }

  // 改草稿（2026-08-11 ZYT：草稿能不能改/删）。只放开非结构性字段——批次与费用行改动
  // 牵扯占用释放与金额重算，风险高收益低，建错了删掉重建更稳
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.FINANCE, UserRole.BUSINESS)
  @ApiOperation({ summary: '修改草稿态对账单（发票/税率/说明；业务限本人创建的）' })
  updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { invoice_no?: string; invoice_amount?: number; tax_rate?: number; description?: string },
    @Request() req: any,
  ) {
    return this.service.updateDraft(id, dto, { id: req.user.id, role: req.user.role });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除对账单（草稿状态，逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
