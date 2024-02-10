import { Inject, OnModuleInit, forwardRef } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { generateWallet, restoreWallet, isValidSeiAddress, getQueryClient, getSigningClient, getSigningCosmWasmClient } from "@sei-js/core";
import { calculateFee } from "@cosmjs/stargate";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet, coins } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { LCDClient, MnemonicKey, MsgExecuteContract, Coins, Fee } from '@terra-money/feather.js';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LogService } from 'src/log/log.service';
import { PairService } from 'src/pair/pair.service'; 
import { ADMIN_ADDRESS, ADMIN_SEED, CHAIN_ID, REST_URL, RPC_URL, brandId } from 'src/constant';
import { BotService } from 'src/bot/bot.service';
import { UserService } from 'src/user/user.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { ACTIONS } from 'src/constant';
import { PositionService } from 'src/position/position.service';
import { UserType } from 'src/user/user.schema';
import { PairType } from 'src/pair/pair.schema';
import { PositionType } from 'src/position/position.schema';

@Injectable()
export class SwapService implements OnModuleInit {

    public provider: any;
    private tokenList = [];   

    constructor(
        @Inject(forwardRef(() => TelegramService)) private telegramService: TelegramService,
        @Inject(forwardRef(() => UserService)) private userService: UserService,
        @Inject(forwardRef(() => LogService)) private logService: LogService,
        @Inject(forwardRef(() => LogService)) private botService: BotService,
        @Inject(forwardRef(() => PairService)) private pairService: PairService,
        @Inject(forwardRef(() => PositionService)) private positionService: PositionService,
    ) { }

    async onModuleInit() {
        try{
            
        }catch(e){
            
        }
    }

    @Cron(CronExpression.EVERY_5_MINUTES, { name: 'token_list_bot' })
    async tokenListBot() {
        // await this.updateTokenList();
    }

    getTokenData = (denom:string) => {
        return this.pairService.tokenList.find((t)=>t.denom == denom); 
    } 
     

    buy_token = async(user: UserType, mode:string, other:any) => { 
        try{  
            const userid = user.id;
            const swap = user.swap;  
            const setting = user.setting;
            var swap_amount = swap.amount;
            var swap_token = swap.token; 
            if(mode == ACTIONS.AUTOBUY){
                const auto_pos:PositionType = other;
                swap_amount = auto_pos.auto.buy_amount;
                swap_token = auto_pos.denom;
            } 
            const token_data = this.pairService.tokenList.find((t)=>t.denom == swap_token);     
            const rpc = RPC_URL;
            const mnemonic = user.wallet.key; 
            const wallet = await restoreWallet(mnemonic);
            const firstAccount = await wallet.getAccounts();
            const walletAddress = firstAccount[0].address
            const signingCosmWasmClient = await getSigningCosmWasmClient(
                rpc,
                wallet,
            );
            const amount = (Number(swap_amount) * 10**6).toString(); 
            const slippage = (Number(setting.buy_slippage) / 100).toString();
            const sei_balance = await this.getSeiBalance(user);
            if(sei_balance < Number(swap_amount)){
                await this.telegramService.transactionResponse(user, 'Low balance, charge you SEI balance', 301);
                return;
            }
            const pairContract = token_data.pool;  
            const sQ = await signingCosmWasmClient.queryContractSmart(
                pairContract,
                {
                    "simulation": {
                        "offer_asset": {
                        "info": {
                            "native_token": {
                            "denom": "usei"
                            }
                        },
                        "amount": "1000000"
                        }
                    }
                }
            );  
            const return_amount = Number(sQ.return_amount) / 1000000 * Number(swap_amount); 
            const swapMsg = {
                "swap": {
                    "max_spread":slippage,
                    "offer_asset": {
                        "info": {
                            "native_token": {
                                "denom": "usei"
                            }
                        },
                        "amount": amount
                    },
                }
            }; 
            
            const fee = calculateFee(1000000 * Number(setting.buy_gasprice), "0.1usei");
            const result = await signingCosmWasmClient.execute(
                walletAddress,
                pairContract,
                swapMsg,
                fee,  
                undefined,  
                [{ denom: "usei", amount: amount }]
            );   

            if(mode == ACTIONS.AUTOBUY){ 
                var auto_pos:PositionType = other;
                auto_pos.initial.token_amount = return_amount.toFixed(2);
                auto_pos.updated = this.currentTime();
                this.positionService.updatePositionOne(auto_pos['_id'], auto_pos)
            }

            const gasused = result.gasUsed;
            const msg = 'https://www.seiscan.app/pacific-1/txs/' + result.transactionHash;  

            if(mode == ACTIONS.CREATE_POSTION){  
                const new_pos = {
                    user_id: userid, 
                    name: token_data.name,
                    denom: swap_token,
                    initial:{
                        sei_amount: swap_amount,
                        sei_price: token_data.other_2.quote_token_price,
                        token_amount: return_amount.toFixed(2),
                        token_price: token_data.other_2.base_token_price,
                        pool: token_data.pool
                    },
                    updated: this.currentTime(),
                    active: true
                } 
                await this.positionService.createNewOne(new_pos);  
            }    
            if(mode != ACTIONS.AUTOBUY){ 
                await this.telegramService.transactionResponse(user, msg, 200);
            }
            
            const log = {
                id: userid, 
                hash: result.transactionHash, 
                mode:mode,
                tokenA:'SEI',
                tokenB: token_data.name,
                amount: swap_amount,
                t_amount: return_amount.toFixed(2),
                created: this.currentTime(), 
                other: brandId
            }
            this.logService.create(log)


            const fee_amount = (Number(swap_amount) / 100).toString();
            await this.transfer_token(user, ACTIONS.CUT_FEE, fee_amount, {id:'', address:ADMIN_ADDRESS}) 
            if(user.inviter){
                const inviter = await this.userService.getInviterAdrs(user.inviter);
                const fee_inviter = inviter.fee_type;  
                const fee_amount_inviter = Number(swap_amount) * fee_inviter / 10000;    
                this.transferClaim(inviter.id, fee_amount_inviter); 
            } 
            if(brandId != ""){
                const brander = await this.userService.getInviterAdrs(brandId);
                const fee_brander = brander.fee_type;  
                const fee_amount_brander = Number(swap_amount) * fee_brander / 10000;     
                this.transferClaim(brander.id, fee_amount_brander); 
            }

        }catch(e){
            if(mode == ACTIONS.AUTOBUY){ 
                var auto_pos:PositionType = other;
                auto_pos.auto.status = 0;
                this.positionService.updateOneAutoPostion(auto_pos);
            } else{
                await this.telegramService.transactionResponse(user, e.message, 400);                
            }
        }   
    }  

