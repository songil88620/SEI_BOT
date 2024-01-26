import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";


export interface PositionType {
    user_id: string,
    name: string,
    denom: string,
    initial: {
        sei_amount: string,
        sei_price: string,
        token_amount: string,
        token_price: string,
        pool: string,
    },
    updated: string,
    active: boolean
}



export type PositionDocument = Position & Document;

@Schema()
export class Position {

    @Prop()
    user_id: string;

    @Prop()
    name: string;

    @Prop()
    denom: string;

    @Prop({ type: {} })
    initial: {
        sei_amount: string,
        sei_price: string,
        token_amount: string,
        token_price: string,
        pool: string,
    };

    @Prop()
    updated: string;

    @Prop()
    active: boolean;

}

export const PostionSchema = SchemaFactory.createForClass(Position);

