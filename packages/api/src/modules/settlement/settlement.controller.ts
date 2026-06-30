import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SettlementService } from './settlement.service';

@ApiTags('结算管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('settlements')
export class SettlementController {
  constructor(private readonly service: SettlementService) {}

  @Get()
  findAll(@Query('page', new ParseIntPipe({ optional: true })) page?: number,
          @Query('size', new ParseIntPipe({ optional: true })) size?: number) {
    return this.service.findAll(page, size);
  }
}
