import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PositionDocument, PositionType } from './position.schema';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { skip, take } from 'rxjs';
import { UserType } from 'src/user/user.schema';
import { PairService } from 'src/pair/pair.service';
import { PairType } from 'src/pair/pair.schema';


@Injectable()
export class PositionService {

    constructor(
        @InjectModel('position') private readonly model: Model<PositionDocument>,
        @Inject(forwardRef(() => PairService)) private pairService: PairService,
    ) { }

    async onModuleInit() {
        try {
        } catch (e) {
        }
    }

    @Cron(CronExpression.EVERY_5_MINUTES, { name: 'position_bot' })
    async pairBot() {

    }

    async createNewOne(data: any) {
        await new this.model({ ...data }).save();
    }

    async createAutoNewOne(user: UserType) {
        try {
            const td: PairType = await this.pairService.getPairByToken(user.autotrade.token);
            const new_pos: PositionType = {
                user_id: user.id,
                name: td.name,
                denom: td.denom,
                initial: {
                    sei_amount: user.autotrade.buy_amount,
                    sei_price: user.autotrade.buy_price,
                    token_amount: '0',
                    token_price: user.autotrade.sell_price,
                    pool: td.pool
                },
                updated: this.currentTime(),
                active: true,
                sell: [],
                auto: {
                    buy_amount: user.autotrade.buy_amount,
                    buy_price: user.autotrade.buy_price,
                    sell_amount: user.autotrade.sell_amount,
                    sell_price: user.autotrade.sell_price
                },
                auto_active: true
            }
            await new this.model({ ...new_pos }).save();
            return true
        } catch (e) {
            return false
        }
    }

    async getMyManualPositions(userid: string) {
        return await this.model.find({ user_id: userid, active: true, $or: [{ auto_active: false }, { auto_active: null }] });
    }

    async getMyAutoPositions(userid: string) {
        return await this.model.find({ user_id: userid, active: true, auto_active: true });
    }

    async getMyPositionOne(userid: string, idx: number) {
        const all = await this.model.find({ user_id: userid, active: true, $or: [{ auto_active: false }, { auto_active: null }] });
        const len = all.length;
        const page = Math.abs(idx % len);
        if (len > 0) {
            for (var i = 0; i < len; i++) {
                if (i == page) {
                    return { position: all[i], len: len }
                }
            }
        } else {
            return { position: null, len: 0 };
        }
    }

    async getMyPositionOneAuto(userid: string, idx: number) {
        const all = await this.model.find({ user_id: userid, active: true, auto_active: true });
        const len = all.length;
        const page = Math.abs(idx % len);
        if (len > 0) {
            for (var i = 0; i < len; i++) {
                if (i == page) {
                    return { position: all[i], len: len }
                }
            }
        } else {
            return { position: null, len: 0 };
        }
    }

    async updatePositionOne(id: string, pos: PositionType) {
        await this.model.findByIdAndUpdate(id, pos)
    }

    async deletePositionOne(id: string) {
        await this.model.findByIdAndRemove(id)
    }

    currentTime() {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = String(now.getFullYear()).slice(-2);
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const dateTimeString = `${day}/${month}/${year} ${hours}:${minutes}`;
        return dateTimeString;
    }

    // --------- not used yet




    async find_update(data: any) {
        const id = data.id;
        const pair = await this.model.findOne({ id: id }).exec();
        if (!pair) {
            return await new this.model({ ...data }).save();
        } else {
            await this.model.findOneAndUpdate({ id: id }, data, { new: true }).exec()
        }
    }

    async findAll() {
        return await this.model.find().exec();
    }

    async delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    //----------- not used yet -----------------




}
