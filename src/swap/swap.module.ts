import { Module, forwardRef } from '@nestjs/common';
import { SwapService } from './swap.service';
import { UserModule } from 'src/user/user.module'; 
import { TelegramModule } from 'src/telegram/telegram.module';  
import { LogModule } from 'src/log/log.module';
import { BotModule } from 'src/bot/bot.module';

@Module({
  imports: [   
    forwardRef(()=>TelegramModule),
    forwardRef(()=>UserModule), 
    forwardRef(()=>LogModule),
    forwardRef(()=>BotModule)
  ],
  providers: [SwapService],
  exports:[SwapService]

})
export class SwapModule { }