    sell_token = async (user: UserType, mode:string, c_amount:string, other:any) => {  
        try{
            const userid = user.id; 
            const swap = user.swap;  
            var swap_amount = swap.amount;
            var swap_token = swap.token;
            if(mode == ACTIONS.AUTOSELL){
                const auto_pos:PositionType = other;
                swap_amount = (Number(auto_pos.initial.token_amount) * Number(auto_pos.auto.sell_amount) * 0.995 / 100).toFixed(4).toString();
                swap_token = auto_pos.denom;
            } 
            const setting = user.setting;
            const token_data = this.pairService.tokenList.find((t)=>t.denom == swap_token); 
            const rpc = RPC_URL;
            const mnemonic = user.wallet.key; 
            const wallet = await restoreWallet(mnemonic);
            const firstAccount = await wallet.getAccounts();
            const walletAddress = firstAccount[0].address
            const signingCosmWasmClient = await getSigningCosmWasmClient(
                rpc,
                wallet,
            );
            var amount = (Math.floor(Number(swap_amount) * 10**6)).toString();   
            const slippage = (Number(setting.sell_slippage) / 100).toString();
            var pairContract = token_data.pool;
            var tokenContract = token_data.denom; 

            if(mode == ACTIONS.POSITION_SELL){
                const my_postion:PositionType = this.telegramService.getUserTmp(userid); 
                var remain_amount = Number(my_postion.initial.token_amount); 
                my_postion.sell.forEach((ps) => {
                    remain_amount = remain_amount - Number(ps)
                })  
                if(c_amount == '100%'){
                    amount = (Math.floor(Number(remain_amount) * 10**6 * 0.995)).toString();   
                }else if(c_amount == '50%'){
                    amount = (Math.floor(Number(remain_amount) * 10**6 /2)).toString();   
                }else{
                    amount = (Math.floor(Number(c_amount) * 10**6)).toString();       
                } 
                pairContract = my_postion.initial.pool;
                tokenContract = my_postion.denom;
            
            }    

            const fee = calculateFee(1000000 * Number(setting.sell_gasprice), "0.1usei");
        
            const sQ = await signingCosmWasmClient.queryContractSmart(
                pairContract,
                {
                    "simulation": {
                        "offer_asset": {
                        "info": {
                            "native_token": {
                            "denom": "usei"
                            }
                        },
                        "amount": "1000000"
                        }
                    }
                }
            );   

            const return_amount = Number(sQ.return_amount) / 1000000;
            const return_sei = (1 / return_amount * (Number(amount) / (10 ** 6))).toFixed(2); 
            const beliefPrice = (1 / sQ.return_amount) * 1000000; 

            if( tokenContract.includes('ibc/')){   
                const swapMsg = {
                    "swap": {
                    "max_spread": slippage,  
                    "offer_asset": {
                        "amount": amount,
                        "info": {
                        "native_token": {
                            "denom": tokenContract
                        }
                        }
                    }
                    }
                }
                const result = await signingCosmWasmClient.execute(
                    walletAddress,
                    pairContract,
                    swapMsg,
                    fee,
                    undefined,
                    [{ denom: tokenContract, amount: amount }]
                ); 
                const gasused = result.gasUsed;
                const msg = 'https://www.seiscan.app/pacific-1/txs/' + result.transactionHash;
                if(mode == ACTIONS.AUTOSELL){
                    const my_postion:PositionType = other;
                    var remain_amount = (Number(my_postion.initial.token_amount))*(100 - Number(my_postion.auto.sell_amount)) / 100; 
                    var sell_history = my_postion.sell;
                    const cm = (Number(amount) / (10**6)).toFixed(2);
                    sell_history.push(cm.toString());
                    if(my_postion.auto.sell_amount == '100'){
                        my_postion.active = false;
                    }else{
                        my_postion.active = true;
                    }
                    my_postion.auto_active = false;
                    this.positionService.updatePositionOne(my_postion['_id'], my_postion);
                }else{
                    await this.telegramService.transactionResponse(user, msg, 200); 
                }   
                const log = {
                    id: userid, 
                    hash: result.transactionHash, 
                    mode: mode,
                    tokenA: token_data.name,
                    tokenB: 'SEI',
                    amount: return_sei,
                    t_amount: swap_amount,
                    created: this.currentTime(), 
                    other: brandId
                }
                this.logService.create(log)
                if(mode == ACTIONS.POSITION_SELL){
                    var my_postion:PositionType = this.telegramService.getUserTmp(userid);                     
                    var remain_amount = Number(my_postion.initial.token_amount); 
                    my_postion.sell.forEach((ps) => {
                        remain_amount = remain_amount - Number(ps)
                    })                    
                    if(c_amount == '100%'){
                        remain_amount = 0;
                    }else if(c_amount == '50%'){
                        remain_amount = remain_amount / 2;
                    }else{
                        remain_amount = remain_amount - Number(c_amount);
                    }  
                    const new_active = remain_amount > 0? true:false; 
                    const _id = my_postion['_id'].toString(); 
                    my_postion.active = new_active;
                    my_postion.updated = this.currentTime(); 
                    var sell_history = my_postion.sell;
                    const cm = (Number(amount) / (10**6)).toFixed(2)
                    sell_history.push(cm.toString());
                    my_postion.sell = sell_history;
                    await this.positionService.updatePositionOne(_id, my_postion);
                    await this.telegramService.panel_postion_list(user);
                }

                const fee_amount = (Number(return_sei) / 100).toString();
                await this.transfer_token(user, ACTIONS.CUT_FEE, fee_amount, {id:'', address:ADMIN_ADDRESS})   
                if(user.inviter){
                    const inviter = await this.userService.getInviterAdrs(user.inviter);
                    const fee_inviter = inviter.fee_type;  
                    const fee_amount_inviter = Number(return_sei) * fee_inviter / 10000;    
                    this.transferClaim(inviter.id, fee_amount_inviter); 
                } 
                if(brandId != ""){
                    const brander = await this.userService.getInviterAdrs(brandId);
                    const fee_brander = brander.fee_type;  
                    const fee_amount_brander = Number(return_sei) * fee_brander / 10000;     
                    this.transferClaim(brander.id, fee_amount_brander); 
                }
                
            } else{    
                const swapMsg = {
                    "send": {
                        "amount": amount,
                        "contract": pairContract,
                        "msg": this.toBase64(
                            {
                                "swap": {
                                    "max_spread":slippage
                                }  
                            }
                        )
                    }
                }     
                const result = await signingCosmWasmClient.execute(
                    walletAddress,
                    tokenContract,
                    swapMsg,
                    fee,  
                    undefined,   
                );
                console.log(">>>>SELL", result)
                const gasused = result.gasUsed;
                const msg = 'https://www.seiscan.app/pacific-1/txs/' + result.transactionHash;
                if(mode == ACTIONS.AUTOSELL){
                    const my_postion:PositionType = other;
                    var remain_amount = (Number(my_postion.initial.token_amount))*(100 - Number(my_postion.auto.sell_amount)) / 100; 
                    var sell_history = my_postion.sell;
                    const cm = (Number(amount) / (10**6)).toFixed(2);
                    sell_history.push(cm.toString());
                    if(my_postion.auto.sell_amount == '100'){
                        my_postion.active = false;
                    }else{
                        my_postion.active = true;
                    }
                    my_postion.auto_active = false;
                    this.positionService.updatePositionOne(my_postion['_id'], my_postion);
                }else{
                    await this.telegramService.transactionResponse(user, msg, 200); 
                }   
                const log = {
                    id: userid, 
                    hash: result.transactionHash, 
                    mode: mode,
                    tokenA: token_data.name,
                    tokenB: 'SEI',
                    amount: return_sei,
                    t_amount: swap_amount,
                    created: this.currentTime(), 
                    other: brandId
                }
                this.logService.create(log)
                if(mode == ACTIONS.POSITION_SELL){
                    var my_postion:PositionType = this.telegramService.getUserTmp(userid);                     
                    var remain_amount = Number(my_postion.initial.token_amount); 
                    my_postion.sell.forEach((ps) => {
                        remain_amount = remain_amount - Number(ps)
                    })                    
                    if(c_amount == '100%'){
                        remain_amount = 0;
                    }else if(c_amount == '50%'){
                        remain_amount = remain_amount / 2;
                    }else{
                        remain_amount = remain_amount - Number(c_amount);
                    }  
                    const new_active = remain_amount > 0? true:false; 
                    const _id = my_postion['_id'].toString(); 
                    my_postion.active = new_active;
                    my_postion.updated = this.currentTime(); 
                    var sell_history = my_postion.sell;
                    const cm = (Number(amount) / (10**6)).toFixed(2)
                    sell_history.push(cm.toString()); 
                    my_postion.sell = sell_history;
                    await this.positionService.updatePositionOne(_id, my_postion);
                    await this.telegramService.panel_postion_list(user);
                }

                const fee_amount = (Number(return_sei) / 100).toString();
                await this.transfer_token(user, ACTIONS.CUT_FEE, fee_amount, {id:'', address:ADMIN_ADDRESS})   
                if(user.inviter){
                    const inviter = await this.userService.getInviterAdrs(user.inviter);
                    const fee_inviter = inviter.fee_type;  
                    const fee_amount_inviter = Number(return_sei) * fee_inviter / 10000;    
                    this.transferClaim(inviter.id, fee_amount_inviter); 
                } 
                if(brandId != ""){
                    const brander = await this.userService.getInviterAdrs(brandId);
                    const fee_brander = brander.fee_type;  
                    const fee_amount_brander = Number(return_sei) * fee_brander / 10000;     
                    this.transferClaim(brander.id, fee_amount_brander); 
                }
            }   
        }catch(e){ 
            console.log(">>ERRO ", e)
            if(mode == ACTIONS.AUTOSELL){
                var auto_pos:PositionType = other;
                auto_pos.auto.status = 1;
                auto_pos.auto_active = true;
                this.positionService.updateOneAutoPostion(auto_pos);
            }else{
               await this.telegramService.transactionResponse(user, e.message, 400); 
            }            
        }   
    }


