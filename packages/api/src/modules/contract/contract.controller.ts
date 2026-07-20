import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { ContractService } from './contract.service';
import { maskContract } from '../../common/masking/field-mask';
import { ContractStatus } from './contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { QueryContractDto } from './dto/query-contract.dto';

// 合同状态更新 DTO（2026-07-19 排查 L6）：status 必须过 class-validator 枚举校验，
// 非法值在入口 400，不再裸打到 MySQL enum 列报 500
export class UpdateContractStatusDto {
  @ApiProperty({ enum: ContractStatus, description: '目标状态（ACTIVE/COMPLETED/CANCELLED）' })
  @IsEnum(ContractStatus)
  status: ContractStatus;
}

@ApiTags('合同管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractController {
  constructor(private readonly service: ContractService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建合同（含材料明细）' })
  create(@Body() dto: CreateContractDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Post('generate-from-order/:orderId')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '供应商拆单生成材料合同（按订单材料供应商分组）' })
  generateFromOrder(@Param('orderId', ParseIntPipe) orderId: number, @Request() req: any) {
    return this.service.generateFromOrder(orderId, req.user.id);
  }

  // 价格提示/按款号查合同均含供应商成本价（unit_price/total_amount），属脱敏基建覆盖范围
  // （2026-07-19 排查 M3）：补齐 @Roles 挡版师/打样，返回统一过 maskContract 兜底
  @Get('price-hint')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '历史同款价格提示（同款号+品名最近合同单价，P3#41）' })
  async priceHint(
    @Query('style_no') styleNo: string,
    @Query('item_name') itemName: string | undefined,
    @Request() req: any,
  ) {
    return maskContract(await this.service.priceHint(styleNo ?? '', itemName), req.user.role);
  }

  @Get('by-style')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '按款号列出合同（对账/付款「搜款号→选合同」，带出工厂）' })
  async byStyle(@Query('style_no') styleNo: string, @Request() req: any) {
    return maskContract(await this.service.contractsByStyle(styleNo ?? ''), req.user.role);
  }

  @Get()
  @ApiOperation({ summary: '合同列表（分页；版师/打样脱敏供应商成本）' })
  async findAll(@Query() query: QueryContractDto, @Request() req: any) {
    return maskContract(await this.service.findAll(query), req.user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: '合同详情（含材料明细；版师/打样脱敏供应商成本）' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return maskContract(await this.service.findOne(id), req.user.role);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: '合同门户操作日志' })
  getLogs(@Param('id', ParseIntPipe) id: number) {
    return this.service.getLogs(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '编辑合同（草稿全字段可改；推送后仅备注可改，E5 锁定）' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContractDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/push')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '推送合同至供应商门户（DRAFT→PUSHED；超阈值需先审批）' })
  push(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.push(id, req.user.username);
  }

  @Patch(':id/recall')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '撤销推送（PUSHED→DRAFT，供应商未盖章前可撤回修改后重推）' })
  recall(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.recall(id, req.user.username);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '主管审批超阈值合同（待审批→已审批）' })
  approve(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.approveContract(id, req.user.id);
  }

  @Patch(':id/shipments/:sid/approval')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '审批发货批次（通过后供应商门户方可勾选该批次对账，设计稿 门户 B2）' })
  approveShipment(
    @Param('id', ParseIntPipe) id: number,
    @Param('sid', ParseIntPipe) sid: number,
    @Body('approve') approve: boolean,
    @Request() req: any,
  ) {
    return this.service.approveShipment(id, sid, req.user.id, approve !== false);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '更新合同状态（状态机白名单流转；有对账/付款关联禁止直接作废）' })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContractStatusDto) {
    return this.service.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除合同（草稿状态，逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
