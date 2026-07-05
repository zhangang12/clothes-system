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
import { ContractStatus } from './contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
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

  @Get()
  @ApiOperation({ summary: '合同列表（分页）' })
  findAll(@Query() query: QueryContractDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '合同详情（含材料明细）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: '合同门户操作日志' })
  getLogs(@Param('id', ParseIntPipe) id: number) {
    return this.service.getLogs(id);
  }

  @Patch(':id/push')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '推送合同至供应商门户（DRAFT→PUSHED；超阈值需先审批）' })
  push(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.push(id, req.user.username);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '主管审批超阈值合同（待审批→已审批）' })
  approve(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.approveContract(id, req.user.id);
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
