import { Module, forwardRef } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { UserModule } from 'src/user/user.module';
import { SwapModule } from 'src/swap/swap.module'; 
import { SnipeModule } from 'src/snipe/snipe.module'; 

@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => SwapModule), 
    forwardRef(() => SnipeModule), 
  ],
  providers: [TelegramService],
  exports: [TelegramService]

})
export class TelegramModule { }
