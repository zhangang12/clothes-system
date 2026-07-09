import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { CustomerService } from './customer.service';
import { CreateCustomerDto, ImportCustomerDto } from './dto/create-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';

@ApiTags('客户管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建客户' })
  create(@Body() dto: CreateCustomerDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Post('import')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '批量导入客户（CSV 前端解析后逐行入库）' })
  importBatch(@Body() dto: ImportCustomerDto, @Request() req: any) {
    return this.service.importBatch(dto.rows, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: '客户列表（分页；机密行级过滤：非管理员只见自建+被授权客户）' })
  findAll(@Query() query: QueryCustomerDto, @Request() req: any) {
    return this.service.findAll(query, req.user);
  }

  @Get('select')
  @ApiOperation({ summary: '客户下拉列表（已启用；机密行级过滤）' })
  listForSelect(@Query('grade') grade: string | undefined, @Request() req: any) {
    return this.service.listForSelect(grade, req.user);
  }

  // ===== 机密授权（设计稿 01 §D.3 批量授权，仅管理员）=====
  @Post('grants')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '批量授权机密权限（多客户×多用户，仅管理员）' })
  grantBatch(
    @Body() dto: { customer_ids: number[]; user_ids: number[]; can_edit?: boolean },
    @Request() req: any,
  ) {
    return this.service.grantBatch(dto.customer_ids, dto.user_ids, !!dto.can_edit, req.user.id);
  }

  @Get(':id/grants')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '某客户的机密授权清单' })
  getGrants(@Param('id', ParseIntPipe) id: number) {
    return this.service.getGrants(id);
  }

  @Delete(':id/grants/:userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '撤销某用户对该客户的机密授权' })
  revokeGrant(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    return this.service.revokeGrant(id, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '客户详情（机密：未授权返回 404，防探测）' })
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.findOne(id, req.user);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '更新客户信息（机密：仅创建人/有修改授权者/管理员）' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateCustomerDto>, @Request() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '启用/停用客户' })
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggleStatus(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除客户（逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
