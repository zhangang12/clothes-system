import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('对账管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('reconciliations')
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}

  @Get()
  findAll(@Query('page', new ParseIntPipe({ optional: true })) page?: number,
          @Query('size', new ParseIntPipe({ optional: true })) size?: number) {
    return this.service.findAll(page, size);
  }
}
