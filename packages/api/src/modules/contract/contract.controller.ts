import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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

  @Get('price-hint')
  @ApiOperation({ summary: '历史同款价格提示（同款号+品名最近合同单价，P3#41）' })
  priceHint(@Query('style_no') styleNo: string, @Query('item_name') itemName?: string) {
    return this.service.priceHint(styleNo ?? '', itemName);
  }

  @Get('by-style')
  @ApiOperation({ summary: '按款号列出合同（对账/付款「搜款号→选合同」，带出工厂）' })
  byStyle(@Query('style_no') styleNo: string) {
    return this.service.contractsByStyle(styleNo ?? '');
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
  @ApiOperation({ summary: '更新合同状态（ACTIVE/COMPLETED/CANCELLED）' })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: ContractStatus) {
    return this.service.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除合同（草稿状态，逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
