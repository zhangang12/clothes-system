import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MenuGuard, MenuAccess } from '../../common/guards/menu.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { FactoryService } from './factory.service';
import { CreateFactoryDto, ImportFactoryDto, UpdateFactoryDto } from './dto/create-factory.dto';
import { QueryFactoryDto } from './dto/query-factory.dto';
import { maskFactory } from '../../common/masking/field-mask';

@ApiTags('工厂管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, MenuGuard)
@Controller('factories')
export class FactoryController {
  constructor(private readonly service: FactoryService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '创建工厂' })
  create(@Body() dto: CreateFactoryDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Post('import')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '批量导入工厂（CSV 前端解析后逐行入库）' })
  importBatch(@Body() dto: ImportFactoryDto, @Request() req: any) {
    return this.service.importBatch(dto.rows, req.user.id);
  }

  // B046：列表/详情带银行账号、税号、开票信息，原先无任何权限元数据（RolesGuard 无 @Roles 直接放行）。
  // 按「能看见工厂管理菜单的人才能调」收口（MenuAccess 与侧栏同一份口径，不砍角色）；
  // /select 只返回 id/编号/名称/类型，样衣/订单/合同/客户编辑页各角色都要用，保持开放。
  // 银行账号/税号/开票信息对版师、打样间脱敏（G4 提、G2 写的 maskFactory）：这两个角色的默认菜单里
  // 本来就有 factories，菜单闸拦不住他们；合同金额对他们是脱敏的，工厂账户信息不该是明文。
  @Get()
  @MenuAccess('factories')
  @ApiOperation({ summary: '工厂列表（分页）' })
  async findAll(@Query() query: QueryFactoryDto, @Request() req: any) {
    return maskFactory(await this.service.findAll(query), req.user?.role);
  }

  @Get('select')
  @ApiOperation({ summary: '工厂下拉列表（已启用）' })
  listForSelect(@Query('type') type?: string) {
    return this.service.listForSelect(type);
  }

  @Get(':id')
  @MenuAccess('factories')
  @ApiOperation({ summary: '工厂详情' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return maskFactory(await this.service.findOne(id), req.user?.role);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiOperation({ summary: '更新工厂信息' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFactoryDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '启用/停用工厂' })
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.service.toggleStatus(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除工厂（逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
