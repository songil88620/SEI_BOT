import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PostionSchema } from './position.schema';
import { SwapModule } from 'src/swap/swap.module';
import { TelegramModule } from 'src/telegram/telegram.module';
import { PositionService } from './position.service';
import { PairModule } from 'src/pair/pair.module';
@Module({
    imports: [
        MongooseModule.forFeature([{ name: 'position', schema: PostionSchema }]),
        forwardRef(() => TelegramModule),
        forwardRef(() => SwapModule),
        forwardRef(() => PairModule)
    ],
    controllers: [],
    providers: [PositionService],
    exports: [PositionService]
})
export class PositionModule { }
