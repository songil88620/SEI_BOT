import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

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

    @Prop()
    other_2: string;

}

export const PairSchema = SchemaFactory.createForClass(Pair);

