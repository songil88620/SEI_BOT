import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { UserType } from 'src/user/user.schema';
import { getSigningClient, getSigningCosmWasmClient, restoreWallet } from '@sei-js/core';
import { LEVANA_FACTORY, RPC_URL } from 'src/constant';


@Injectable()
export class LevanaService {


    constructor(
        // @InjectModel('pair') private readonly model: Model<PairDocument>,
    ) { }

    async onModuleInit() {
        try {
            this.test()
        } catch (e) {
        }
    }

    // run every 30 seconds for memory
    @Cron(CronExpression.EVERY_30_SECONDS, { name: 'lv_bot' })
    async pairsList() {

    }


    async test() {
        // const userid = user.id
        const mnemonic = 'mechanic soccer disorder bulk refuse reveal harvest arrive coil multiply elite ripple';
        const wallet = await restoreWallet(mnemonic);
        const [firstAccount] = await wallet.getAccounts();
        const signingClient = await getSigningClient(RPC_URL, wallet);

        // const contract = await signingClient.getAccount(LEVANA_FACTORY);
        // console.log(">>contract", contract) SEI_USD

        const signingCosmWasmClient = await getSigningCosmWasmClient(
            RPC_URL,
            wallet,
        );
        const markets: { markets: string[] } = await signingCosmWasmClient.queryContractSmart(LEVANA_FACTORY, { markets: {} });

        for (const marketId of markets.markets) {
            console.log(">>mkid", marketId)
        }
    }





}
