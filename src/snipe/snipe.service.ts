import { Inject, OnModuleInit, forwardRef } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { UserService } from 'src/user/user.service'; 
import { SwapService } from 'src/swap/swap.service'; 
import { Cron, CronExpression } from '@nestjs/schedule';
import { BotService } from 'src/bot/bot.service';
 


@Injectable()
export class SnipeService implements OnModuleInit {

    private provider: any;
    private watchList: string[];
    private sellList: string[];

    constructor(
        @Inject(forwardRef(() => UserService)) private userService: UserService,
        @Inject(forwardRef(() => SwapService)) private swapService: SwapService, 
        @Inject(forwardRef(() => BotService)) private botService: BotService,
    ) {
        this.watchList = [];
        this.sellList = [];
    }

    async onModuleInit() {
        try {
            console.log(">>>snipe module init")
            this.provider = this.swapService.provider;
             

        } catch (e) {
            console.log("Err", e)
        }
    }

   
    async watchContract() {
        console.log("watch....")
        try {
             
        } catch (e) {
            console.log("err", e)
        }
    }

    async updateWatchList(address: string, mode: string) {
         
    }

    async updateSellList(address: string, mode: string, from: number) {
         
    }

 
    @Cron(CronExpression.EVERY_MINUTE, { name: 'sell_bot' })
    async sellBot() {
         
    }

    async listenMethods(contractAddress: string, owner: string, methodId: string, userid: string) {
        
    } 
    



}


