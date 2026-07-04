import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Prepayment } from './prepayment.entity';
import { PaymentRequest } from './payment-request.entity';
import { Reconciliation } from '../reconciliation/reconciliation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Prepayment, PaymentRequest, Reconciliation])],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
