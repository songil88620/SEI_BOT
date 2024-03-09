import { Module, forwardRef } from '@nestjs/common'; 
import { MongooseModule } from '@nestjs/mongoose';  
import { SwapModule } from 'src/swap/swap.module';
import { TelegramModule } from 'src/telegram/telegram.module';   
import { LevanaService } from './levana.service';

@Module({
  imports: [
    // MongooseModule.forFeature([{ name: 'pair', schema: PairSchema }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => SwapModule),  
  ],
  controllers: [],
  providers: [LevanaService],
  exports: [LevanaService]
})
export class LevanaModule { }