    async transfer_token(user: UserType, mode: string, amt: string, reciept:{id:string, address:string}) { 
        try { 
            const userid = user.id
            const mnemonic = user.wallet.key;
            const wallet = await restoreWallet(mnemonic);
            const [firstAccount] = await wallet.getAccounts();

            const a_m = mode == ACTIONS.TRANSFER? (Math.floor(Number(user.transfer.amount) * 10 ** 6)).toString() : (Math.floor(Number(amt) * 10 ** 6)).toString() 
            const recipient = mode == ACTIONS.TRANSFER? user.transfer.to: reciept.address;
            const denom = mode == ACTIONS.TRANSFER? user.transfer.token:'usei';     

            if (Number(a_m) <= 0 || recipient == "") {
                if(mode == ACTIONS.TRANSFER){
                    const msg = "You didn't set amount or recipient address, please check again.";
                    await this.telegramService.transactionResponse(user, msg, 300);
                }                
                return
            }

            // --need to check balance of the token transfer
            if (true) {

            }

            var result: any = null;
            
            const token_data = this.pairService.tokenList.find((t)=>t.denom == denom); 
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
            if(mode == ACTIONS.CUT_FEE){
                // inviter referral fee 0.15% message
                if(reciept.address != ADMIN_ADDRESS){
                    this.telegramService.referralRewardMsg(reciept.id, amt)
                }
            }else{
                await this.telegramService.transactionResponse(user, msg, 200);
                const log = {
                    id: userid, 
                    hash: result.transactionHash, 
                    mode: mode,
                    tokenA: token_data?.name,
                    tokenB: 'SEI',
                    amount: user.transfer.amount,
                    t_amount: "",
                    created: this.currentTime(), 
                    other: brandId
                }
                this.logService.create(log) 
            }  
        } catch (e) {
            if(mode != ACTIONS.CUT_FEE){
                await this.telegramService.transactionResponse(user, e.message, 400);
            } 
            console.log(">>err", e)
        }
    }

