import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { CompanyService } from './company.service';
import { CreateCompanyProfileDto } from './dto/create-company-profile.dto';

@ApiTags('本司主体')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('company-profiles')
export class CompanyController {
  constructor(private readonly service: CompanyService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '本司主体列表' })
  findAll() {
    return this.service.findAll();
  }

  @Get('default')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE, UserRole.SUPERVISOR)
  @ApiOperation({ summary: '默认本司主体（PDF 抬头/合同甲方取数）' })
  getDefault() {
    return this.service.getDefault();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE, UserRole.SUPERVISOR)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '新增本司主体（仅管理员）' })
  create(@Body() dto: CreateCompanyProfileDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCompanyProfileDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/set-default')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '设为默认主体' })
  setDefault(@Param('id', ParseIntPipe) id: number) {
    return this.service.setDefault(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
