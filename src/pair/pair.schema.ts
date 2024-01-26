import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export interface PairType{
    id: string,
    type: string,
    price: string,
    pool: string,
    denom: string,
    name: string,
    decimal: string,
    trx_h1: number,
    trx_h24: number;  
    other_1: {
        vol_h1: string,
        vol_h24: string,
        pch_h1: string,
        pch_h24: string
    },
    other_2: {
        base_token_price:string,
        quote_token_price:string, 
        price: string,
        liquidity: string,
        cap: string,
        p_ch_h1: string,
        p_ch_h24: string
    },
    updated: string; 
}


export type PairDocument = Pair & Document;

@Schema()
export class Pair {

    @Prop()
    id: string;

    @Prop()
    type: string;

    @Prop()
    price: string;

    @Prop()
    pool: string;

    @Prop()
    denom: string;

    @Prop()
    name: string;

    @Prop()
    decimal: string;

    @Prop()
    trx_h1: number;

    @Prop()
    trx_h24: number;

    @Prop({ type: {} })
    other_1: {
        vol_h1: string,
        vol_h24: string,
        pch_h1: string,
        pch_h24: string
    };

    @Prop({ type:{}})
    other_2: {
        base_token_price:string,
        quote_token_price:string, 
        price: string,
        liquidity: string,
        cap: string,
        p_ch_h1: string,
        p_ch_h24: string
    };

    @Prop()
    updated: string; 

}

export const PairSchema = SchemaFactory.createForClass(Pair);

