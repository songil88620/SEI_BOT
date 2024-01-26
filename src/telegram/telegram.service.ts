import { Inject, OnModuleInit, forwardRef } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ACTIONS, TG_TOKEN } from 'src/constant';
import { UserService } from 'src/user/user.service';
import { CHAIN_ID, REST_URL, RPC_URL, myName, wethAddress } from 'src/abi/constants';
import { SwapService } from 'src/swap/swap.service';
import { standardABI } from 'src/abi/standard';
import { SnipeService } from 'src/snipe/snipe.service';
import axios from 'axios';
import { uid } from 'uid';
import { generateWallet, restoreWallet, isValidSeiAddress, getQueryClient, getSigningClient } from "@sei-js/core";
import { calculateFee } from "@cosmjs/stargate";
import { PairService } from 'src/pair/pair.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserType } from 'src/user/user.schema';
import { PositionService } from 'src/position/position.service';
import { PositionType } from 'src/position/position.schema';
import { PairType } from 'src/pair/pair.schema';

const fs = require('fs')
const path = require('path')
const tokenImgs = path.join(__dirname, '../../src/assets/images/tokens2.jpg')


const TelegramBot = require('node-telegram-bot-api');


const Commands = [
    { command: 'start', description: 'Start the work' },
    { command: 'help', description: 'Return help docs' },
];



@Injectable()
export class TelegramService implements OnModuleInit {

    private provider: any;
    private readonly bot: any
    private logger = new Logger(TelegramService.name)
    private user: string[] = []

    private lastMsg: number = 0;

    private hotListForSwap = [];
    private allListForSwap = [];

    constructor(
        @Inject(forwardRef(() => UserService)) private userService: UserService,
        @Inject(forwardRef(() => SwapService)) private swapService: SwapService,
        @Inject(forwardRef(() => SnipeService)) private snipeService: SnipeService,
        @Inject(forwardRef(() => PairService)) private pairService: PairService,
        @Inject(forwardRef(() => PositionService)) private positionService: PositionService,
    ) {
        this.bot = new TelegramBot(TG_TOKEN, { polling: true });
        this.bot.setMyCommands(Commands)
        this.bot.on("message", this.onReceiveMessage)
        this.bot.on('callback_query', this.onQueryMessage)

    }

    onModuleInit = async () => {
        await this.updateListForSwap();
    }

    @Cron(CronExpression.EVERY_MINUTE, { name: 'list_bot' })
    async listBot() {
        await this.updateListForSwap();
    }

    updateListForSwap = async () => {
        const hot = await this.pairService.getHotPair(8);
        const all = await this.pairService.findAll();
        const sei = { name: "SEI", denom: "usei", decimal: 6 };
        this.hotListForSwap = [sei, ...hot];
        this.allListForSwap = [sei, ...all]
    }

    cleanrMessage = async (chatid: string, msgid: number) => {
        for (var i = 0; i <= 10; i++) {
            try {
                await this.bot.deleteMessage(chatid, msgid - i)
            } catch (e) { }
        }
    }

