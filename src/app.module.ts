import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramModule } from './telegram/telegram.module';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MONGO_ROOT } from './constant';
import { UserModule } from './user/user.module';
import { SwapModule } from './swap/swap.module';
import { BotModule } from './bot/bot.module';
import { SnipeModule } from './snipe/snipe.module'; 
import { ScheduleModule } from '@nestjs/schedule'; 
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core'; 
import { PairModule } from './pair/pair.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRoot(MONGO_ROOT),
    ScheduleModule.forRoot(), 
    UserModule, 
    TelegramModule,
    SwapModule, 
    SnipeModule, 
    BotModule,
    PairModule,
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 100
    })
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ],
})
export class AppModule { }