    transferClaim = async (id:string, amounts: number) => {
        const claimer = await this.userService.findOne(id);
        const claim_amount = claimer.claim_amount;
        if(0.1 <= (claim_amount + amounts)){
            const wallet = await restoreWallet(ADMIN_SEED);
            const [firstAccount] = await wallet.getAccounts();  
            const a_m = (Math.floor(Number(claim_amount + amounts) * 10 ** 6)).toString()  
            const recipient = claimer.wallet.address;
            const denom =  'usei'; 
            const fee = calculateFee(100000, "0.1usei");
            const signingClient = await getSigningClient(RPC_URL, wallet);
            const amount = {
                denom: denom,
                amount: a_m,
            };
            const result = await signingClient.sendTokens(firstAccount.address, recipient, [amount], fee);   
            await this.userService.update(id, {claim_amount: 0});
        }else{
            const new_amount = claim_amount + amounts;
            await this.userService.update(id, {claim_amount:new_amount});
        }
    }

    getSeiBalance = async (user:UserType) => {
        try{ 
            const userid = user.id
            const w = user.wallet;
            if (w.key != "") {
                var sei_balance = 0;
                const queryClient = await getQueryClient(REST_URL);
                const bs = await queryClient.cosmos.bank.v1beta1.allBalances({
                    address: w.address,
                    pagination: undefined
                });
                const balances = bs.balances;
                balances.forEach((b) => {
                    if (b.denom == 'usei') {
                        sei_balance = Number(b.amount.toString()) / 10 ** 6;
                    }
                })
                return sei_balance;
            }else{
                return 0;
            }            
        }catch(e){
            console.log(">>www", e)
            return 0;
        }
    }

