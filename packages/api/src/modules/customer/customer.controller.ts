import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from '@i9/types';

@ApiTags('客户管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('customers')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建客户' })
  create(@Body() dto: CreateCustomerDto) { return this.service.create(dto); }

  @Get()
  @ApiOperation({ summary: '客户列表' })
  findAll(@Query('page', new ParseIntPipe({ optional: true })) page?: number,
          @Query('size', new ParseIntPipe({ optional: true })) size?: number,
          @Query('keyword') keyword?: string) {
    return this.service.findAll(page, size, keyword);
  }

  @Get(':id')
  @ApiOperation({ summary: '客户详情' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '更新客户' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateCustomerDto>) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除客户（逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
