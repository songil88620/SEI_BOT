import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type UserDocument = User & Document;

interface Sniper {
    network: string,
    contract: string,
    autobuy: boolean,
    buyamount: string,
    gasprice: string,
    slippage: string,
    smartslip: boolean
}

@Schema()
export class User {

    @Prop()
    id: string;  

    @Prop()
    username: string;

    @Prop({ type: {} })
    wallet: {
        address: string;
        key: string;
    }

    @Prop({ type: {} })
    sniper: {
        network: string,
        contract: string,
        autobuy: boolean,
        buyamount: string,
        gasprice: string,
        slippage: string, 
        wallet: number,
        result: string,
        multi: boolean,
        blockwait: number, 
        startprice: number,
        sellrate: number,
        autosell: boolean,
        sold: boolean,
        private: boolean,
        mtype: boolean,
        method: string,
        token: {
            name: string,
            symbol: string,
            decimal: string,
            supply: string,
            owner: string,
            lppair: string,
            honeypot: number,
            buytax: number,
            selltax: number,
            transferfee: number,
            maxwallet: string,
            maxwp: number,
            methods: any[]
        }
    };

    @Prop({ type: {} })
    swap: {
        token: string,
        amount: string,
        gasprice: string,
        slippage: string, 
        mode: boolean
    }

    @Prop({ type: {} })
    transfer: {
        token: string,
        amount: string, 
        to: string, 
    }

    @Prop({ type: {} })
    perps: {
        pairidx: number,
        leverage: number,
        slippage: number,
        stoploss: number,
        profit: number,
        autotrade: boolean,
        longshort: boolean,
        size: number,
        wallet: number
    }

    @Prop()
    limits: {
        token: string,
        amount: string,
        price: string,
        wallet: number,
        result: boolean,
        except: boolean,
        gasprice: string,
        slippage: string,
        private: boolean
    }[]

    @Prop()
    mirror: {
        address: string,
        amount: string,
        gasprice: string,
        slippage: string,
        private: boolean
    }[]

    @Prop()
    wmode: boolean;

    @Prop()
    detail: string;

    @Prop({ type: {} })
    other: {
        mirror: number,
        limit: number
    }

    @Prop()
    referral: string[];

    @Prop()
    code: string;

    @Prop()
    inviter: string;

    @Prop()
    txamount: number;

    @Prop()
    tmp: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