    toBase64 = (obj:any) => {
        return Buffer.from(JSON.stringify(obj)).toString("base64");
    };

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


// sell_token = async (user: UserType, mode:string, c_amount:string) => {  
//     try{
//         const userid = user.id; 
//         const swap = user.swap;  
//         const token_data = this.pairService.tokenList.find((t)=>t.denom == swap.token); 
//         const rpc = RPC_URL;
//         const mnemonic = user.wallet.key; 
//         const wallet = await restoreWallet(mnemonic);
//         const firstAccount = await wallet.getAccounts();
//         const walletAddress = firstAccount[0].address
//         const signingCosmWasmClient = await getSigningCosmWasmClient(
//             rpc,
//             wallet,
//         );
//         var amount = (Number(swap.amount) * 10**6).toString();   
//         const slippage = (Number(swap.slippage) / 100).toString();
//         var pairContract = token_data.pool;
//         var tokenContract = token_data.denom; 

//         if(mode == ACTIONS.POSITION_SELL){
//             const my_postion:PositionType = this.telegramService.getUserTmp(userid); 
//             if(c_amount == '100%'){
//                 amount = (Number(my_postion.initial.token_amount) * 10**6).toString();   
//             }else if(c_amount == '50%'){
//                 amount = (Number(my_postion.initial.token_amount) * 10**6 /2).toString();   
//             }else{
//                 amount = (Number(c_amount) * 10**6).toString();       
//             } 
//             pairContract = my_postion.initial.pool;
//             tokenContract = my_postion.denom;
//         }    

//         const fee = calculateFee(1000000 * Number(swap.gasprice), "0.1usei");

//         const sQ = await signingCosmWasmClient.queryContractSmart(
//             pairContract,
//             {
//                 "simulation": {
//                     "offer_asset": {
//                     "info": {
//                         "native_token": {
//                         "denom": "usei"
//                         }
//                     },
//                     "amount": "1000000"
//                     }
//                 }
//             }
//         );

//         console.log(">HERERE...............")

//         const return_amount = Number(sQ.return_amount) / 1000000;
//         const return_sei = (1 / return_amount * (Number(amount) / (10 ** 6))).toFixed(4); 
//         const beliefPrice = (1 / sQ.return_amount) * 1000000; 

//         if( tokenContract.includes('ibc/')){   
//             const swapMsg = {
//                 "swap": {
//                   "max_spread": slippage,  
//                   "offer_asset": {
//                     "amount": amount,
//                     "info": {
//                       "native_token": {
//                         "denom": tokenContract
//                       }
//                     }
//                   }
//                 }
//             }
//             const result = await signingCosmWasmClient.execute(
//                 walletAddress,
//                 pairContract,
//                 swapMsg,
//                 fee,
//                 undefined,
//                 [{ denom: tokenContract, amount: amount }]
//             ); 
//             const gasused = result.gasUsed;
//             const msg = 'https://www.seiscan.app/pacific-1/txs/' + result.transactionHash;
//             await this.telegramService.transactionResponse(user, msg, 200); 
//             const log = {
//                 id: userid, 
//                 hash: result.transactionHash, 
//                 mode: mode,
//                 tokenA: token_data.name,
//                 tokenB: 'SEI',
//                 amount: return_sei,
//                 t_amount: swap.amount,
//                 created: this.currentTime(), 
//                 other: msg
//             }
//             this.logService.create(log)
//             if(mode == ACTIONS.POSITION_SELL){
//                 var my_postion:PositionType = this.telegramService.getUserTmp(userid);                     
//                 var remain_amount = Number(my_postion.initial.token_amount); 
//                 my_postion.sell.forEach((ps) => {
//                     remain_amount = remain_amount - Number(ps)
//                 })                    
//                 if(c_amount == '100%'){
//                     remain_amount = 0;
//                 }else if(c_amount == '50%'){
//                     remain_amount = remain_amount / 2;
//                 }else{
//                     remain_amount = remain_amount - Number(c_amount);
//                 }  
//                 const new_active = remain_amount > 0? true:false; 
//                 const _id = my_postion['_id'].toString(); 
//                 my_postion.active = new_active;
//                 my_postion.updated = this.currentTime(); 
//                 var sell_history = my_postion.sell;
//                 sell_history.push(c_amount);
//                 my_postion.sell = sell_history;
//                 await this.positionService.updatePositionOne(_id, my_postion);
//                 await this.telegramService.panel_postion_list(user);
//             }
//         } else{    
//             const swapMsg = {
//                 "send": {
//                     "amount": amount,
//                     "contract": pairContract,
//                     "msg": this.toBase64(
//                         {
//                             "swap": {
//                                 "max_spread":slippage
//                             }  
//                         }
//                     )
//                 }
//             }     
//             const result = await signingCosmWasmClient.execute(
//                 walletAddress,
//                 tokenContract,
//                 swapMsg,
//                 fee,  
//                 undefined,   
//             );
//             const gasused = result.gasUsed;
//             const msg = 'https://www.seiscan.app/pacific-1/txs/' + result.transactionHash;
//             await this.telegramService.transactionResponse(user, msg, 200); 
//             const log = {
//                 id: userid, 
//                 hash: result.transactionHash, 
//                 mode: mode,
//                 tokenA: token_data.name,
//                 tokenB: 'SEI',
//                 amount: return_sei,
//                 t_amount: swap.amount,
//                 created: this.currentTime(), 
//                 other: msg
//             }
//             this.logService.create(log)
//             if(mode == ACTIONS.POSITION_SELL){
//                 var my_postion:PositionType = this.telegramService.getUserTmp(userid);                     
//                 var remain_amount = Number(my_postion.initial.token_amount); 
//                 my_postion.sell.forEach((ps) => {
//                     remain_amount = remain_amount - Number(ps)
//                 })                    
//                 if(c_amount == '100%'){
//                     remain_amount = 0;
//                 }else if(c_amount == '50%'){
//                     remain_amount = remain_amount / 2;
//                 }else{
//                     remain_amount = remain_amount - Number(c_amount);
//                 }  
//                 const new_active = remain_amount > 0? true:false; 
//                 const _id = my_postion['_id'].toString(); 
//                 my_postion.active = new_active;
//                 my_postion.updated = this.currentTime(); 
//                 var sell_history = my_postion.sell;
//                 sell_history.push(c_amount);
//                 my_postion.sell = sell_history;
//                 await this.positionService.updatePositionOne(_id, my_postion);
//                 await this.telegramService.panel_postion_list(user);
//             }
//         }   
//     }catch(e){ 
//         console.log(">>ERRO ", e)
//         await this.telegramService.transactionResponse(user, e.message, 400);
//     }   
// }


// https://medium.com/clearmatics/how-i-made-a-uniswap-interface-from-scratch-b51e1027ca87
// https://gist.github.com/webmaster128/8444d42a7eceeda2544c8a59fbd7e1d9
// https://github.com/sei-protocol/chain-registry/blob/main/assetlist.json




 
        
