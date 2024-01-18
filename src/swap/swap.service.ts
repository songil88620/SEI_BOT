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
import { CHAIN_ID, REST_URL, RPC_URL } from 'src/abi/constants';
import { BotService } from 'src/bot/bot.service';
import { UserService } from 'src/user/user.service';
import { TelegramService } from 'src/telegram/telegram.service';

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
    ) { }

    async onModuleInit() {
        try{
            await this.updateTokenList()
        }catch(e){
            
        }
    }

    @Cron(CronExpression.EVERY_5_MINUTES, { name: 'token_list_bot' })
    async tokenListBot() {
        await this.updateTokenList();
    }

    updateTokenList = async () => {
        const all = await this.pairService.findAll();
        const sei = { name: "SEI", denom: "usei", decimal: 6 };
        this.tokenList = [sei, ...all]
    }   

    buy_token = async(userid: string) => {
        try{
            const user = await this.userService.findOne(userid);
            const swap = user.swap;  
            const token_data = this.tokenList.find((t)=>t.denom == swap.token); 
            const rpc = RPC_URL;
            const mnemonic = user.wallet.key; 
            const wallet = await restoreWallet(mnemonic);
            const firstAccount = await wallet.getAccounts();
            const walletAddress = firstAccount[0].address
            const signingCosmWasmClient = await getSigningCosmWasmClient(
                rpc,
                wallet,
            );
            const amount = (Number(swap.amount) * 10**6).toString(); 
            const slippage = (Number(swap.slippage) / 100).toString();
            const sei_balance = await this.getSeiBalance(userid);
            if(sei_balance < Number(swap.amount)){
                await this.telegramService.transactionResponse(userid, 'Low balance, charge you SEI balance', 301);
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
            const return_amount = Number(sQ.return_amount) / 1000000 * Number(swap.amount);

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
            const fee = calculateFee(1000000 * Number(swap.gasprice), "0.1usei");
            const result = await signingCosmWasmClient.execute(
                walletAddress,
                pairContract,
                swapMsg,
                fee,  
                undefined,  
                [{ denom: "usei", amount: amount }]
            ); 
            
            const gasused = result.gasUsed;
            const msg = 'https://www.seiscan.app/pacific-1/txs/' + result.transactionHash;
            await this.telegramService.transactionResponse(userid, msg, 200);
            const log = {
                id: userid, 
                hash: result.transactionHash, 
                mode:'SWAP',
                tokenA:'SEI',
                tokenB: token_data.name,
                amount: swap.amount,
                t_amount: return_amount.toFixed(4),
                created: this.currentTime(), 
                other: msg
            }
            this.logService.create(log)
        }catch(e){
            await this.telegramService.transactionResponse(userid, e.message, 400);
        }   
    }  

    sell_token = async (userid: string) => {
        try{
            const user = await this.userService.findOne(userid);
            const swap = user.swap;  
            const token_data = this.tokenList.find((t)=>t.denom == swap.token); 
            const rpc = RPC_URL;
            const mnemonic = user.wallet.key; 
            const wallet = await restoreWallet(mnemonic);
            const firstAccount = await wallet.getAccounts();
            const walletAddress = firstAccount[0].address
            const signingCosmWasmClient = await getSigningCosmWasmClient(
                rpc,
                wallet,
            );
            const amount = (Number(swap.amount) * 10**6).toString();  
            const slippage = (Number(swap.slippage) / 100).toString();
            const pairContract = token_data.pool;
            const tokenContract = token_data.denom; 
            const fee = calculateFee(1000000 * Number(swap.gasprice), "0.1usei");

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
            const return_sei = (1 / return_amount * Number(swap.amount)).toFixed(4); 
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
                await this.telegramService.transactionResponse(userid, msg, 200); 
                const log = {
                    id: userid, 
                    hash: result.transactionHash, 
                    mode:'SWAP',
                    tokenA: token_data.name,
                    tokenB: 'SEI',
                    amount: return_sei,
                    t_amount: swap.amount,
                    created: this.currentTime(), 
                    other: msg
                }
                this.logService.create(log)
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
                const gasused = result.gasUsed;
                const msg = 'https://www.seiscan.app/pacific-1/txs/' + result.transactionHash;
                await this.telegramService.transactionResponse(userid, msg, 200); 
                const log = {
                    id: userid, 
                    hash: result.transactionHash, 
                    mode:'SWAP',
                    tokenA: token_data.name,
                    tokenB: 'SEI',
                    amount: return_sei,
                    t_amount: swap.amount,
                    created: this.currentTime(), 
                    other: msg
                }
                this.logService.create(log)
            }   
        }catch(e){ 
            await this.telegramService.transactionResponse(userid, e.message, 400);
        }   
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

            // --need to check balance of the token transfer
            if (true) {

            }

            var result: any = null;
            const denom = user.transfer.token;
            const token_data = this.tokenList.find((t)=>t.denom == denom); 
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
            const log = {
                id: userid, 
                hash: result.transactionHash, 
                mode:'TRANS',
                tokenA: token_data.name,
                tokenB: 'SEI',
                amount: user.transfer.amount,
                t_amount: "",
                created: this.currentTime(), 
                other: msg
            }
            this.logService.create(log) 
        } catch (e) {
            await this.telegramService.transactionResponse(userid, e.message, 400);
            console.log(">>err", e)
        }
    }

    getSeiBalance = async (userid:string) => {
        try{
            const user = await this.userService.findOne(userid);
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