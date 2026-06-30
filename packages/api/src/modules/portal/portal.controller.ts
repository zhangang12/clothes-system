import { Controller, Get, Query, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PortalService } from './portal.service';

@ApiTags('供应商门户')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('portal/contracts')
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Get()
  getContracts(@Request() req: any,
               @Query('page', new ParseIntPipe({ optional: true })) page?: number,
               @Query('size', new ParseIntPipe({ optional: true })) size?: number) {
    return this.service.getContracts(req.user.factory_id, page, size);
  }
}
