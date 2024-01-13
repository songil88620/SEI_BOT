import { Module, forwardRef } from '@nestjs/common';
import { BotService } from './bot.service';
import { UserModule } from 'src/user/user.module'; 
import { SwapModule } from 'src/swap/swap.module';

@Module({
  imports: [
    forwardRef(() => UserModule), 
    forwardRef(() => SwapModule)
  ],
  providers: [BotService],
  exports: [BotService]
})
export class BotModule { }
