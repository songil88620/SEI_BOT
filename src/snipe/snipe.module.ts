import { Module, forwardRef } from '@nestjs/common';
import { SnipeService } from './snipe.service';
import { UserModule } from 'src/user/user.module';
import { TelegramModule } from 'src/telegram/telegram.module';
import { SwapModule } from 'src/swap/swap.module'; 
import { BotModule } from 'src/bot/bot.module';

@Module({
  imports: [
    forwardRef(() => TelegramModule),
    forwardRef(() => UserModule),
    forwardRef(() => SwapModule), 
    forwardRef(() => BotModule)
  ],
  providers: [SnipeService],
  exports: [SnipeService]

})
export class SnipeModule { }
