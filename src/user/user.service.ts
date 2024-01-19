import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument } from './user.schema';



@Injectable()
export class UserService {

  constructor(
    @InjectModel('user') private readonly model: Model<UserDocument>,
  ) { }

  async create(data: any) {
    const id = data.id;
    const user = await this.model.findOne({ id: id }).exec();
    if (!user) {
      return await new this.model({ ...data }).save();
    }
  }

  async findAll() {
    return await this.model.find().exec();
  }

  async findOne(id: string) {
    const user = await this.model.findOne({ id }).exec();
    return user
  }

  async update(id: string, data) {
    return await this.model.findOneAndUpdate({ id: id }, data, { new: true }).exec()
  }

  async updateReferral(code: string, u_code: string, me_id: string) {
    const user = await this.model.findOne({ code }).exec();
    var referral = user.referral;
    if (!referral.includes(u_code) && user.code != u_code) {
      referral.push(u_code);
    }
    const id = user.id;
    await this.model.findOneAndUpdate({ id }, { referral }, { new: true }).exec();
    await this.model.findOneAndUpdate({ id: me_id }, { inviter: code })
  }

  // yet not used
  async findUserBySniper(contract: string) {
    const users = await this.model.find().exec();
    const _users = [];
    users.forEach((u) => {
      if (u.sniper.contract.toLowerCase() == contract.toLowerCase()) {
        var wallet = []
        wallet.push(u.wallet.key)
        const user = {
          id: u.id,
          contract: u.sniper.contract.toLowerCase(),
          buyamount: u.sniper.buyamount,
          gasprice: u.sniper.gasprice,
          slippage: u.sniper.slippage,
          wallet: wallet,
          autobuy: u.sniper.autobuy,
          autosell: u.sniper.autosell,
          startprice: u.sniper.startprice,
          sellrate: u.sniper.sellrate,
          sold: u.sniper.sold,
          private: u.sniper.private
        }
        _users.push(user);
      }
    })
    return _users;
  }



}
