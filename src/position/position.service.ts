import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PositionDocument, PositionType } from './position.schema';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { skip, take } from 'rxjs';


@Injectable()
export class PositionService {

    constructor(
        @InjectModel('position') private readonly model: Model<PositionDocument>,
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

    async getMyPositions(userid: string) {
        return await this.model.find({ user_id: userid, active: true });
    }

    async getMyPositionOne(userid: string, idx: number) {
        const all = await this.model.find({ user_id: userid, active: true });
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