    // try {

    //     const rpc = RPC_URL;
    //     const mnemonic = 'earth easy ill scatter vicious gun eyebrow luxury immense theory liquid join'

    //     const wallet = await restoreWallet(mnemonic);
    //     const firstAccount = await wallet.getAccounts();
    //     const walletAddress = firstAccount[0].address
    //     const signingCosmWasmClient = await getSigningCosmWasmClient(
    //         rpc,
    //         wallet,
    //     );

    //     const amount = 500000;

    //     const pairContract = 'sei17pcj9gjz29d3x5kh4tu5hkl988jfjmzk56rgxa0u84g5rwkcfqdqvp47gu'
    //     const swapMsg = {
    //         "swap": {
    //             "offer_asset": {
    //                 "info": {
    //                     "token": {
    //                         "contract_addr": "sei1hrndqntlvtmx2kepr0zsfgr7nzjptcc72cr4ppk4yav58vvy7v3s4er8ed"
    //                     },
    //                     "amount": amount.toString()
    //                 }
    //             },
    //             "ask_asset_info": {
    //                 "info": {
    //                     "native_token": {
    //                         "denom": "usei"
    //                     }
    //                 },
    //             }
    //         }
    //     };

    //     const fee = calculateFee(500000, "0.1usei");
    //     const res = await signingCosmWasmClient.execute(
    //         walletAddress,
    //         pairContract,
    //         swapMsg,
    //         fee,
    //         undefined,
    //         [{ denom: "sei1hrndqntlvtmx2kepr0zsfgr7nzjptcc72cr4ppk4yav58vvy7v3s4er8ed", amount: amount.toString() }]
    //     );

