import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";



export interface UserType {
    id: string,
    username: string,
    wallet: {
        address: string,
        key: string
    },
    swap: {
        token: string,
        amount: string,
        gasprice: string,
        slippage: string,
        mode: boolean
    },
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
    },
    transfer: {
        token: string,
        amount: string,
        to: string,
    },
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
    },
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
    }[],
    mirror: {
        address: string,
        amount: string,
        gasprice: string,
        slippage: string,
        private: boolean
    }[],
    wmode: boolean,
    detail: string,
    other: {
        mirror: number,
        limit: number
    },
    referral: string[],
    code: string,
    inviter: string,
    txamount: number,
    current_page: number,
    current_panel: string,
    setting: {
        buy_gasprice: string,
        buy_slippage: string,
        sell_gasprice: string,
        sell_slippage: string
    },
    fee_type: number;
    claim_amount: number;
    autotrade: {
        token: string,
        buy_amount: string,
        buy_price: string,
        sell_amount: string,
        sell_price: string,
    };
}


export type UserDocument = User & Document;

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
    current_page: number;

    @Prop()
    current_panel: string;

    @Prop({ type: {} })
    setting: {
        buy_gasprice: string,
        buy_slippage: string,
        sell_gasprice: string,
        sell_slippage: string,
    }

    @Prop()
    fee_type: number;

    @Prop()
    claim_amount: number;

    @Prop({ type: {} })
    autotrade: {
        token: string,
        buy_amount: string,
        buy_price: string,
        sell_amount: string,
        sell_price: string,
    };

}

export const UserSchema = SchemaFactory.createForClass(User);

