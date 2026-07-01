import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { OrderService } from './order.service';
import { CreateOrderDto, AddShipmentDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

@ApiTags('订单管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建订单' })
  create(@Body() dto: CreateOrderDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '订单列表（分页）' })
  findAll(@Query() query: QueryOrderDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '订单详情（含用料/出货/尺码矩阵）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '编辑订单（草稿状态）' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateOrderDto>) {
    return this.service.update(id, dto);
  }

  @Patch(':id/advance')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '推进订单状态（DRAFT→CONFIRMED→PRODUCING→SHIPPED→DONE）' })
  advanceStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.advanceStatus(id);
  }

  @Post(':id/shipments')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '添加出货记录' })
  addShipment(@Param('id', ParseIntPipe) id: number, @Body() dto: AddShipmentDto, @Request() req: any) {
    return this.service.addShipment(id, dto, req.user.id);
  }

  @Patch(':id/matrix')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '更新尺码矩阵' })
  updateMatrix(@Param('id', ParseIntPipe) id: number, @Body() body: { matrix_data: Record<string, unknown> }) {
    return this.service.updateMatrix(id, body.matrix_data);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除订单（草稿状态，逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