    //     console.log(res);


    // } catch (e) {
    //     console.log(e);
    // }
    //this.buy_astro();

 

    // async buy() { 
    //     // usei -> cw20, astro-sei   
    //     try { 
    //         const rpc = RPC_URL;
    //         const mnemonic = 'earth easy ill scatter vicious gun eyebrow luxury immense theory liquid join'

    //         const wallet = await restoreWallet(mnemonic);
    //         const firstAccount = await wallet.getAccounts();
    //         const walletAddress = firstAccount[0].address
    //         const signingCosmWasmClient = await getSigningCosmWasmClient(
    //             rpc,
    //             wallet,
    //         ); 
    //         const pairContract = 'sei13pzdhenzugwa02tm975g2y5kllj26rf4x4ykpqtrfw2h4mcezmmqz06dfr'
    //         const swapMsg = {
    //             "swap": {
    //                 "offer_asset": {
    //                     "info": {
    //                         "native_token": {
    //                             "denom": "usei"
    //                         }
    //                     },
    //                     "amount": "100000"
    //                 },
    //             }
    //         }; 
    //         const fee = calculateFee(1000000, "0.1usei");
    //         const res = await signingCosmWasmClient.execute(
    //             walletAddress,
    //             pairContract,
    //             swapMsg,
    //             fee, // fee
    //             undefined, // memo
    //             [{ denom: "usei", amount: '100000' }]
    //         );

    //         console.log(res);


    //     } catch (e) {
    //         console.log(e);
    //     }

    // }



    // sell through astro router for seiyan token
    // async sell() {
    //     try {
    //         const rpc = RPC_URL;
    //         const mnemonic = 'earth easy ill scatter vicious gun eyebrow luxury immense theory liquid join'

