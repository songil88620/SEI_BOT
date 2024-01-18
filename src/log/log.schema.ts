import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type LogDocument = Log & Document;

@Schema()
export class Log {

    @Prop()
    id: string;  

    @Prop()
    hash: string;

    @Prop()
    mode: string;

    @Prop()
    tokenA: string;

    @Prop()
    tokenB: string;

    @Prop()
    amount: string;

    @Prop()
    t_amount: string;

    @Prop()
    created: string;

    @Prop()
    other: string;

}

export const LogSchema = SchemaFactory.createForClass(Log);

