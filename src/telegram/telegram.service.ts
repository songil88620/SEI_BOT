import { Inject, OnModuleInit, forwardRef } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ACTIONS, ADMINS, PANELS, TG_TOKEN } from 'src/constant';
import { UserService } from 'src/user/user.service';
import { CHAIN_ID, myName } from 'src/constant';
import { SwapService } from 'src/swap/swap.service';
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
import { set } from 'mongoose';

const fs = require('fs')
const path = require('path')
const tokenImgs = path.join(__dirname, '../../src/assets/images/tokens2.jpg')


const TelegramBot = require('node-telegram-bot-api');


const Commands = [
    { command: 'start', description: 'Start your SEI trading journey' },
    { command: 'help', description: 'Send help please' },
    { command: 'bots', description: 'Super Seiyan Botsss' },
];



@Injectable()
export class TelegramService implements OnModuleInit {

    private provider: any;
    private readonly bot: any
    private logger = new Logger(TelegramService.name)
    private user: string[] = []
    private uc_tmp = {}
    private uc_msg = {}
    private uc_auto_trade = {}
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
        return;
    }

    @Cron(CronExpression.EVERY_MINUTE, { name: 'list_bot' })
    async listBot() {
        await this.updateListForSwap();
        return;
    }

    getUserTmp = (userId: string) => {
        return this.uc_tmp[userId];
    }

    updateListForSwap = async () => {
        const hot = await this.pairService.getHotPair(8);
        const all = await this.pairService.findAll();
        const sei = { name: "SEI", denom: "usei", decimal: 6 };
        this.hotListForSwap = [sei, ...hot];
        this.allListForSwap = [sei, ...all]
        return;
    }

    cleanrMessage = async (chatid: string, msgid: number, len: number) => {
        for (var i = 0; i <= len; i++) {
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
            var user: UserType = await this.userService.findOne(id)
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
                if (cmd == 'call_m_autotrade') {
                    await this.panel_autotrade(user)
                }
                if (cmd == 'call_m_referrals') {
                    const user = await this.userService.findOne(id);
                    const code = user.code;
                    const referr_len = user.referral.length;
                    var refs = [];
                    var ref_msg = ""
                    refs.forEach((r) => {
                        ref_msg = ref_msg + "<b>" + r.u + " : " + r.t + " ETH</b>\n"
                    })

                    await this.bot.sendMessage(id, "<b>Your referral link : </b><code>" + myName + "?start=_" + code + "</code>\n<b>Referral Users : " + referr_len + "</b>\n" + ref_msg, { parse_mode: "HTML" });
                    await this.sendStartSelectOption(user);
                }

                if (cmd == 'call_m_positions') {
                    const postions: PositionType[] = await this.positionService.getMyManualPositions(id);
                    if (postions.length > 0) {
                        await this.panel_manage_position(user)
                    } else {
                        await this.panel_postion_list(user)
                    }
                }

                if (cmd == 'call_m_setting') {
                    await this.panel_setting(user)
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
                    user.wallet = wallet;
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
                    user.wallet = wallet;
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
                    if (current_panel == PANELS.P_SWAP) {
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
                    if (current_panel == PANELS.P_SWAP) {
                        await this.swapService.buy_token(user, ACTIONS.SWAP)
                        await this.panel_buysell(user)
                    } else {
                        await this.swapService.buy_token(user, ACTIONS.CREATE_POSTION)
                        // await this.panel_postion_list(user)
                    }
                }
                if (cmd == 'buysell_sell') {
                    await this.bot.sendMessage(id, "<b>⏳ Transaction Sent, Waiting for tx confirmation…</b>", { parse_mode: "HTML" });
                    await this.swapService.sell_token(user, ACTIONS.SWAP, '0')
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
                    await this.swapService.transfer_token(user, ACTIONS.TRANSFER, '0', { id: '', address: '' });
                    // await this.panel_transfer(user);
                }
            }

            // position list function
            if (cmd.includes('position_list_')) {

                if (cmd == 'position_list_sell') {
                    await this.panel_manage_position(user);
                }
                if (cmd == 'position_list_create') {
                    await this.panel_create_position(user);
                }
                if (cmd == 'position_list_refresh') {
                    const msg_id = this.uc_msg[user.id];
                    const msg = await this.generate_pos_msg(user);
                    const e_msg = await this.bot.editMessageText(msg, { chat_id: user.id, message_id: msg_id, parse_mode: "HTML" })
                    this.uc_msg[user.id] = e_msg.message_id;
                }
            }

            // position manage function
            if (cmd.includes('pos_mng_')) {
                const options = {
                    reply_markup: {
                        force_reply: true
                    },
                    parse_mode: "HTML"
                };
                if (cmd == 'pos_mng_prev') {
                    user.current_page = user.current_page - 1;
                    await this.panel_manage_position(user);
                    await this.userService.update(id, { current_page: user.current_page });
                }
                if (cmd == 'pos_mng_null') {
                    return;
                }
                if (cmd == 'pos_mng_next') {
                    user.current_page = user.current_page + 1;
                    await this.panel_manage_position(user);
                    await this.userService.update(id, { current_page: user.current_page });
                }
                if (cmd == 'pos_mng_sellall') {
                    await this.bot.sendMessage(id, "<b>⏳ Transaction Sent, Waiting for tx confirmation…</b>", { parse_mode: "HTML" });
                    await this.swapService.sell_token(user, ACTIONS.POSITION_SELL, '100%');

                }
                if (cmd == 'pos_mng_sellhal') {
                    await this.bot.sendMessage(id, "<b>⏳ Transaction Sent, Waiting for tx confirmation…</b>", { parse_mode: "HTML" });
                    await this.swapService.sell_token(user, ACTIONS.POSITION_SELL, '50%');

                }
                if (cmd == 'pos_mng_sellxxx') {
                    await this.bot.sendMessage(id, "<b>Please input sell amount</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Sell X(position)</b>", options);
                }
                if (cmd == 'pos_mng_refresh') {
                    // await this.panel_manage_position(user); 
                    const msg_id = this.uc_msg[user.id];
                    const msg = await this.generate_one_pos_msg(user);
                    const e_msg = await this.bot.editMessageText(msg, { chat_id: user.id, message_id: msg_id, parse_mode: "HTML" })
                    this.uc_msg[user.id] = e_msg.message_id;
                }
                if (cmd == 'pos_mng_remove') {
                    const pid = this.uc_tmp[id]['_id'];
                    await this.positionService.deletePositionOne(pid);
                    await this.panel_postion_list(user);
                }
            }

            if (cmd.includes('setting_')) {
                const options = {
                    reply_markup: {
                        force_reply: true
                    },
                    parse_mode: "HTML"
                };
                if (cmd == 'setting_buygas') {
                    await this.bot.sendMessage(id, "<b>Please set gasprice for buying</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Gasprice (Buying)</b>", options);
                }
                if (cmd == 'setting_buyslip') {
                    await this.bot.sendMessage(id, "<b>Please set slippage for buying</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Slippage (Buying)</b>", options);
                }
                if (cmd == 'setting_sellgas') {
                    await this.bot.sendMessage(id, "<b>Please set gasprice for selling</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Gasprice (Selling)</b>", options);
                }
                if (cmd == 'setting_sellslip') {
                    await this.bot.sendMessage(id, "<b>Please set slippage for selling</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Slippage (Selling)</b>", options);
                }
            }

            if (cmd.includes('auto_tr_')) {
                const options = {
                    reply_markup: {
                        force_reply: true
                    },
                    parse_mode: "HTML"
                };
                if (cmd == 'auto_tr_token') {
                    await this.bot.sendMessage(id, "<b>Please input Token Denom OR Address</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Token Denom OR Address(auto-trade)</b>", options);
                }
                if (cmd == 'auto_tr_buyprice') {
                    await this.bot.sendMessage(id, "<b>Please set buy price</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Buy Price (auto-trade)</b>", options);
                }
                if (cmd == 'auto_tr_sellprice') {
                    await this.bot.sendMessage(id, "<b>Please set sell price</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Sell Price (auto-trade)</b>", options);
                }
                if (cmd == 'auto_tr_sellamount') {
                    await this.bot.sendMessage(id, "<b>Please set sell amount</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Sell Amount (auto-trade)</b>", options);
                }
                if (cmd == 'auto_tr_buyamount') {
                    await this.bot.sendMessage(id, "<b>Please set buy amount</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Buy Amount (auto-trade)</b>", options);
                }
                if (cmd == 'auto_tr_start') {
                    await this.bot.sendMessage(id, "<b>⏳ Creating auto-position, Waiting for tx confirmation…</b>", { parse_mode: "HTML" });
                    const res = await this.positionService.createAutoNewOne(user);
                    if (res) {
                        await this.bot.sendMessage(id, "<b>📊 Auto position is created successfully</b>", { parse_mode: "HTML" });
                    } else {
                        await this.bot.sendMessage(id, "<b>☹️ Failed to create auto postion</b>", { parse_mode: "HTML" });
                    }
                    await this.panel_autotrade(user)
                }
                if (cmd == 'auto_tr_list') {
                    await this.panel_autotrade_list(user)
                }
            }

            if (cmd.includes('posauto_')) {
                if (cmd == 'posauto_mng_prev') {
                    user.current_page = user.current_page - 1;
                    await this.panel_autotrade_list(user);
                    await this.userService.update(id, { current_page: user.current_page });
                }
                if (cmd == 'posauto_mng_null') {
                    return;
                }
                if (cmd == 'posauto_mng_next') {
                    user.current_page = user.current_page + 1;
                    await this.panel_autotrade_list(user);
                    await this.userService.update(id, { current_page: user.current_page });
                }
                if (cmd == 'posauto_mng_remove') {
                    const pid = this.uc_tmp[id]['_id'];
                    await this.positionService.deletePositionOne(pid);
                    await this.panel_autotrade_list(user);
                }
                if (cmd == 'posauto_mng_refresh') {
                    const msg_id = this.uc_msg[user.id];
                    const msg = await this.generate_one_autopos_msg(user);
                    const e_msg = await this.bot.editMessageText(msg, { chat_id: user.id, message_id: msg_id, parse_mode: "HTML" })
                    this.uc_msg[user.id] = e_msg.message_id;
                }
            }


            // admin panel
            if (cmd.includes('admin_')) {
                const options = {
                    reply_markup: {
                        force_reply: true
                    },
                    parse_mode: "HTML"
                };
                if (cmd == 'admin_manage_referral_type') {
                    await this.bot.sendMessage(id, "<b>Please input referral code</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Referral Code</b>", options);
                }
                if (cmd == 'admin_ref_fee_edit') {
                    await this.bot.sendMessage(id, "<b>Please input reward fee percent(0~100)%</b>", { parse_mode: "HTML" });
                    await this.bot.sendMessage(id, "<b>Reward Fee</b>", options);
                }
            }


            // to back menu
            if (cmd == "to_start") {

                if (current_panel == PANELS.P_POSITION_CREATE) {
                    await this.sendStartSelectOption(user)
                } else if (current_panel == PANELS.P_POSITION_MANAGE) {
                    await this.sendStartSelectOption(user)
                } else {
                    await this.sendStartSelectOption(user)
                }
            }

            // await this.cleanrMessage(id, msgid, 10)
            return;
        } catch (error) {
            console.log(">>>Error")
            return;
        }
    }

    onReceiveMessage = async (msg: any) => {
        try {
            const id = msg.chat.id;
            const msgid = msg.message_id;

            const message = msg.text;
            const userid: string = msg.from.id
            const reply_msg = msg.reply_to_message?.text;

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
                    inviter: "",
                    code: uid(),
                    detail: "",
                    other: {
                        mirror: 0,
                        limit: 0
                    },
                    current_panel: PANELS.P_MAIN,
                    current_page: 0,
                    setting: {
                        buy_gasprice: '3',
                        buy_slippage: '0.5',
                        sell_gasprice: '3',
                        sell_slippage: '0.5',
                    },
                    fee_type: 10,
                    claim_amount: 0,
                    autotrade: {
                        token: '',
                        buy_amount: '',
                        buy_price: '',
                        sell_amount: '',
                        sell_price: '',
                    }
                }
                await this.userService.create(new_user);
            }

            var user: UserType = await this.userService.findOne(userid)
            const current_panel = user.current_panel;

            if (message.includes('/start _')) {
                const u_code = user.code;
                const code = message.substring(8, 19)
                await this.userService.updateReferral(code, u_code, userid)
                await this.sendStartSelectOption(user);
            }

            // return start menu
            if (message == '/start') {
                await this.sendStartSelectOption(user);
            }

            // help
            if (message == '/help') {
                const options = {
                    parse_mode: "HTML"
                };
                const msg = "For more Bot details and guide, please visit\n" +
                    "https://docs.superseiyan.io\n" +
                    "Join our official channel now\n" +
                    "https://t.me/superseiyanchannel"
                await this.bot.sendMessage(id, msg, options);
            }

            //bots
            if (message == '/bots') {
                const options = {
                    parse_mode: "HTML"
                };
                const msg = "Bots message- \n\n" +
                    "Find the best for that give you ultra instinct! You can still access to\n" +
                    "you wallet with different bots, you can use anyone of them anytime!\n\n" +
                    "https://t.me/SSeiyan_Bot\n" +
                    "https://t.me/VSeiyan_Bot\n"
                await this.bot.sendMessage(id, msg, options);
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
                    user.wallet = wallet;
                    await this.userService.update(userid, { wallet: wallet });
                    const options = {
                        parse_mode: "HTML"
                    };
                    const w_msg = "<b>💰 Wallet " + "</b> \n<b>Address:</b> <code>" + address + "</code>\n<b>Seed:</b> <code>" + key + "</code>\n\n";
                    await this.bot.sendMessage(userid, "<b>🎉 Your wallet is imported successfully.</b> \n\n" + w_msg, options);
                    await this.panel_wallets(user);
                } catch (e) {
                    const options = {
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>💡 Error is occured. Maybe wrong seed.</b> \n", options);
                    await this.panel_wallets(user);
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
                    if (current_panel == PANELS.P_SWAP) {
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
                    if (current_panel == PANELS.P_SWAP) {
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
                    if (current_panel == PANELS.P_SWAP) {
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
                    if (current_panel == PANELS.P_SWAP) {
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

            // position sell 
            if (reply_msg == 'Sell X(position)') {
                const my_postion: PositionType = this.uc_tmp[userid];
                var bs = Number(my_postion.initial.token_amount);
                my_postion.sell.forEach((ps) => {
                    bs = bs - Number(ps)
                })
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (Number(message) > Number(bs)) {
                    await this.bot.sendMessage(userid, "<b>Balance over, input correct amount</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Sell X(position)</b>", options);
                } else if (!decimalRegex.test(message)) {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Sell X(position)</b>", options);
                } else {
                    await this.bot.sendMessage(id, "<b>⏳ Transaction Sent, Waiting for tx confirmation…</b>", { parse_mode: "HTML" });
                    await this.swapService.sell_token(user, ACTIONS.POSITION_SELL, message);
                }
            }

            if (reply_msg == 'Gasprice (Buying)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var setting = user.setting;
                    setting.buy_gasprice = message;
                    user.setting = setting;
                    await this.userService.update(userid, { setting });
                    await this.bot.sendMessage(userid, "<b>Gas Price is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_setting(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Gasprice (Buying)</b>", options);
                }
            }

            if (reply_msg == 'Slippage (Buying)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var setting = user.setting;
                    setting.buy_slippage = message;
                    user.setting = setting;
                    await this.userService.update(userid, { setting });
                    await this.bot.sendMessage(userid, "<b>Slippage is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_setting(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Slippage (Buying)</b>", options);
                }
            }

            if (reply_msg == 'Gasprice (Selling)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var setting = user.setting;
                    setting.sell_gasprice = message;
                    user.setting = setting;
                    await this.userService.update(userid, { setting });
                    await this.bot.sendMessage(userid, "<b>Gas Price is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_setting(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Gasprice (Selling)</b>", options);
                }
            }

            if (reply_msg == 'Slippage (Selling)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var setting = user.setting;
                    setting.sell_slippage = message;
                    user.setting = setting;
                    await this.userService.update(userid, { setting });
                    await this.bot.sendMessage(userid, "<b>Slippage is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_setting(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Slippage (Selling)</b>", options);
                }
            }


            // auto-trade setting
            if (reply_msg == 'Token Denom OR Address(auto-trade)') {
                if (isValidSeiAddress(message)) {
                    var autotrade = user.autotrade;
                    autotrade.token = message
                    await this.userService.update(userid, { autotrade });
                    await this.bot.sendMessage(userid, "<b>Contract is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_autotrade(user)
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid contract address</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Token Denom OR Address(auto-trade)</b>", options);
                }
            }

            if (reply_msg == 'Buy Price (auto-trade)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var autotrade = user.autotrade;
                    autotrade.buy_price = message;
                    await this.userService.update(userid, { autotrade });
                    await this.bot.sendMessage(userid, "<b>Buy price is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_autotrade(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Buy Price (auto-trade)</b>", options);
                }
            }

            if (reply_msg == 'Sell Price (auto-trade)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var autotrade = user.autotrade;
                    autotrade.sell_price = message;
                    await this.userService.update(userid, { autotrade });
                    await this.bot.sendMessage(userid, "<b>Sell price is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_autotrade(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Sell Price (auto-trade)</b>", options);
                }
            }

            if (reply_msg == 'Sell Amount (auto-trade)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var autotrade = user.autotrade;
                    autotrade.sell_amount = message;
                    await this.userService.update(userid, { autotrade });
                    await this.bot.sendMessage(userid, "<b>Sell amount is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_autotrade(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Sell Amount (auto-trade)</b>", options);
                }
            }

            if (reply_msg == 'Buy Amount (auto-trade)') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    var autotrade = user.autotrade;
                    autotrade.buy_amount = message;
                    await this.userService.update(userid, { autotrade });
                    await this.bot.sendMessage(userid, "<b>Buy amount is set successfully.</b> \n", { parse_mode: "HTML" });
                    await this.panel_autotrade(user);
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid amount input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Buy Amount (auto-trade)</b>", options);
                }
            }



            // admin ref setting
            if (reply_msg == 'Referral Code') {
                const ref_user = await this.userService.getUserByRefCode(message);
                if (ref_user) {
                    await this.panel_a_manage_ref_type(user, ref_user)
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid code, user doesn't exist. Try again with correct code.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Referral Code</b>", options);
                }
            }

            if (reply_msg == 'Reward Fee') {
                const decimalRegex = /^\d+(\.\d{1,2})?$/;
                if (decimalRegex.test(message)) {
                    if (message > 100 || message < 0) {
                        await this.bot.sendMessage(userid, "<b>Invalid percent input, 0 ~ 100 is possible</b> \n", { parse_mode: "HTML" });
                        const options = {
                            reply_markup: {
                                force_reply: true
                            },
                            parse_mode: "HTML"
                        };
                        await this.bot.sendMessage(userid, "<b>Reward Fee</b>", options);
                    } else {
                        const ref_userid = this.uc_tmp[userid];
                        await this.userService.update(ref_userid, { fee_type: message });
                        const ref_user = await this.userService.findOne(ref_userid);
                        await this.bot.sendMessage(userid, "<b>Reward fee percent set successfully.</b> \n", { parse_mode: "HTML" });
                        await this.panel_a_manage_ref_type(user, ref_user);
                    }
                } else {
                    await this.bot.sendMessage(userid, "<b>Invalid percent input, only decimal can be acceptable.</b> \n", { parse_mode: "HTML" });
                    const options = {
                        reply_markup: {
                            force_reply: true
                        },
                        parse_mode: "HTML"
                    };
                    await this.bot.sendMessage(userid, "<b>Reward Fee</b>", options);
                }
            }

            // await this.cleanrMessage(id, msgid, 10)
            return;
        } catch (e) {
            console.log(">>e", e)
            return;
        }

    }


    generate_one_autopos_msg = async (user: UserType) => {
        const userId = user.id
        const page = user.current_page;
        const p: { position: PositionType, len: number } = await this.positionService.getMyPositionOneAuto(userId, page)
        const position: PositionType = p.position;
        this.uc_tmp[userId] = position;
        const recent_token_data: PairType = this.swapService.getTokenData(position.denom);
        const used_m = Number(position.initial.sei_amount) * Number(position.initial.sei_price);
        const curt_m = Number(position.initial.token_amount) * Number(recent_token_data.other_2.base_token_price);
        const profit_m = curt_m == 0 ? 0 : (curt_m - used_m);
        const profit_m_vs_sei = curt_m == 0 ? '--' : (profit_m / Number(recent_token_data.other_2.quote_token_price)).toFixed(5);
        const profit_m_percent = curt_m == 0 ? '--' : ((profit_m / used_m) * 100).toFixed(2);
        const initial_sei = Number(position.initial.sei_amount).toFixed(5);
        const a_token_vs_sei = (Number(recent_token_data.other_2.base_token_price) / Number(recent_token_data.other_2.quote_token_price)).toFixed(5);
        var bs = Number(position.initial.token_amount);
        position.sell.forEach((ps) => {
            bs = bs - Number(ps)
        })
        const balance_token = Number(bs).toFixed(5) + " $" + position.name + "/" + (curt_m / Number(recent_token_data.other_2.quote_token_price)).toFixed(5) + ' SEI/ $' + (curt_m).toFixed(5);
        const mcap = (Number(recent_token_data.other_2.cap) * Number(recent_token_data.other_2.base_token_price)).toFixed(5) + "/ $" + recent_token_data.other_2.base_token_price;
        const ts = Date.now();
        var pos_msg =
            "<b>" + (Math.abs(page % p.len) + 1) + "." + position.name + "</b>\n" +
            "Profit: <b>" + profit_m_vs_sei + "SEI/" + profit_m_percent + "%</b>\n" +
            "Initial: <b>" + initial_sei + " SEI</b>\n" +
            "Price: <b>$" + Number(recent_token_data.other_2.base_token_price).toFixed(6) + "/" + a_token_vs_sei + " SEI</b>\n" +
            "Balance: <b>" + balance_token + "</b>\n" +
            "Market Cap: <b>$" + mcap + "</b>\n\n" +
            "Time: <b>" + ts + "</b>\n"

        return pos_msg;
    }

    panel_autotrade_list = async (user: UserType) => {
        try {
            const userId = user.id
            const page = user.current_page;
            const p: { position: PositionType, len: number } = await this.positionService.getMyPositionOneAuto(userId, page)
            if (p.len > 0) {
                const position: PositionType = p.position;
                const pos_msg = await this.generate_one_autopos_msg(user);
                const msg = await this.bot.sendMessage(userId, pos_msg, { parse_mode: "HTML" });
                this.uc_msg[userId] = msg.message_id;

                var inline_key = [];
                inline_key.push([
                    { text: '◀️ Prev', callback_data: 'posauto_mng_prev' },
                    { text: position.name, callback_data: 'posauto_mng_null' },
                    { text: 'Next ▶️', callback_data: 'posauto_mng_next' },
                ]);
                inline_key.push([
                    { text: '🔎 Seiscan', url: 'https://www.seiscan.app/pacific-1/contracts/' + position.denom },
                    { text: '📊 Chart', url: 'https://coinhall.org/sei/' + position.initial.pool }
                ]);
                inline_key.push([
                    { text: '🔄 Refresh', callback_data: 'posauto_mng_refresh' },
                    { text: '🗑️ Remove', callback_data: 'posauto_mng_remove' },
                ]);
                inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);
                const options = {
                    reply_markup: {
                        inline_keyboard: inline_key
                    }
                };
                await this.bot.sendMessage(userId, 'Setting for position management', options);
                await this.userService.update(userId, { current_panel: PANELS.P_AUTOPOS_LIST });
            } else {
                var pos_msg = pos_msg + "You don't have any positions yet, ☹️ \n";
                var sei_balance = await this.swapService.getSeiBalance(user);
                pos_msg = pos_msg + "\n" + "Wallet Balance: <b>" + sei_balance + " SEI</b>";
                await this.bot.sendMessage(userId, pos_msg, { parse_mode: "HTML" });
                await this.userService.update(userId, { current_panel: PANELS.P_AUTOPOS_LIST });
            }
            return;
        } catch (e) {
            return;
        }
    }

    panel_autotrade = async (user: UserType) => {
        const userId = user.id

        const auto_trade = user.autotrade;
        const setting = user.setting
        const token = auto_trade.token;
        const buy_amount = auto_trade.buy_amount;
        const buy_price = auto_trade.buy_price;
        const sell_amount = auto_trade.sell_amount;
        const sell_price = auto_trade.sell_price;
        const gasprice = setting.buy_gasprice;
        const slippage = setting.buy_slippage;

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
        w_msg = w_msg + "\n<b>🔥 GasPrice: " + gasprice + "</b>"
        w_msg = w_msg + "\n<b>🚧 Slippage: " + slippage + "%</b>"
        await this.bot.sendMessage(userId, w_msg, { parse_mode: "HTML" });

        var inline_key = [];
        inline_key.push([{ text: 'Token Denom OR Address: ' + t_s, callback_data: 'auto_tr_token' }]);
        inline_key.push([
            { text: 'Auto Buy Price: ' + buy_price, callback_data: 'auto_tr_buyprice' },
            { text: 'Auto Sell Price: ' + sell_price, callback_data: 'auto_tr_sellprice' }
        ]);
        inline_key.push([
            { text: 'Auto Sell %: ' + sell_amount, callback_data: 'auto_tr_sellamount' }
        ]);
        inline_key.push([
            { text: 'Buy amount SEI: ' + buy_amount, callback_data: 'auto_tr_buyamount' }
        ]);
        inline_key.push([
            { text: 'Start', callback_data: 'auto_tr_start' }
        ]);
        inline_key.push([
            { text: 'Manage List', callback_data: 'auto_tr_list' }
        ]);
        inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);

        const options = {
            reply_markup: {
                inline_keyboard: inline_key
            }
        };
        await this.bot.sendMessage(userId, 'Setting for new auto position creating', options);
        await this.userService.update(userId, { current_panel: PANELS.P_AUTOPOS_CREATE });
        return;
    }


    panel_a_manage_ref_type = async (user: UserType, ref_user: UserType) => {
        try {
            const userId = user.id;
            var w_msg = "<b>User info review:</b>";
            w_msg = w_msg + "\n<b>📛 Name: " + ref_user.username + "</b>"
            w_msg = w_msg + "\n<b>🔗 Ref Code: </b><code>" + ref_user.code + "</code>";
            w_msg = w_msg + "\n<b>🍔 Reward Fee: " + (ref_user.fee_type ? ref_user.fee_type : "0") + "%</b>\n";
            await this.bot.sendMessage(userId, w_msg, { parse_mode: "HTML" });

            var inline_key = [];
            inline_key.push([
                { text: 'Edit Fee(%)', callback_data: 'admin_ref_fee_edit' },
            ]);
            inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);
            const options = {
                reply_markup: {
                    inline_keyboard: inline_key
                }
            };
            this.uc_tmp[userId] = ref_user.id;
            await this.bot.sendMessage(userId, 'Referral user fee percent setting', options);
            await this.userService.update(userId, { current_panel: PANELS.P_A_FEE });

        } catch (e) {
            console.log(">>>ER", e)
        }
    }

    panel_setting = async (user: UserType) => {
        const userId = user.id
        const buy_gas = user?.setting?.buy_gasprice ? user.setting.buy_gasprice : 0;
        const buy_slip = user?.setting?.buy_slippage ? user.setting.buy_slippage : 0;
        const sell_gas = user?.setting?.sell_gasprice ? user.setting.sell_gasprice : 0;
        const sell_slip = user?.setting?.sell_slippage ? user.setting.sell_slippage : 0;
        var inline_key = [];
        inline_key.push([
            { text: 'Buy Gas Price: ' + buy_gas, callback_data: 'setting_buygas' },
            { text: 'Buy Slippage: ' + buy_slip + "%", callback_data: 'setting_buyslip' },
        ]);
        inline_key.push([
            { text: 'Sell Gas Price: ' + sell_gas, callback_data: 'setting_sellgas' },
            { text: 'Sell Slippage: ' + sell_slip + "%", callback_data: 'setting_sellslip' },
        ]);
        inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);
        const options = {
            reply_markup: {
                inline_keyboard: inline_key
            }
        };
        await this.bot.sendMessage(userId, 'Initial setting for gas & slippage', options);
        await this.userService.update(userId, { current_panel: PANELS.P_SETTING });
        return;
    }

    generate_one_pos_msg = async (user: UserType) => {
        const userId = user.id
        const page = user.current_page;
        const p: { position: PositionType, len: number } = await this.positionService.getMyPositionOne(userId, page)
        const position: PositionType = p.position;
        this.uc_tmp[userId] = position;
        const recent_token_data: PairType = this.swapService.getTokenData(position.denom);
        const used_m = Number(position.initial.sei_amount) * Number(position.initial.sei_price);
        const curt_m = Number(position.initial.token_amount) * Number(recent_token_data.other_2.base_token_price);
        const profit_m = curt_m - used_m;
        const profit_m_vs_sei = (profit_m / Number(recent_token_data.other_2.quote_token_price)).toFixed(5);
        const profit_m_percent = ((profit_m / used_m) * 100).toFixed(2);
        const initial_sei = Number(position.initial.sei_amount).toFixed(5);
        const a_token_vs_sei = (Number(recent_token_data.other_2.base_token_price) / Number(recent_token_data.other_2.quote_token_price)).toFixed(5);
        var bs = Number(position.initial.token_amount);
        position.sell.forEach((ps) => {
            bs = bs - Number(ps)
        })
        const balance_token = Number(bs).toFixed(5) + " $" + position.name + "/" + (curt_m / Number(recent_token_data.other_2.quote_token_price)).toFixed(5) + ' SEI/ $' + (curt_m).toFixed(5);
        const mcap = (Number(recent_token_data.other_2.cap) * Number(recent_token_data.other_2.base_token_price)).toFixed(5) + "/ $" + recent_token_data.other_2.base_token_price;
        const ts = Date.now();
        var pos_msg =
            "<b>" + (Math.abs(page % p.len) + 1) + "." + position.name + "</b>\n" +
            "Profit: <b>" + profit_m_vs_sei + "SEI/" + profit_m_percent + "%</b>\n" +
            "Initial: <b>" + initial_sei + " SEI</b>\n" +
            "Price: <b>$" + Number(recent_token_data.other_2.base_token_price).toFixed(6) + "/" + a_token_vs_sei + " SEI</b>\n" +
            "Balance: <b>" + balance_token + "</b>\n" +
            "Market Cap: <b>$" + mcap + "</b>\n\n" +
            "Time: <b>" + ts + "</b>\n"

        return pos_msg;
    }

    panel_manage_position = async (user: UserType) => {
        try {
            const userId = user.id
            const page = user.current_page;
            const p: { position: PositionType, len: number } = await this.positionService.getMyPositionOne(userId, page)
            const position: PositionType = p.position;

            const pos_msg = await this.generate_one_pos_msg(user);

            const msg = await this.bot.sendMessage(userId, pos_msg, { parse_mode: "HTML" });
            this.uc_msg[userId] = msg.message_id;

            var inline_key = [];
            inline_key.push([
                { text: '◀️ Prev', callback_data: 'pos_mng_prev' },
                { text: position.name, callback_data: 'pos_mng_null' },
                { text: 'Next ▶️', callback_data: 'pos_mng_next' },
            ]);
            inline_key.push([
                { text: 'Sell 100%', callback_data: 'pos_mng_sellall' },
                { text: 'Sell 50%', callback_data: 'pos_mng_sellhal' },
            ]);
            inline_key.push([{ text: 'Sell X', callback_data: 'pos_mng_sellxxx' }]);
            inline_key.push([
                { text: '🔎 Seiscan', url: 'https://www.seiscan.app/pacific-1/contracts/' + position.denom },
                { text: '📊 Chart', url: 'https://coinhall.org/sei/' + position.initial.pool }
            ]);
            inline_key.push([
                { text: '🔄 Refresh', callback_data: 'pos_mng_refresh' },
                { text: '🗑️ Remove', callback_data: 'pos_mng_remove' },
            ]);
            inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);


            const options = {
                reply_markup: {
                    inline_keyboard: inline_key
                }
            };
            await this.bot.sendMessage(userId, 'Setting for position management', options);
            await this.userService.update(userId, { current_panel: PANELS.P_POSITION_MANAGE });
            return;
        } catch (e) {
            return;
        }
    }

    generate_pos_msg = async (user: UserType) => {
        const userId = user.id;
        const postions: PositionType[] = await this.positionService.getMyManualPositions(userId)
        var idx = 0;
        var pos_msg = "<b>Positions Overview:</b>\n\n";
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
            var bs = Number(position.initial.token_amount);
            position.sell.forEach((ps) => {
                bs = bs - Number(ps)
            })
            const balance_token = Number(bs).toFixed(5) + " $" + position.name + "/" + (curt_m / Number(recent_token_data.other_2.quote_token_price)).toFixed(5) + ' SEI/ $' + (curt_m).toFixed(5);
            const mcap = (Number(recent_token_data.other_2.cap) * Number(recent_token_data.other_2.base_token_price)).toFixed(5) + "/ $" + recent_token_data.other_2.base_token_price;

            pos_msg = pos_msg +
                "<b>" + idx + ". " + position.name + "</b>\n" +
                "Profit: <b>" + profit_m_vs_sei + "SEI/" + profit_m_percent + "%</b>\n" +
                "Initial: <b>" + initial_sei + " SEI</b>\n" +
                "Price: <b>$" + Number(recent_token_data.other_2.base_token_price).toFixed(6) + "/" + a_token_vs_sei + " SEI</b>\n" +
                "Balance: <b>" + balance_token + "</b>\n" +
                "Market Cap: <b>$" + mcap + "</b>\n\n";
        }

        if (postions.length == 0) {
            pos_msg = pos_msg + "You don't have any positions yet, ☹️ \n";
        }

        var sei_balance = await this.swapService.getSeiBalance(user);
        pos_msg = pos_msg + "\n" +
            "Wallet Balance: <b>" + sei_balance + " SEI</b>";

        return pos_msg;
    }

    panel_postion_list = async (user: UserType) => {
        const userId = user.id;
        const postions: PositionType[] = await this.positionService.getMyManualPositions(userId)
        const pos_mng = await this.generate_pos_msg(user);
        const msg = await this.bot.sendMessage(userId, pos_mng, { parse_mode: "HTML" });
        this.uc_msg[userId] = msg.message_id;

        var inline_key = [];
        postions.length > 0 && inline_key.push([{ text: '📈 Sell & Manage ', callback_data: 'position_list_sell' }]);
        // inline_key.push([{ text: '🆕 Create Manage', callback_data: 'position_list_create' }]);
        inline_key.push([{ text: '🔄 Refresh', callback_data: 'position_list_refresh' }]);
        inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);

        const options = {
            reply_markup: {
                inline_keyboard: inline_key
            }
        };
        await this.bot.sendMessage(userId, 'My position management', options);
        await this.userService.update(userId, { current_panel: PANELS.P_POSITION_LIST });
        return;
    }

    panel_create_position = async (user: UserType) => {
        const userId = user.id
        const sw = user.swap;
        const setting = user.setting
        const token = sw.token;
        const amount = sw.amount;
        const gasprice = setting.buy_gasprice;
        const slippage = setting.buy_slippage;
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
        w_msg = w_msg + "\n<b>🔥 GasPrice: " + gasprice + "</b>"
        w_msg = w_msg + "\n<b>🚧 Slippage: " + slippage + "%</b>"
        await this.bot.sendMessage(userId, w_msg, { parse_mode: "HTML" });

        var inline_key = [];
        // var tmp = [];
        // for (var i = 1; i < this.hotListForSwap.length; i++) {
        //     tmp.push({ text: token == this.hotListForSwap[i].denom ? "✅ " + this.hotListForSwap[i].name : this.hotListForSwap[i].name, callback_data: "buysell_contract_" + this.hotListForSwap[i].name });
        //     if ((i - 1) % 4 == 3) {
        //         inline_key.push(tmp);
        //         tmp = [];
        //     }
        // }
        // if ((this.hotListForSwap.length - 1) % 4 != 3) {
        //     inline_key.push(tmp);
        // }

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
            { text: 'Buy', callback_data: 'buysell_buy' }
        ]);
        inline_key.push([{ text: '🔙 Back', callback_data: 'to_start' }]);

        const options = {
            reply_markup: {
                inline_keyboard: inline_key
            }
        };
        await this.bot.sendMessage(userId, 'Setting for new position creating', options);
        await this.userService.update(userId, { current_panel: PANELS.P_POSITION_CREATE });
        return;
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
        await this.userService.update(userId, { current_panel: PANELS.P_WALLET });
        return;
    }

    panel_buysell = async (user: UserType) => {
        const userId = user.id;
        const sw = user.swap;
        const token = sw.token;
        const amount = sw.amount;
        const gasprice = user.setting.sell_gasprice;
        const slippage = user.setting.sell_slippage;
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
        w_msg = w_msg + "\n\n<b>🔥 Gas Price: " + gasprice + "</b>"
        w_msg = w_msg + "\n<b>🚧 Slippage: " + slippage + "%</b>"
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
        // inline_key.push([
        //     { text: '🔥 Gas Price (' + gasprice + ')', callback_data: 'buysell_gasprice' },
        //     { text: '🚧 Slippage (' + slippage + '%)', callback_data: 'buysell_slippage' }
        // ]);
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
        await this.userService.update(userId, { current_panel: PANELS.P_SWAP });
        return;
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
        await this.userService.update(userId, { current_panel: PANELS.P_TRANSFER });
        return;
    }



    // start panel
    sendStartSelectOption = async (user: UserType) => {
        const userId = user.id;
        var inline_key = [];
        inline_key.push([
            { text: 'Buy', callback_data: 'position_list_create' },
            { text: 'Sell & Manage', callback_data: 'call_m_positions' },
        ]);
        inline_key.push([
            { text: 'Wallet', callback_data: 'call_m_wallet' },
            { text: 'Setting', callback_data: 'call_m_setting' }
        ]);
        inline_key.push([
            { text: 'Transfer', callback_data: 'call_m_transfer' },
            { text: 'Auto Trade', callback_data: 'call_m_autotrade' },
        ]);
        inline_key.push([
            { text: 'My Referrals', callback_data: 'call_m_referrals' },
            { text: 'Exchange', url: 'https://t.me/depyxyz_bot' }
        ]);
        if (ADMINS.includes(userId)) {
            inline_key.push([
                { text: 'Manage Reward Fee', callback_data: 'admin_manage_referral_type' },
            ]);
        }

        //inline_key.push();
        //inline_key.push();
        const options = {
            reply_markup: {
                inline_keyboard: inline_key
            }
        };
        const welcome_msg = "Welcome to Super Seiyan Bot! \n\n" +
            "🔥 Start Guide \n" +
            "Tap Wallet to create a new wallet and deposit SEI to get start!\n\n" +
            "🛠 Setting  \n" +
            "Tap Setting to preset your Buy & Sell setting, minimum 0.5 Gas and 0.5% Slippage. 0.5 Gas = 0.05 SEI\n\n" +
            "⚡️ Trade \n" +
            "Paste Token address, set SEI amount, Buy!  \n\n" +
            "💰 Rewards \n" +
            "Tap Referral to start invite your friend to trade, you can earn up to 30% referral volume fees from our program!\n\n" +
            "🧬 Exchange \n" +
            "Tap Exchange to bridge swap any token from any chain to SEI\n\n" +
            "Ultra Instinct Trading Bot on SEI Network\n";
        await this.bot.sendMessage(userId, welcome_msg, options);
        return;
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

        if (current_panel == PANELS.P_SWAP) {
            await this.panel_buysell(user)
        } else if (current_panel == PANELS.P_TRANSFER) {
            await this.panel_transfer(user)
        } else if (current_panel == PANELS.P_POSITION_CREATE) {
            await this.panel_postion_list(user)
        } else if (current_panel == PANELS.P_POSITION_MANAGE) {
            // await this.panel_postion_list(user)
        } else {

        }
        return;
        // await this.sendStartSelectOption(userId)
    }

    referralRewardMsg = async (userId: string, amount: string) => {
        // const options = { parse_mode: "HTML" };
        // await this.bot.sendMessage(userId, "<b>✨✨✨ Congrateration! ✨✨✨</b>\n", options);
        // await this.bot.sendMessage(userId, "<b>💰 You got some referral reward(" + amount + "SEI) from service 💰 </b> \n", options);
        // await this.bot.sendMessage(userId, "<b>📢 We will transfer to you again based on your referral user's transaction(0.15%)</b> \n\n", options);
    }




    // this.bot.sendMessage(userId, 💡 'Please select an option:', options 
    // ➰ ™️ ♻️ 💲 💱 〰️ 🔆 🔅 🌱 🌳 🌴 🌲🌼🌻🌺🌸🤸 🚴🧚🔥🚧
    // ⌛⏰💎🔋⌨️🖨️💿📗📙📒📕🏷️📝🔒🛡️⚙️🔗🥇🏆 🥈🥉🧩🎯🔙
    // 💰 💸🚀👁️‍🗨️💯📈🆕🔄🧺🗑️📊🔎💊🔴🔵🟢🟡🟠✈️🔑🔐🧷🤩🎉🧧✨☹️
    // ❌ ✅ 📌 🏦 ℹ️ 📍  💳 ⛽️  🕐 🔗); 🎲 🏀 🌿 💬 🔔 📢 ✔️ ⭕ 🔱
}
