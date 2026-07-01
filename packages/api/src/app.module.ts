import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { FactoryModule } from './modules/factory/factory.module';
import { CustomerModule } from './modules/customer/customer.module';
import { SampleModule } from './modules/sample/sample.module';
import { QuoteModule } from './modules/quote/quote.module';
import { OrderModule } from './modules/order/order.module';
import { ContractModule } from './modules/contract/contract.module';
import { PortalModule } from './modules/portal/portal.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { PaymentModule } from './modules/payment/payment.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { NumberingModule } from './common/services/numbering.module';
import { FileModule } from './common/services/file.module';

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // 限流（登录接口 10次/min，其余 300次/min）
    ThrottlerModule.forRoot([
      { name: 'login', ttl: 60000, limit: 10 },
      { name: 'global', ttl: 60000, limit: 300 },
    ]),

    // 数据库
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: databaseConfig,
      inject: [ConfigService],
    }),

    // 公共服务
    NumberingModule,
    FileModule,

    // 业务模块
    AuthModule,
    FactoryModule,
    CustomerModule,
    SampleModule,
    QuoteModule,
    OrderModule,
    ContractModule,
    PortalModule,
    ReconciliationModule,
    PaymentModule,
    SettlementModule,
  ],
})
export class AppModule {}
