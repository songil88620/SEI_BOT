import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PostionSchema } from './position.schema';
import { SwapModule } from 'src/swap/swap.module';
import { TelegramModule } from 'src/telegram/telegram.module';
import { PositionService } from './position.service';
@Module({
    imports: [
        MongooseModule.forFeature([{ name: 'position', schema: PostionSchema }]),
        forwardRef(() => TelegramModule),
        forwardRef(() => SwapModule),
    ],
    controllers: [],
    providers: [PositionService],
    exports: [PositionService]
})
export class PositionModule { }
