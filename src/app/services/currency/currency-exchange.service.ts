import { Injectable } from '@angular/core';
import { from, Observable, of, Subject, timer } from 'rxjs';
import {
  catchError,
  delayWhen,
  map,
  retryWhen,
  switchMap,
  takeUntil,
} from 'rxjs/operators';
import { generalConfigurations, priceOracles } from 'src/app/configurations';

@Injectable({
  providedIn: 'root',
})
export class CurrencyExchangeService {
  ethUsdPriceOraclesList = priceOracles;

  binanceQueryResultParse(payload) {
    const newPrices = {};
    if (payload === false) {
      return newPrices;
    }
    for (const t of payload) {
      newPrices[t.symbol] = {
        ticker: t.symbol.toUpperCase(),
        price: parseFloat(t.price).toFixed(8),
      };
    }
    return newPrices;
  }

  poloniexQueryResultParse(payload) {
    const newPrices = {};
    if (payload === false) {
      return newPrices;
    }
    const pricesContained = payload;
    const priceTickerKeys = Object.keys(pricesContained);
    for (const k of priceTickerKeys) {
      const t = pricesContained[k];
      const normalizedTicker = k.replace('_', '').toUpperCase();
      newPrices[normalizedTicker] = {
        ticker: normalizedTicker,
        price: parseFloat(t.last).toFixed(8),
      };
    }
    return newPrices;
  }

  huobiQueryResultParse(payload) {
    const newPrices = {};
    if (payload === false) {
      return newPrices;
    }
    for (const t of payload.data) {
      newPrices[t.symbol] = {
        ticker: t.symbol.toUpperCase(),
        price: t.ask.toFixed(8),
      };
    }
    return newPrices;
  }

  cryptoCompareQueryResultParse(payload) {
    const newPrices = {};
    if (payload === false) {
      return newPrices;
    }
    const pricesContained = payload;
    return pricesContained;
  }

  selectOracle(oracleKey) {
    const oracles = {
      CRYPTO_COMPARE: this.cryptoCompareQueryResultParse,
      BINANCE: this.binanceQueryResultParse,
      POLONIEX: this.poloniexQueryResultParse,
      HUOBI: this.huobiQueryResultParse,
    };
    return oracles[oracleKey];
  }

  findEthUsdPairInOracle = (oracleKey) => {
    const oracles = {
      CRYPTO_COMPARE: 'USD',
      BINANCE: 'ETHUSDT',
      POLONIEX: 'TUSD_ETH',
      HUOBI: 'ethusdc',
    };
    return oracles[oracleKey];
  };

  getEthUsdPrice() {
    const oracles = Object.values(this.ethUsdPriceOraclesList);
    const oracleKeys = Object.keys(this.ethUsdPriceOraclesList);
    let isResolved = new Subject<boolean>();
    let oracleToResolve = 0;
    return of(oracles).pipe(
      takeUntil(isResolved),
      switchMap((o) => {
        return from(fetch(o[oracleToResolve]));
      }),

      switchMap((r) => {
        if (r === undefined) {
          throw false;
        }
        return of(r.json());
      }),
      switchMap((result) => {
        const i = oracleToResolve;
        const oKey = oracleKeys[i];
        return this.selectOracle(oKey)(result);
      }),
      switchMap((parsedResult) => {
        const i = oracleToResolve;
        const oKey = oracleKeys[i];
        const ethUsdPrice = parsedResult[this.findEthUsdPairInOracle(oKey)];
        isResolved.next(false);
        return of(ethUsdPrice);
      }),
      retryWhen((error) =>
        error.pipe(
          delayWhen((e) => {
            oracleToResolve++;
            if (oracleToResolve >= oracles.length - 1) {
              oracleToResolve = 0;
            }
            return timer(500);
          })
        )
      )
    );
  }
}
