import { Inject, OnModuleInit, forwardRef } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { LogService } from 'src/log/log.service';
import axios from 'axios';
import { BotService } from 'src/bot/bot.service';
import { generateWallet, restoreWallet, isValidSeiAddress, getQueryClient, getSigningClient, getSigningCosmWasmClient } from "@sei-js/core";
import { calculateFee } from "@cosmjs/stargate";
import { RPC_URL } from 'src/abi/constants';


@Injectable()
export class SwapService implements OnModuleInit {

    public provider: any;

    constructor(
        @Inject(forwardRef(() => TelegramService)) private telegramService: TelegramService,
        @Inject(forwardRef(() => UserService)) private userService: UserService,
        @Inject(forwardRef(() => LogService)) private logService: LogService,
        @Inject(forwardRef(() => LogService)) private botService: BotService,
    ) { }

    async onModuleInit() {
        // const mnemonic = ' ';
        // const wallet = await restoreWallet(mnemonic); 
        // const [firstAccount] = await wallet.getAccounts(); 
        // const fee = calculateFee(200000, "0.1usei");   
        // const signingClient = await getSigningCosmWasmClient(RPC_URL, wallet); 
        // const queryMsg = {
        //     "transfer": {
        //         "amount": "1000000",
        //         "recipient": "sei1vnxdhlue2egnfxvglfqzxpzky4frjatsele6fn"
        //     }
        // }
        // const queryResponse = await signingClient.execute(firstAccount.address, 'sei1hrndqntlvtmx2kepr0zsfgr7nzjptcc72cr4ppk4yav58vvy7v3s4er8ed', queryMsg, fee);
        // console.log(">>>RES", queryResponse)
    }


    async transfer_token(userid: string) {
        try {
            const user = await this.userService.findOne(userid);
            const mnemonic = user.wallet.key;
            const wallet = await restoreWallet(mnemonic);
            const [firstAccount] = await wallet.getAccounts();

            const a_m = (Number(user.transfer.amount) * 10 ** 6).toString();
            const recipient = user.transfer.to;

            if (Number(a_m) <= 0 || recipient == "") {
                const msg = "You didn't set amount or recipient address, please check again.";
                await this.telegramService.transactionResponse(userid, msg, 300);
                return
            }

            var result: any = null;
            const denom = user.transfer.token;
            if (denom.slice(0, 3) == 'sei') {
                const fee = calculateFee(200000, "0.1usei");
                const signingClient = await getSigningCosmWasmClient(RPC_URL, wallet);
                const query = {
                    transfer: {
                        amount: a_m,
                        recipient: recipient
                    }
                }
                result = await signingClient.execute(firstAccount.address, denom, query, fee);
            } else if (denom.slice(0, 3) == 'fac') {

            } else {
                const fee = calculateFee(100000, "0.1usei");
                const signingClient = await getSigningClient(RPC_URL, wallet);
                const amount = {
                    denom: denom,
                    amount: a_m,
                };
                result = await signingClient.sendTokens(firstAccount.address, recipient, [amount], fee);
            }
            const gasused = result.gasUsed;
            const msg = 'https://www.seiscan.app/pacific-1/txs/' + result.transactionHash;
            await this.telegramService.transactionResponse(userid, msg, 200);
            console.log(">>>>ACs", result)
        } catch (e) {
            console.log(">>err", e)
        }
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

}


// https://medium.com/clearmatics/how-i-made-a-uniswap-interface-from-scratch-b51e1027ca87
// https://gist.github.com/webmaster128/8444d42a7eceeda2544c8a59fbd7e1d9
// https://github.com/sei-protocol/chain-registry/blob/main/assetlist.json