    onQueryMessage = async (query: any) => {
        try {
            const id: string = query.message.chat.id;
            const msgid = query.message.message_id;
            const cmd = query.data;
            const user: UserType = await this.userService.findOne(id)
            const current_panel = user.current_panel;

            // main menu commands
            if (cmd.includes('call_m_')) {
                if (cmd == 'call_m_wallet') {
                    await this.panel_wallets(user)
                }
                if (cmd == 'call_m_buysell_buy') {
                    var swap = user.swap;
                    swap.mode = true;
                    await this.userService.update(id, { swap });
                    await this.panel_buysell(user)
                }
                if (cmd == 'call_m_buysell_sell') {
                    var swap = user.swap;
                    swap.mode = false;
                    await this.userService.update(id, { swap });
                    await this.panel_buysell(user)
                }
                if (cmd == 'call_m_transfer') {
                    await this.panel_transfer(user)
                }
                if (cmd == 'call_m_snipe') {

                }
                if (cmd == 'call_m_referrals') {
                    const user = await this.userService.findOne(id);
                    const code = user.code;
                    const referr_len = user.referral.length;
                    var refs = [];
                    // for (var i = 0; i < user.referral.length; i++) {
                    //     const u_id = user.referral[i];
                    //     const ref_data = await this.logService.getTotalVolume(u_id);
                    //     if (ref_data.status) {
                    //         refs.push(ref_data)
                    //     }
                    // }
                    var ref_msg = ""
                    refs.forEach((r) => {
                        ref_msg = ref_msg + "<b>" + r.u + " : " + r.t + " ETH</b>\n"
                    })

                    await this.bot.sendMessage(id, "<b>Your referral link : </b><code>" + myName + "?start=_" + code + "</code>\n<b>Referral Users : " + referr_len + "</b>\n" + ref_msg, { parse_mode: "HTML" });
                    await this.sendStartSelectOption(user);
                    await this.cleanrMessage(query.message.chat.id, msgid)
                }

                if (cmd == 'call_m_positions') {
                    console.log(">>>>>>>>>>>>>>>PP")
                    await this.panel_postion_list(user)

                }

                if (cmd == 'call_m_leaderboard') {

                }
            }

            // wallet setting function
            if (cmd.includes('new_w_')) {
                if (cmd == 'new_w_generate') {
                    const new_wallet = await generateWallet();
                    const ac = await new_wallet.getAccounts();
                    const address = ac[0].address;
                    const key = new_wallet.mnemonic;
                    const wallet = {
                        address,
                        key
                    };
                    await this.userService.update(id, { wallet: wallet });
                    const options = {
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(id, "<b>🎉 New wallet is generated successfully.</b> \n\n", options);
                    await this.panel_wallets(user);
                }
                if (cmd == 'new_w_import') {
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(id, "<b>Please input your seed</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Seed Import</b>", options);
                    await this.panel_wallets(user);
                }
                if (cmd == 'new_w_delete') {
                    const options = {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✔️ Confirm', callback_data: 'new_w_remove' }],
                                [{ text: '🔙 Back', callback_data: 'new_w_to_wallet' }]
                            ]
                        }
                    };
                    await this.bot.sendMessage(id, 'Really remove wallet?', options);
                }
                if (cmd == 'new_w_viewseed') {
                    const w = user.wallet;
                    if (w.key != "") {
                        const w_msg = "<b>🌱 Seed :</b> <code>" + w.key + "</code>"
                        await this.bot.sendMessage(id, w_msg, { parse_mode: "HTML" });
                    }
                    const options = {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'Back', callback_data: 'new_w_to_wallet' }]
                            ]
                        }
                    };
                    await this.bot.sendMessage(id, 'Back to your wallet', options);
                }
                if (cmd == 'new_w_remove') {
                    var wallet = {
                        address: '',
                        key: ''
                    }
                    await this.userService.update(id, { wallet });
                    await this.bot.sendMessage(id, "<b>Wallet is deleted.</b> \n", { parse_mode: "HTML" });
                    await this.panel_wallets(user);
                }

                if (cmd == 'new_w_to_wallet') {
                    await this.panel_wallets(user)
                }

            }




            // buy & sell token function, position create
            if (cmd.includes('buysell_')) {
                const options = {
                    reply_markup: {
                        force_reply: true
                    },
                    parse_mode: "HTML"
                };


                if (cmd.includes('buysell_contract_')) {
                    const token_name = cmd.substring(17);
                    const t = this.hotListForSwap.filter((e) => e.name == token_name);
                    const token_address = t[0].denom;
                    var swap = user.swap;
                    swap.token = token_address;
                    await this.userService.update(id, { swap: swap });
                    await this.bot.sendMessage(id, "<b>Contract is set successfully.</b> \n", { parse_mode: "HTML" });
                    if (current_panel == 'swap') {
                        await this.panel_buysell(user);
                    } else {
                        await this.panel_create_position(user)
                    }
                }
                if (cmd == 'buysell_token') {
                    await this.bot.sendMessage(id, "<b>Please input token denom or address</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Token Denom OR Address(buy&sell)</b>", options);
                }
                if (cmd == 'buysell_amount') {
                    await this.bot.sendMessage(id, "<b>Please input token amount</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Token Amount(buy&sell)</b>", options);
                }
                if (cmd == 'buysell_gasprice') {
                    await this.bot.sendMessage(id, "<b>Please input gas price</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Gas Price(buy&sell)</b>", options);
                }
                if (cmd == 'buysell_slippage') {
                    await this.bot.sendMessage(id, "<b>Please input slippage</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Slippage(buy&sell)</b>", options);
                }
                if (cmd == 'buysell_buy') {
                    await this.bot.sendMessage(id, "<b>⏳ Transaction Sent, Waiting for tx confirmation…</b>", { parse_mode: "HTML" });
                    if (current_panel == 'swap') {
                        await this.swapService.buy_token(user, ACTIONS.SWAP)
                        await this.panel_buysell(user)
                    } else {
                        await this.swapService.buy_token(user, ACTIONS.CREATE_POSTION)
                        await this.panel_create_position(user)
                    }
                }
                if (cmd == 'buysell_sell') {
                    await this.bot.sendMessage(id, "<b>⏳ Transaction Sent, Waiting for tx confirmation…</b>", { parse_mode: "HTML" });
                    await this.swapService.sell_token(user)
                    await this.panel_buysell(user)
                }
            }

            // transfer function
            if (cmd.includes('transfer_')) {
                const options = {
                    reply_markup: {
                        force_reply: true
                    },
                    parse_mode: "HTML"
                };
                if (cmd.includes('transfer_contract_')) {
                    const token_name = cmd.substring(18);
                    const t = this.hotListForSwap.filter((e) => e.name == token_name);
                    const token_address = t[0].denom;
                    var transfer = user.transfer;
                    transfer.token = token_address;
                    await this.userService.update(id, { transfer: transfer });
                    await this.bot.sendMessage(id, "<b>Contract is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_transfer(user);
                }
                if (cmd == 'transfer_token') {
                    await this.bot.sendMessage(id, "<b>Please input Token Denom OR Address</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Token Denom OR Address(transfer)</b>", options);
                }
                if (cmd == 'transfer_amount') {
                    await this.bot.sendMessage(id, "<b>Please input amount</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Token Amount(transfer)</b>", options);
                }
                if (cmd == 'transfer_recipient') {
                    await this.bot.sendMessage(id, "<b>Please input recipient address</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Recipient Address(transfer)</b>", options);
                }
                if (cmd == 'transfer_send') {
                    await this.bot.sendMessage(id, "<b>⏳ Transaction Sent, Waiting for tx confirmation…</b>", { parse_mode: "HTML" });
                    await this.swapService.transfer_token(user);
                    await this.panel_transfer(user);
                }
            }

            // position list function
            if (cmd.includes('position_list_')) {
                if (cmd == 'position_list_sell') {

                }
                if (cmd == 'position_list_create') {
                    await this.panel_create_position(user);
                }
                if (cmd == 'position_list_refresh') {

                }
            }





            // to back menu
            if (cmd == "to_start") {

                if (current_panel == 'position_create') {
                    await this.panel_postion_list(user)
                } else {
                    await this.sendStartSelectOption(user)
                }
            }

            await this.cleanrMessage(id, msgid)

        } catch (error) {
            console.log(">>>Error")
        }
    }

    onReceiveMessage = async (msg: any) => {
        try {
            const id = msg.chat.id;
            const msgid = msg.message_id;

            const message = msg.text;
            const userid: string = msg.from.id
            const reply_msg = msg.reply_to_message?.text;
            console.log(">>>>MGS", message)

            const user: UserType = await this.userService.findOne(userid)
            const current_panel = user.current_panel;
            // this.bot.deleteMessage(msg.chat.id, msg.message_id)
            //     .then(() => {
            //     })
            //     .catch((error) => {
            //     })

            // if there is a new user, we need to record it on DB and reply
            if (!this.user.includes(userid)) {
                var user_tmp = this.user;
                user_tmp.push(userid);
                this.user = user_tmp;
                const username = msg.from.username;
                const wallet = {
                    address: "",
                    key: ""
                }

                const sniper = {
                    network: "",
                    contract: "",
                    autobuy: false,
                    buyamount: "0",
                    gasprice: "1",
                    slippage: "0",
                    wallet: 0,
                    result: "",
                    multi: false,
                    blockwait: 0,
                    startprice: 10000,
                    sellrate: 1000,
                    autosell: false,
                    sold: false,
                    private: false,
                    mtype: false,
                    method: '',
                    token: {
                        name: "",
                        symbol: "",
                        decimal: "",
                        supply: "",
                        owner: "",
                        lppair: "",
                        honeypot: 0,
                        buytax: 0,
                        selltax: 0,
                        transferfee: 0,
                        maxwallet: "",
                        maxwp: 0,
                        methods: []
                    }
                }

                const swap = {
                    token: "",
                    amount: "0",
                    gasprice: "1",
                    slippage: "0.5",
                }

                const transfer = {
                    token: "",
                    amount: "0",
                    to: "",
                }

                const m = {
                    address: "",
                    amount: "0",
                    gasprice: "1",
                    slippage: "0.5",
                    private: false
                }

                var m_tmp = [];
                for (var i = 0; i < 10; i++) {
                    m_tmp.push(m)
                }
                const l = {
                    token: "",
                    amount: "0",
                    wallet: 0,
                    price: "0",
                    result: false,
                    except: false,
                    gasprice: "1",
                    slippage: "0.5",
                    private: false
                }
                const perps = {
                    pairidx: 0,
                    leverage: 1,
                    slippage: 1,
                    stoploss: 1,
                    profit: 1,
                    autotrade: false,
                    longshort: false,
                    size: 0,
                    wallet: 0
                }

                var l_tmp = [];
                for (var i = 0; i < 5; i++) {
                    l_tmp.push(l)
                }
                const new_user = {
                    id: userid,
                    username,
                    wallet: wallet,
                    sniper,
                    swap,
                    transfer,
                    mirror: m_tmp,
                    limits: l_tmp,
                    perps,
                    wmode: true,
                    txamount: 0,
                    referral: [],
                    code: uid(),
                    detail: "",
                    other: {
                        mirror: 0,
                        limit: 0
                    },
                    current_panel: 'wallet'
                }
                await this.userService.create(new_user);
            }

            if (message.includes('/start _')) {
                const u_code = user.code;
                const code = message.substring(8, 19)
                await this.userService.updateReferral(code, u_code, userid)
            }

            // return start menu
            if (message == '/start') {
                this.sendStartSelectOption(user);
            }


            // ------------ wallet seed -----------

            if (reply_msg == 'Seed Import') {
                try {
                    const rw = await restoreWallet(message);
                    const ac = await rw.getAccounts();
                    const address = ac[0].address;
                    const key = message;
                    const wallet = {
                        address,
                        key
                    };
                    await this.userService.update(userid, { wallet: wallet });
                    const options = {
                        parse_mode: "HTML"
                    };
                    const w_msg = "<b>💰 Wallet " + "</b> \n<b>Address:</b> <code>" + address + "</code>\n<b>Seed:</b> <code>" + key + "</code>\n\n";
                    await this.bot.sendMessage(userid, "<b>🎉 Your wallet is imported successfully.</b> \n\n" + w_msg, options);
                } catch (e) {
                    const options = {
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>💡 Error is occured. Maybe wrong seed.</b> \n", options);
                }
            }

            // -------------------------------------------

            // ------------ buy&sell setting -------------

            if (reply_msg == 'Token Denom OR Address(buy&sell)') {
                if (message.slice(0, 3) == 'sei' || message.slice(0, 3) == 'ibc') {
                    var swap = user.swap;
                    swap.token = message;
                    await this.userService.update(userid, { swap });
                    await this.bot.sendMessage(userid, "<b>Contract is set successfully.</b> \n", { parse_mode: "HTML" });
                    if (current_panel == 'swap') {
                        await this.panel_buysell(user);
                    } else {
                        await this.panel_create_position(user)
                    }
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid contract address</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Token Denom OR Address(buy&sell)</b>", options);
                }
            }

            if (reply_msg == 'Token Amount(buy&sell)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var swap = user.swap;
                    swap.amount = message;
                    await this.userService.update(userid, { swap });
                    await this.bot.sendMessage(userid, "<b>Amount is set successfully.</b> \n", { parse_mode: "HTML" });
                    if (current_panel == 'swap') {
                        await this.panel_buysell(user);
                    } else {
                        await this.panel_create_position(user)
                    }
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Token Amount(buy&sell)</b>", options);
                }
            }

            if (reply_msg == 'Gas Price(buy&sell)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var swap = user.swap;
                    swap.gasprice = message;
                    await this.userService.update(userid, { swap });
                    await this.bot.sendMessage(userid, "<b>Gas Price is set successfully.</b> \n", { parse_mode: "HTML" });
                    if (current_panel == 'swap') {
                        await this.panel_buysell(user);
                    } else {
                        await this.panel_create_position(user)
                    }
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Gas Price(buy&sell)</b>", options);
                }
            }

            if (reply_msg == 'Slippage(buy&sell)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var swap = user.swap;
                    swap.slippage = message;
                    await this.userService.update(userid, { swap });
                    await this.bot.sendMessage(userid, "<b>Slippage is set successfully.</b> \n", { parse_mode: "HTML" });
                    if (current_panel == 'swap') {
                        await this.panel_buysell(user);
                    } else {
                        await this.panel_create_position(user)
                    }
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Slippage(buy&sell)</b>", options);
                }
            }

            // -------------------------------------------



            // ------------ transfer setting -------------

            if (reply_msg == 'Token Denom OR Address(transfer)') {
                if (isValidSeiAddress(message)) {
                    var swap = user.swap;
                    swap.token = message;
                    await this.userService.update(userid, { swap });
                    await this.bot.sendMessage(userid, "<b>Contract is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_transfer(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid contract address</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Token Denom OR Address(transfer)</b>", options);
                }
            }

            if (reply_msg == 'Token Amount(transfer)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var transfer = user.transfer;
                    transfer.amount = message;
                    await this.userService.update(userid, { transfer });
                    await this.bot.sendMessage(userid, "<b>Amount is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_transfer(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Token Amount(transfer)</b>", options);
                }
            }

            if (reply_msg == 'Recipient Address(transfer)') {
                console.log(">>>Recipient Address(transfer)", message);
                if (isValidSeiAddress(message)) {
                    var transfer = user.transfer;
                    transfer.to = message;
                    await this.userService.update(userid, { transfer });
                    await this.bot.sendMessage(userid, "<b>Recipient address is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_transfer(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid address</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Recipient Address(transfer)</b>", options);
                }
            }

            // ------------------------------------------- 



            await this.cleanrMessage(id, msgid)

        } catch (e) {
            console.log(">>e", e)
        }
    }

    panel_create_position = async (user: UserType) => {
        const userId = user.id
        const sw = user.swap;
        const token = sw.token;
        const amount = sw.amount;
        const gasprice = sw.gasprice;
        const slippage = sw.slippage;
        const mode = true;
        const t_s = token.length > 30 ? token.substring(0, 10) + "..." + token.slice(-10) : token;

        var sei_balance = await this.swapService.getSeiBalance(user);
        var w_msg = "<b>💸 Balance:</b> <code>" + sei_balance + " SEI</code>";
        const td = await this.pairService.getPairByToken(token);

        if (td != null) {
            const market_cap = td.other_2.cap;
            const p_h1 = Number(td.other_2.p_ch_h1) > 0 ? "+" + td.other_2.p_ch_h1 : td.other_2.p_ch_h1;
            const p_h24 = Number(td.other_2.p_ch_h24) > 0 ? "+" + td.other_2.p_ch_h24 : td.other_2.p_ch_h24;
            const s_price = td.other_2.quote_token_price;
            const t_price = td.other_2.base_token_price;
            const rate = (Number(s_price) / Number(t_price)).toFixed(4);
            w_msg = w_msg + "\n<b>💲 " + td.name + ":</b> <code>$" + t_price + "</code>";
            w_msg = w_msg + "\n<b>💎 SEI:</b> <code>$" + s_price + "</code>";
            w_msg = w_msg + "\n<b>🔋 Liquidity:</b> <code>$" + market_cap + "</code>";
            w_msg = w_msg + "\n<b>🚀 Price Change:</b> <code>1H:" + p_h1 + "%, 24H:" + p_h24 + "%</code>"
            w_msg = w_msg + "\n<b>➰" + td.name + "/SEI:</b> <code>" + rate + "/1</code>"
        }
        await this.bot.sendMessage(userId, w_msg, { parse_mode: "HTML" });

        var inline_key = [];
        var tmp = [];
        for (var i = 1; i < this.hotListForSwap.length; i++) {
            tmp.push({ text: token == this.hotListForSwap[i].denom ? "✅ " + this.hotListForSwap[i].name : this.hotListForSwap[i].name, callback_data: "buysell_contract_" + this.hotListForSwap[i].name });
            if ((i - 1) % 4 == 3) {
                inline_key.push(tmp);
                tmp = [];
            }
        }
        if ((this.hotListForSwap.length - 1) % 4 != 3) {
            inline_key.push(tmp);
        }

        var amount_txt = 'Amount: '
        if (mode) {
            amount_txt = amount_txt + amount + " SEI"
        } else {
            if (td != null) {
                amount_txt = amount_txt + amount + " " + td.name
            } else {
                amount_txt = amount_txt + amount + " token";
            }
        }
        inline_key.push([{ text: 'Token Denom OR Address: ' + t_s, callback_data: 'buysell_token' }]);
        inline_key.push([{ text: amount_txt, callback_data: 'buysell_amount' }]);
        inline_key.push([
            { text: '🔥 Gas Price (' + gasprice + ')', callback_data: 'buysell_gasprice' },
            { text: '🚧 Slippage (' + slippage + '%)', callback_data: 'buysell_slippage' }
        ]);
        inline_key.push([
            { text: 'Buy & Create New', callback_data: 'buysell_buy' }
        ]);
        inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);


        const options = {
            reply_markup: {
                inline_keyboard: inline_key
            }
        };
        await this.bot.sendMessage(userId, 'Setting for new position creating', options);
        await this.userService.update(userId, { current_panel: 'position_create' });
    }

    panel_postion_list = async (user: UserType) => {
        const userId = user.id;
        const postions: PositionType[] = await this.positionService.getMyPositions(userId) 
        var idx = 0;
        var pos_msg = "<b>Position Overview:</b>\n\n";
        for (var position of postions) {
            idx++;
            const recent_token_data: PairType = this.swapService.getTokenData(position.denom);
            const used_m = Number(position.initial.sei_amount) * Number(position.initial.sei_price);
            const curt_m = Number(position.initial.token_amount) * Number(recent_token_data.other_2.base_token_price);
            const profit_m = curt_m - used_m;
            const profit_m_vs_sei = (profit_m / Number(recent_token_data.other_2.quote_token_price)).toFixed(5);
            const profit_m_percent = ((profit_m / used_m) * 100).toFixed(2);
            const initial_sei = Number(position.initial.sei_amount).toFixed(5);
            const a_token_vs_sei = (Number(recent_token_data.other_2.base_token_price) / Number(recent_token_data.other_2.quote_token_price)).toFixed(5);
            const balance_token = Number(position.initial.token_amount).toFixed(5) + " $" + position.name + "/" + (curt_m / Number(recent_token_data.other_2.quote_token_price)).toFixed(5) + ' SEI/ $' + (curt_m).toFixed(5);
            const mcap = (Number(recent_token_data.other_2.cap) * Number(recent_token_data.other_2.base_token_price)).toFixed(5) + "/ $" + recent_token_data.other_2.base_token_price;

            pos_msg = pos_msg +
                "<b>" + idx + ". " + position.name + "</b>\n" +
                "Profit: <b>" + profit_m_vs_sei + "SEI/" + profit_m_percent + "%</b>\n" +
                "Initial: <b>" + initial_sei + " SEI</b>\n" +
                "Price: <b>$" + Number(recent_token_data.other_2.base_token_price).toFixed(6) + "/" + a_token_vs_sei + " SEI</b>\n" +
                "Balance: <b>" + balance_token + "</b>\n" +
                "Market Cap: <b>$" + mcap + "</b>\n\n";
        }

        var sei_balance = await this.swapService.getSeiBalance(user); 
        pos_msg = pos_msg + "\n" +
            "Wallet Balance: <b>" + sei_balance + " SEI</b>";

        await this.bot.sendMessage(userId, pos_msg, { parse_mode: "HTML" });

        var inline_key = [];
        inline_key.push([{ text: '📈 Sell & Manage ', callback_data: 'position_list_sell' }]);
        inline_key.push([{ text: '🆕 Create Manage', callback_data: 'position_list_create' }]);
        inline_key.push([{ text: '🔄 Refresh', callback_data: 'position_list_refresh' }]);
        inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);

        const options = {
            reply_markup: {
                inline_keyboard: inline_key
            }
        };
        await this.bot.sendMessage(userId, 'My position management', options);
        await this.userService.update(userId, { current_panel: 'position_list' });
    }

    // wallet panel sei1m77nfvyngetsn54rk968t6f0qr059t67jdlvcv
    panel_wallets = async (user: UserType) => {
        const userId = user.id
        const w = user.wallet;
        if (w.key != "") {
            var sei_balance = await this.swapService.getSeiBalance(user);
            const w_msg = "<b>💰 Wallet " + "</b> <code>" + w.address + "</code>\n" +
                "<b>💸 Balance:</b> <code>" + sei_balance + " SEI</code>\n\n" +
                "<a href='https://www.seiscan.app/pacific-1/accounts/" + w.address + "'>View on scan</a>";
            await this.bot.sendMessage(userId, w_msg, { parse_mode: "HTML" });
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🌱 View Seed', callback_data: 'new_w_viewseed' }],
                        [{ text: '❌ Delete Wallet', callback_data: 'new_w_delete' }],
                        [{ text: '🔙 Back', callback_data: 'to_start' }]
                    ]
                }
            };
            await this.bot.sendMessage(userId, 'Delete or view on scan', options);
        } else {
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Generate New', callback_data: 'new_w_generate' },
                            { text: 'Import One', callback_data: 'new_w_import' }
                        ],
                        [{ text: '🔙 Back', callback_data: 'to_start' }]
                    ]
                }
            };
            this.bot.sendMessage(userId, 'Generate new wallet or import one', options);
        }
        await this.userService.update(userId, { current_panel: 'wallet' });

    }

    panel_buysell = async (user: UserType) => {
        const userId = user.id;
        const sw = user.swap;
        const token = sw.token;
        const amount = sw.amount;
        const gasprice = sw.gasprice;
        const slippage = sw.slippage;
        const mode = sw.mode;
        const t_s = token.length > 30 ? token.substring(0, 10) + "..." + token.slice(-10) : token;

        var sei_balance = await this.swapService.getSeiBalance(user);
        var w_msg = "<b>💸 Balance:</b> <code>" + sei_balance + " SEI</code>";
        const td = await this.pairService.getPairByToken(token);

        if (td != null) {
            const market_cap = td.other_2.cap;
            const p_h1 = Number(td.other_2.p_ch_h1) > 0 ? "+" + td.other_2.p_ch_h1 : td.other_2.p_ch_h1;
            const p_h24 = Number(td.other_2.p_ch_h24) > 0 ? "+" + td.other_2.p_ch_h24 : td.other_2.p_ch_h24;
            const s_price = td.other_2.quote_token_price;
            const t_price = td.other_2.base_token_price;
            const rate = (Number(s_price) / Number(t_price)).toFixed(4);
            w_msg = w_msg + "\n<b>💲 " + td.name + ":</b> <code>$" + t_price + "</code>";
            w_msg = w_msg + "\n<b>💎 SEI:</b> <code>$" + s_price + "</code>";
            w_msg = w_msg + "\n<b>🔋 Liquidity:</b> <code>$" + market_cap + "</code>";
            w_msg = w_msg + "\n<b>🚀 Price Change:</b> <code>1H:" + p_h1 + "%, 24H:" + p_h24 + "%</code>"
            w_msg = w_msg + "\n<b>➰" + td.name + "/SEI:</b> <code>" + rate + "/1</code>"
        }
        await this.bot.sendMessage(userId, w_msg, { parse_mode: "HTML" });

        var inline_key = [];
        var tmp = [];
        for (var i = 1; i < this.hotListForSwap.length; i++) {
            tmp.push({ text: token == this.hotListForSwap[i].denom ? "✅ " + this.hotListForSwap[i].name : this.hotListForSwap[i].name, callback_data: "buysell_contract_" + this.hotListForSwap[i].name });
            if ((i - 1) % 4 == 3) {
                inline_key.push(tmp);
                tmp = [];
            }
        }
        if ((this.hotListForSwap.length - 1) % 4 != 3) {
            inline_key.push(tmp);
        }

        var amount_txt = 'Amount: '
        if (mode) {
            amount_txt = amount_txt + amount + " SEI"
        } else {
            if (td != null) {
                amount_txt = amount_txt + amount + " " + td.name
            } else {
                amount_txt = amount_txt + amount + " token";
            }
        }
        inline_key.push([{ text: 'Token Denom OR Address: ' + t_s, callback_data: 'buysell_token' }]);
        inline_key.push([{ text: amount_txt, callback_data: 'buysell_amount' }]);
        inline_key.push([
            { text: '🔥 Gas Price (' + gasprice + ')', callback_data: 'buysell_gasprice' },
            { text: '🚧 Slippage (' + slippage + '%)', callback_data: 'buysell_slippage' }
        ]);
        inline_key.push([
            mode ? { text: 'Buy', callback_data: 'buysell_buy' } : { text: 'Sell', callback_data: 'buysell_sell' }
        ]);
        inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);


        const options = {
            reply_markup: {
                inline_keyboard: inline_key
            }
        };
        await this.bot.sendMessage(userId, mode ? 'Setting for Buy token with SEI' : 'Setting for Sell token for SEI', options);
        await this.userService.update(userId, { current_panel: 'swap' });
    }

    panel_transfer = async (user: UserType) => {
        const userId = user.id;
        const ts = user.transfer;
        const token = ts.token;
        const amount = ts.amount;
        const to = ts.to;
        const t_s = token.length > 30 ? token.substring(0, 10) + "..." + token.slice(-10) : token;

        var sei_balance = await this.swapService.getSeiBalance(user);
        const w_msg = "<b>💸 Balance:</b> <code>" + sei_balance + " SEI</code>";
        await this.bot.sendMessage(userId, w_msg, { parse_mode: "HTML" });

        var inline_key = [];
        var tmp = [];

        for (var i = 0; i < this.hotListForSwap.length - 1; i++) {
            tmp.push({ text: token == this.hotListForSwap[i].denom ? "✅ " + this.hotListForSwap[i].name : this.hotListForSwap[i].name, callback_data: "transfer_contract_" + this.hotListForSwap[i].name });
            if (i % 4 == 3) {
                inline_key.push(tmp);
                tmp = [];
            }
        }
        if ((this.hotListForSwap.length - 1) % 4 != 3) {
            inline_key.push(tmp);
        }

        inline_key.push([{ text: 'Token Denom OR Address: ' + t_s, callback_data: 'transfer_token' }]);
        inline_key.push([{ text: 'Amount: ' + amount, callback_data: 'transfer_amount' }]);
        inline_key.push([{ text: 'Recipient: ' + to, callback_data: 'transfer_recipient' }]);
        inline_key.push([{ text: 'Transfer', callback_data: 'transfer_send' }]);
        inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);

        const options = {
            reply_markup: {
                inline_keyboard: inline_key
            }
        };
        await this.bot.sendMessage(userId, 'Setting for token transfer', options);
        await this.userService.update(userId, { current_panel: 'transfer' });
    }



    // start panel
    sendStartSelectOption = async (user: UserType) => {
        const userId = user.id;
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Buy Token', callback_data: 'call_m_buysell_buy' },
                        { text: 'Sell Token', callback_data: 'call_m_buysell_sell' }
                    ],
                    [
                        { text: 'Transfer', callback_data: 'call_m_transfer' },
                        { text: 'Snipe token', callback_data: 'call_m_snipe' }
                    ],
                    [
                        { text: 'My Referrals', callback_data: 'call_m_referrals' },
                        { text: 'Leaderboard', callback_data: 'call_m_leaderboard' }
                    ],
                    [
                        { text: 'My Positions', callback_data: 'call_m_positions' },
                        { text: 'Wallet', callback_data: 'call_m_wallet' }
                    ],
                ]
            }
        };
        const welcome_msg = "Welcome to Super Seiyan Bot! \n\n" +
            "The God Speed telegram trading bot on SEI Network, trade any CW-20 tokens now.\n\n" +
            "🔥 Start Guide 🔥\n" +
            "Create wallet by tapping Wallet button, fund your wallet with SEI token\n" +
            "(If you don't have SEI token, you can use Exchange button to swap any token to SEI)\n\n" +
            "⚡️ Trade ⚡️\n" +
            "Tap Buy button and pre-set your trading setting, select any token on Hot list or Paste token address, Tap Buy with SEI, DONE! \n\n" +
            "💰 Rewards >\n" +
            "Tap Referral to start invite your friend to trade, you can earn up to 30% referral volume fees from our program! *Leaderboard coming soon*\n\n" +
            "SUPER SEIYAN MODE ON 🟢\n";
        await this.bot.sendMessage(userId, welcome_msg, options);
    }


    // response message
    transactionResponse = async (user: UserType, msg: string, status: number) => {
        const userId = user.id
        const current_panel = user.current_panel;
        const options = { parse_mode: "HTML" };
        if (status == 200) {
            await this.bot.sendMessage(userId, "<b>🎯 Transaction successed.</b> \n\n", options);
            await this.bot.sendMessage(userId, "<b>" + msg + "</b> \n\n", options);
        } else if (status == 300) {
            await this.bot.sendMessage(userId, "<b>📢 Setting missed.</b> \n\n", options);
            await this.bot.sendMessage(userId, "<b>" + msg + "</b> \n\n", options);
        } else if (status == 301) {
            await this.bot.sendMessage(userId, "<b>📢 Balance low.</b> \n\n", options);
            await this.bot.sendMessage(userId, "<b>" + msg + "</b> \n\n", options);
        } else {
            await this.bot.sendMessage(userId, "<b>💡 Transaction failed.</b> \n\n", options);
            await this.bot.sendMessage(userId, "<b>" + msg + "</b> \n\n", options);
        }

        if (current_panel == ACTIONS.SWAP) {
            await this.panel_buysell(user)
        } else if (current_panel == ACTIONS.TRANSFER) {
            await this.panel_transfer(user)
        } else if (current_panel == ACTIONS.CREATE_POSTION) {
            await this.panel_create_position(user)
        } else {

        }
        // await this.sendStartSelectOption(userId)
    }







    // this.bot.sendMessage(userId, 💡 'Please select an option:', options ❌ ✅ 📌 🏦 ℹ️ 📍  💳 ⛽️  🕐 🔗); 🎲 🏀 🌿 💬 🔔 📢 ✔️ ⭕ 🔱
    // ➰ ™️ ♻️ 💲 💱 〰️ 🔆 🔅 🌱 🌳 🌴 🌲🌼🌻🌺🌸🤸 🚴🧚🔥🚧
    // ⌛⏰💎🔋⌨️🖨️💿📗📙📒🏷️📝🔒🛡️⚙️🔗🥇🏆 🥈🥉🧩🎯🔙
    // 💰 💸🚀👁️‍🗨️💯
}
