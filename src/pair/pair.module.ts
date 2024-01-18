import { Module, forwardRef } from '@nestjs/common'; 
import { MongooseModule } from '@nestjs/mongoose'; 
import { PairSchema } from './pair.schema';
import { SwapModule } from 'src/swap/swap.module';
import { TelegramModule } from 'src/telegram/telegram.module';  
import { PairService } from './pair.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'pair', schema: PairSchema }]),
    forwardRef(() => TelegramModule),
    forwardRef(() => SwapModule),  
  ],
  controllers: [],
  providers: [PairService],
  exports: [PairService]
})
export class PairModule { }
