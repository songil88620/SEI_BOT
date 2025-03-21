import { Module, forwardRef } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { UserModule } from 'src/user/user.module';
import { SwapModule } from 'src/swap/swap.module';
import { SnipeModule } from 'src/snipe/snipe.module';
import { PairModule } from 'src/pair/pair.module';
import { PositionModule } from 'src/position/positioni.module';

@Module({
  imports: [
    forwardRef(() => UserModule),
    forwardRef(() => SwapModule),
    forwardRef(() => SnipeModule),
    forwardRef(() => PairModule),
    forwardRef(() => PositionModule)
  ],
  providers: [TelegramService],
  exports: [TelegramService]

})
export class TelegramModule { }
