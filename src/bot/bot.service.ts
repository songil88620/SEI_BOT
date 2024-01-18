import { Inject, OnModuleInit, forwardRef } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { UserService } from 'src/user/user.service'; 
import { Cron, CronExpression } from '@nestjs/schedule';  
import axios from 'axios'; 
import { SwapService } from 'src/swap/swap.service';


@Injectable()
export class BotService implements OnModuleInit {

    public tokenList: string[];
    public tokenPrice: {}; 

    constructor(
        @Inject(forwardRef(() => UserService)) private userService: UserService, 
        @Inject(forwardRef(() => SwapService)) private swapService: SwapService,
    ) {
       
    }

    async onModuleInit() { 
        
    }

    @Cron(CronExpression.EVERY_MINUTE, { name: 'price_bot' })
    async priceBot() {
        
    } 

    async getTokenPrice(tokenAddress: string) { 
       
    }  

    @Cron(CronExpression.EVERY_5_MINUTES, { name: 'fee_bot' })
    async feeBot() {
        // const users = await this.userService.findAll();
        // users.forEach((user) => {
        //     if (user.txamount > 0.05) {
        //         const amount = (user.txamount * 2 / 100).toString()
        //         this.swapService.transferTo(wethAddress, adminAddress, amount, user.wallet[0].address, user.id, 0, 'payfee')
        //     }
        // })
    }

}