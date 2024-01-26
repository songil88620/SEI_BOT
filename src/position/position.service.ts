import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PositionDocument } from './position.schema';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';


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


    async findOne(id: string) {
        const user = await this.model.findOne({ id }).exec();
        return user
    }

    async update(id: string, data) {
        return await this.model.findOneAndUpdate({ id: id }, data, { new: true }).exec()
    }



}
