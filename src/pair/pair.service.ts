import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PairDocument, PairType } from './pair.schema';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';


@Injectable()
export class PairService {

    private timer = 0;
    public tokenList: PairType[] = [];

    constructor(
        @InjectModel('pair') private readonly model: Model<PairDocument>,
    ) { }

    async onModuleInit() {
        try {
            // await this.updatePair();
        } catch (e) {
        }
    }

    // run every 2 mins for database
    @Cron(CronExpression.EVERY_MINUTE, { name: 'pair_bot' })
    async pairBot() { 
        this.timer = this.timer + 1;
        if (this.timer % 2) {
            await this.updatePair();
            if (this.timer > 100) {
                this.timer = 0;
            }
        }
    }

    // run every 30 seconds for memory
    @Cron(CronExpression.EVERY_30_SECONDS, { name: 'token_list_bot' })
    async pairsList() {
        await this.updateTokenList()
    }

    async getHotPair(n: number) {
        const pairs = await this.model.find().exec();
        const top5_hot = pairs.sort((a, b) => b.trx_h1 - a.trx_h1).slice(0, n)
        return top5_hot;
    }


    async updatePair() {
        try {
            const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            for (var p of pages) {
                const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/sei-network/pools?page=' + p);
                for (var item of res.data.data) {
                    const data = {
                        id: item.id,
                        type: item.pool,
                        price: item.attributes.base_token_price_usd,
                        pool: item.attributes.address,
                        denom: item.relationships.base_token.data.id.slice(12),
                        name: item.attributes.name.slice(0, -6),
                        trx_h1: item.attributes.transactions.h1.buys + item.attributes.transactions.h1.sells,
                        trx_h24: item.attributes.transactions.h24.buys + item.attributes.transactions.h24.sells,
                        decimal: '6',
                        other_1: {
                            vol_h1: item.attributes.volume_usd.h1,
                            vol_h24: item.attributes.volume_usd.h24,
                            pch_h1: item.attributes.price_change_percentage.h1,
                            pch_h24: item.attributes.price_change_percentage.h24
                        },
                        other_2: {
                            base_token_price: item.attributes.base_token_price_usd,
                            quote_token_price: item.attributes.quote_token_price_usd,
                            profit: '0',
                            initial: '0',
                            price: '0',
                            liquidity: '0',
                            cap: item.attributes.reserve_in_usd,
                            p_ch_h1: item.attributes.price_change_percentage.h1,
                            p_ch_h24: item.attributes.price_change_percentage.h24,
                        },
                        updated: this.currentTime()
                    }
                    if (item.attributes.name.split("/")[1] == ' SEI' && !data.denom.includes('factory/')) {
                        await this.find_update(data);
                    }
                }
                // await this.delay(3000);
            }
            return
        } catch (e) {
            return
        }
    }

    updateTokenList = async () => {
        const all = await this.model.find().exec();
        const sei: PairType = {
            id: '',
            type: '',
            price: '',
            pool: '',
            denom: 'usei',
            name: 'SEI',
            decimal: '',
            trx_h1: 0,
            trx_h24: 0,
            other_1: {
                vol_h1: '',
                vol_h24: '',
                pch_h1: '',
                pch_h24: ''
            },
            other_2: {
                base_token_price: '',
                quote_token_price: '',
                price: '',
                liquidity: '',
                cap: '',
                p_ch_h1: '',
                p_ch_h24: ''
            },
            updated: ''
        }
        this.tokenList = [sei, ...all]
    }

    async getPairByToken(denom: string) {
        return await this.model.findOne({ denom }).exec();
    }

    async getPairByTokenNew(denom: string) {
        const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/sei-network/tokens/multi/usei%2C' + denom);
        return res.data.data;
    }


    async find_update(data: any) {
        const id = data.id;
        const pair = await this.model.findOne({ id: id }).exec();
        if (!pair) {
            return await new this.model({ ...data }).save();
        } else {
            await this.model.findOneAndUpdate({ id: id }, data).exec()
        }
    }

    async findAll() {
        return await this.model.find().exec();
    }

    async delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    //----------- not used yet -----------------
    async create(data: any) {
        const id = data.id;
        const pair = await this.model.findOne({ id: id }).exec();
        if (!pair) {
            return await new this.model({ ...data }).save();
        }
    }

    async findOne(id: string) {
        const user = await this.model.findOne({ id }).exec();
        return user
    }

    async update(id: string, data) {
        return await this.model.findOneAndUpdate({ id: id }, data, { new: true }).exec()
    }



}
