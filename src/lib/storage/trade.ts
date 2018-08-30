import * as types from '../type';
import { logger } from '../common';
import { StorageBase } from './base';
const config = require('config');

export class Trade extends StorageBase {
  static id = 'trade';

  constructor(url: string) {
    super(url + Trade.id);
  }

  async putTrades(trades: types.ITrade[]) {
    try {
      logger.debug('Deposit transaction data, size：' + trades.length);
      return await this.bulkDocs(trades);
    } catch (err) {
      logger.error(`Error storing transaction data: ${err.message}`);
    }
  }
}
