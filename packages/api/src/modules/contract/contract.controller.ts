import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ContractService } from './contract.service';

@ApiTags('合同管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('contracts')
export class ContractController {
  constructor(private readonly service: ContractService) {}

  @Get()
  findAll(@Query('page', new ParseIntPipe({ optional: true })) page?: number,
          @Query('size', new ParseIntPipe({ optional: true })) size?: number) {
    return this.service.findAll(page, size);
  }
}
