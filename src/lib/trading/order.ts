import * as types from '../type';
import { ApiHandler } from '../api-handler';
import { logger, Helper } from '../common';
import { Storage } from '../storage';

const clc = require('cli-color');
export class Order extends ApiHandler {

  private worker = 0;
  storage: Storage;

  constructor(storage: Storage) {
    super();
    this.storage = storage;
  }

  async orderA(exchange: types.IExchange, testTrade: types.ITradeTriangle) {
    try {
      const timer = Helper.getTimer();
      // 已下单时跳过
      if (!testTrade.a.orderId) {
        // 获取交易额度
        logger.info(`first step：${clc.blueBright(testTrade.a.pair)}`);
        testTrade.a.timecost = '';
        logger.info(`Limit price：${testTrade.a.price}, Quantity：${testTrade.a.amount}, direction：${testTrade.a.side}`);
        const order = <types.IOrder>{
          symbol: testTrade.a.pair,
          side: testTrade.a.side.toLowerCase(),
          type: 'market',
          price: testTrade.a.price,
          amount: testTrade.a.amount,
        };
        const orderInfo = await this.createOrder(exchange, order);
        if (!orderInfo) {
          return;
        }
        logger.debug(`Order return value: ${JSON.stringify(orderInfo, null, 2)}`);

        testTrade.a.status = orderInfo.status;
        testTrade.a.orderId = orderInfo.id;

        // 更新队列
        await this.storage.updateTradingSession(testTrade, 0);
      }
      const nextB = async () => {
        logger.info('Executing next B...');
        const orderRes = await this.queryOrder(exchange, testTrade.a.orderId, testTrade.a.pair);
        if (!orderRes) {
          return false;
        }
        logger.info(`Query order status： ${orderRes.status}`);
        // 交易成功时
        if (orderRes.status === 'closed') {
          testTrade.a.timecost = Helper.endTimer(timer);
          // 修正数量
          testTrade.a.amount = orderRes.amount;
          testTrade.a.status = orderRes.status;
          // 更新队列
          await this.storage.updateTradingSession(testTrade, 0);

          if (this.worker) {
            clearInterval(this.worker);
          }
          await this.orderB(exchange, testTrade);
          return true;
        }
        return false;
      };

      // 订单未成交时
      if (!await nextB()) {
        logger.info('The order is not filled and is executed cyclically every second.');
        this.worker = setInterval(nextB.bind(this), 1000);
      }
    } catch (err) {
      const errMsg = err.message ? err.message : err.msg;
      logger.error(`Order A error： ${errMsg}`);
      await this.errorHandle(testTrade.queueId, errMsg);
    }
  }

  async orderB(exchange: types.IExchange, trade: types.ITradeTriangle) {
    try {
      const timer = Helper.getTimer();
      const tradeB = trade.b;
      // 已下单时跳过
      if (!tradeB.orderId) {

        logger.info(`Second step：${clc.blueBright(trade.b.pair)}`);
        logger.info(`Limit price：${tradeB.price}, Quantity：${tradeB.amount}, direction：${tradeB.side}`);
        const order = <types.IOrder>{
          symbol: tradeB.pair,
          side: tradeB.side.toLowerCase(),
          type: 'market',
          price: tradeB.price,
          amount: tradeB.amount,
        };
        const orderInfo = await this.createOrder(exchange, order);
        if (!orderInfo) {
          return;
        }
        logger.debug(`Order return value: ${JSON.stringify(orderInfo, null, 2)}`);

        trade.b.status = <any>orderInfo.status;
        trade.b.orderId = orderInfo.id;
        // 更新队列
        await this.storage.updateTradingSession(trade, 1);
      }
      const nextC = async () => {
        logger.info('Executing next C...');

        const orderRes = await this.queryOrder(exchange, tradeB.orderId, tradeB.pair);
        if (!orderRes) {
          return false;
        }
        logger.info(`Query order status： ${orderRes.status}`);
        // 交易成功时
        if (orderRes.status === 'closed') {
          if (this.worker) {
            clearInterval(this.worker);
          }
          trade.b.timecost = Helper.endTimer(timer);
          // 修正数量
          trade.b.amount = orderRes.amount;
          trade.b.status = orderRes.status;
          // 更新队列
          await this.storage.updateTradingSession(trade, 1);
          await this.orderC(exchange, trade);
          return true;
        }
        return false;
      };

      // 订单未成交时
      if (!await nextC()) {
        logger.info('The order is not filled and is executed cyclically every second.');
        this.worker = setInterval(nextC.bind(this), 1000);
      }
    } catch (err) {
      const errMsg = err.message ? err.message : err.msg;
      logger.error(`Order B error： ${errMsg}`);
      await this.errorHandle(trade.queueId, errMsg);
    }
  }

  async orderC(exchange: types.IExchange, trade: types.ITradeTriangle) {
    try {
      const timer = Helper.getTimer();
      const tradeC = trade.c;
      // 已下单时跳过
      if (!tradeC.orderId) {
        logger.info(`third step：${clc.blueBright(trade.c.pair)}`);
        logger.info(`Limit price：${tradeC.price}, Quantity：${tradeC.amount}, direction：${tradeC.side}`);
        if (tradeC.side.toLowerCase() === 'sell' && tradeC.amount > trade.b.amount) {
          tradeC.amount = trade.b.amount;
        }
        const order = <types.IOrder>{
          symbol: tradeC.pair,
          side: tradeC.side.toLowerCase(),
          type: 'market',
          price: tradeC.price,
          amount: tradeC.amount,
        };
        const orderInfo = await this.createOrder(exchange, order);
        if (!orderInfo) {
          return;
        }
        logger.debug(`Order return value: ${JSON.stringify(orderInfo, null, 2)}`);

        trade.c.status = orderInfo.status;
        trade.c.orderId = orderInfo.id;
        // 更新队列
        await this.storage.updateTradingSession(trade, 2);
      }
      const completedC = async () => {
        logger.info('completed C...');
        const orderRes = await this.queryOrder(exchange, tradeC.orderId, tradeC.pair);
        if (!orderRes) {
          return false;
        }
        logger.info(`Query order status： ${orderRes.status}`);
        // 交易成功时
        if (orderRes.status === 'closed') {
          if (this.worker) {
            clearInterval(this.worker);
          }
          logger.info(`Triangular arbitrage is completed and finally obtained：${orderRes.amount}...`);
          trade.c.timecost = Helper.endTimer(timer);
          // 修正数量
          trade.c.amount = orderRes.amount;
          trade.c.status = orderRes.status;
          // 在交易队列中清除这条数据
          await this.storage.closeTradingSession(trade);
        }
        return false;
      };

      // 订单未成交时
      if (!await completedC()) {
        logger.info('The order is not filled and is executed cyclically every second.');
        this.worker = setInterval(completedC.bind(this), 1000);
      }
    } catch (err) {
      const errMsg = err.message ? err.message : err.msg;
      logger.error(`Order C error： ${errMsg}`);
      await this.errorHandle(trade.queueId, errMsg);
    }
  }

  private async errorHandle(queueId: string, error: string) {
    const res: types.IQueue = <any>await this.storage.queue.get(queueId);
    res.error = error;
    await this.storage.queue.updateQueue(res);
  }
}