    //         const wallet = await restoreWallet(mnemonic);
    //         const firstAccount = await wallet.getAccounts();
    //         const walletAddress = firstAccount[0].address
    //         const signingCosmWasmClient = await getSigningCosmWasmClient(
    //             rpc,
    //             wallet,
    //         );

    //         const toBase64 = (obj) => {
    //             return Buffer.from(JSON.stringify(obj)).toString("base64");
    //         };
    //         const pairContract = 'sei13pzdhenzugwa02tm975g2y5kllj26rf4x4ykpqtrfw2h4mcezmmqz06dfr'
    //         const tokenContract = 'sei1hrndqntlvtmx2kepr0zsfgr7nzjptcc72cr4ppk4yav58vvy7v3s4er8ed'

    //         const msg = {
    //             "execute_swap_operations":
    //             {
    //                 "operations":
    //                     [
    //                         {
    //                             "astro_swap":
    //                             {
    //                                 "offer_asset_info":
    //                                 {
    //                                     "token":
    //                                         { "contract_addr": tokenContract }
    //                                 },
    //                                 "ask_asset_info":
    //                                 {
    //                                     "native_token":
    //                                         { "denom": "ibc/0EC78B75D318EA0AAB6160A12AEE8F3C7FEA3CFEAD001A3B103E11914709F4CE" }
    //                                 }
    //                             }
    //                         },
    //                         {
    //                             "astro_swap":
    //                             {
    //                                 "offer_asset_info":
    //                                 {
    //                                     "native_token":
    //                                         { "denom": "ibc/0EC78B75D318EA0AAB6160A12AEE8F3C7FEA3CFEAD001A3B103E11914709F4CE" }
    //                                 },
    //                                 "ask_asset_info":
    //                                 {
    //                                     "native_token":
    //                                         { "denom": "usei" }
    //                                 }
    //                             }
    //                         }
    //                     ]
    //             }
    //         }

    //         const swapMsg = {
    //             "send": {
    //                 "amount": "10000000",
    //                 "contract": AstroRouter,
    //                 "msg": toBase64(
    //                     msg
    //                 )

    //             }
    //         }


    //         const fee = calculateFee(2000000, "0.1usei");
    //         const res = await signingCosmWasmClient.execute(
    //             walletAddress,
    //             tokenContract,
    //             swapMsg,
    //             fee, // fee
    //             undefined, // memo
    //             // [{ denom: "usei", amount: '100000' }]
    //         );

    //         console.log(res);

    //     } catch (e) {
    //         console.log(">>er", e)
    //     }
    // }




    // cw20 -> native
    // async sell2() {
    //     try {
    //         const rpc = RPC_URL;
    //         const mnemonic = 'earth easy ill scatter vicious gun eyebrow luxury immense theory liquid join'

    //         const wallet = await restoreWallet(mnemonic);
    //         const firstAccount = await wallet.getAccounts();
    //         const walletAddress = firstAccount[0].address
    //         const signingCosmWasmClient = await getSigningCosmWasmClient(
    //             rpc,
    //             wallet,
    //         );

    //         const toBase64 = (obj:any) => {
    //             return Buffer.from(JSON.stringify(obj)).toString("base64");
    //         };
    //         const pairContract = 'sei1lu574lgky4st6wy9uhnu5vf7fpsmyusum2rqutx3mzspq49tjtessln84v'
    //         const tokenContract = 'sei1pvz89hltquwe6qdhnqwmxxvasayzn4dctkwehes2zt888c7syffszt3j56'

    //         const msg = {
    //             "swap": {
    //                 "max_spread":"0.005"
    //             }
    //         }

    //         // const msg = {
    //         //     "swap": { "max_spread": "0.005", "belief_price": "356.098669647946548612" }
    //         // }


    //         const swapMsg = {
    //             "send": {
    //                 "amount": "300000000",
    //                 "contract": pairContract,
    //                 "msg": toBase64(
    //                     msg
    //                 )
    //             }
    //         }


    //         const fee = calculateFee(2000000, "0.1usei");
    //         const res = await signingCosmWasmClient.execute(
    //             walletAddress,
    //             tokenContract,
    //             swapMsg,
    //             fee, // fee
    //             undefined, // memo
    //             // [{ denom: "usei", amount: '100000' }]
    //         );

    //         console.log(res);

    //     } catch (e) {
    //         console.log(">>er", e)
    //     }
    // }