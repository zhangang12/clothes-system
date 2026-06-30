import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';
import { FactoryService } from './factory.service';
import { CreateFactoryDto } from '@i9/types';

@ApiTags('工厂管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('factories')
export class FactoryController {
  constructor(private readonly service: FactoryService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '创建工厂' })
  create(@Body() dto: CreateFactoryDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '工厂列表' })
  findAll(@Query('page', new ParseIntPipe({ optional: true })) page?: number,
          @Query('size', new ParseIntPipe({ optional: true })) size?: number,
          @Query('keyword') keyword?: string) {
    return this.service.findAll(page, size, keyword);
  }

  @Get(':id')
  @ApiOperation({ summary: '工厂详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '更新工厂' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateFactoryDto>) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '删除工厂（逻辑删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
