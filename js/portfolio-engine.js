/**
 * js/portfolio-engine.js — 组合分析引擎
 *
 * 纯函数，输入多资产价格数据，输出：
 * - 相关性矩阵
 * - 定投回测
 * - 再平衡模拟
 * - 压力测试
 */

const PortfolioEngine = (function () {
  "use strict";

  const TRADING_DAYS = 252;

  // ---- 工具函数 ----

  function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function std(arr, avg) {
    if (!arr || arr.length < 2) return 0;
    const m = avg != null ? avg : mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
  }

  /** 提取日收益率序列 */
  function toReturns(prices) {
    const rets = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] === 0) { rets.push(0); continue; }
      rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return rets;
  }

  // ---- 相关性矩阵 ----

  /**
   * Pearson 相关系数矩阵
   * @param {number[][]} priceArrays — 多个资产的价格数组
   * @returns {{labels: string[], matrix: number[][]}}
   */
  function correlationMatrix(priceArrays, labels) {
    const n = priceArrays.length;
    if (n < 2) return { labels: labels || [], matrix: [] };

    // 对齐日期：取所有资产价格的最小长度
    const minLen = Math.min(...priceArrays.map((p) => p.length));
    if (minLen < 3) return { labels: labels || [], matrix: [] };

    const returnsList = priceArrays.map((prices) =>
      toReturns(prices.slice(-minLen))
    );

    const matrix = [];
    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1;
          continue;
        }
        // 对齐长度
        const len = Math.min(returnsList[i].length, returnsList[j].length);
        const ri = returnsList[i].slice(-len);
        const rj = returnsList[j].slice(-len);
        const mi = mean(ri);
        const mj = mean(rj);
        let cov = 0, si = 0, sj = 0;
        for (let k = 0; k < len; k++) {
          const di = ri[k] - mi;
          const dj = rj[k] - mj;
          cov += di * dj;
          si += di * di;
          sj += dj * dj;
        }
        const denom = Math.sqrt(si * sj);
        matrix[i][j] = denom === 0 ? 0 : cov / denom;
      }
    }

    return { labels: labels || priceArrays.map((_, i) => `资产${i + 1}`), matrix };
  }

  // ---- 定投回测 ----

  /**
   * 定投回测
   * @param {number[]} prices — 日价格序列
   * @param {number} monthlyAmount — 每月投入金额
   * @param {number} startIndex — 起始索引
   * @param {number} endIndex — 结束索引
   * @returns {{totalInvested, finalValue, totalReturn, shares, trades: []}}
   */
  function dcaBacktest(prices, monthlyAmount, startIndex, endIndex) {
    if (!prices || prices.length < 2) return null;

    const si = Math.max(0, startIndex || 0);
    const ei = Math.min(prices.length - 1, endIndex || prices.length - 1);
    if (si >= ei) return null;

    let shares = 0;
    let totalInvested = 0;
    const trades = [];
    // 约 21 个交易日/月
    const MONTH_INTERVAL = 21;

    for (let i = si; i <= ei; i += MONTH_INTERVAL) {
      const price = prices[i];
      if (price <= 0) continue;
      const bought = monthlyAmount / price;
      shares += bought;
      totalInvested += monthlyAmount;
      trades.push({ index: i, price, shares: bought, cumulativeShares: shares });
    }

    const finalPrice = prices[ei];
    const finalValue = shares * finalPrice;
    const totalReturn = totalInvested > 0 ? (finalValue - totalInvested) / totalInvested : 0;

    // 年化
    const yearsHeld = (ei - si) / TRADING_DAYS;
    const annualizedReturn = yearsHeld > 0
      ? Math.pow(finalValue / totalInvested, 1 / yearsHeld) - 1
      : 0;

    return {
      totalInvested,
      finalValue,
      totalReturn,
      annualizedReturn,
      shares,
      trades,
      tradesCount: trades.length,
      yearsHeld,
      startIndex: si,
      endIndex: ei,
    };
  }

  /**
   * 定投 vs 一次性投入对比
   */
  function dcaVsLumpSum(prices, monthlyAmount, startIndex, endIndex) {
    const dca = dcaBacktest(prices, monthlyAmount, startIndex, endIndex);
    if (!dca) return null;

    const si = startIndex || 0;
    const ei = endIndex || prices.length - 1;
    const lumpAmount = dca.totalInvested;
    const lumpShares = prices[si] > 0 ? lumpAmount / prices[si] : 0;
    const lumpFinal = lumpShares * prices[ei];
    const lumpReturn = lumpAmount > 0 ? (lumpFinal - lumpAmount) / lumpAmount : 0;

    return {
      dca: {
        invested: dca.totalInvested,
        finalValue: dca.finalValue,
        return: dca.totalReturn,
        annualized: dca.annualizedReturn,
      },
      lumpSum: {
        invested: lumpAmount,
        finalValue: lumpFinal,
        return: lumpReturn,
        annualized: Math.pow(lumpFinal / lumpAmount, 1 / dca.yearsHeld) - 1,
      },
      winner: dca.finalValue > lumpFinal ? "dca" : "lumpSum",
      yearsHeld: dca.yearsHeld,
    };
  }

  // ---- 再平衡模拟 ----

  /**
   * 多资产再平衡模拟
   * @param {number[][]} priceArrays — 多个资产价格
   * @param {number[]} weights — 目标权重（如 [0.6, 0.4]）
   * @param {number} rebalanceInterval — 再平衡间隔（交易日数，默认 63≈季度）
   * @returns {{cumulativeValues: number[], finalValue, totalReturn}}
   */
  function rebalanceSimulation(priceArrays, weights, rebalanceInterval) {
    const n = priceArrays.length;
    if (n < 2 || weights.length !== n) return null;
    if (weights.reduce((a, b) => a + b, 0) > 1.01 || weights.reduce((a, b) => a + b, 0) < 0.99) return null;

    const minLen = Math.min(...priceArrays.map((p) => p.length));
    if (minLen < 2) return null;

    const interval = rebalanceInterval || 63; // 约每季度
    let holdings = weights.map(() => 0);
    let cash = 0;
    // 初始化：投入 1 单位
    const initialTotal = 1;
    for (let i = 0; i < n; i++) {
      holdings[i] = (initialTotal * weights[i]) / priceArrays[i][0];
    }

    const values = [];
    for (let t = 0; t < minLen; t++) {
      // 计算当前组合价值
      let totalValue = 0;
      for (let i = 0; i < n; i++) {
        totalValue += holdings[i] * priceArrays[i][t];
      }
      values.push(totalValue);

      // 再平衡
      if (t > 0 && t % interval === 0 && t < minLen - 1) {
        for (let i = 0; i < n; i++) {
          const targetValue = totalValue * weights[i];
          holdings[i] = targetValue / priceArrays[i][t];
        }
      }
    }

    return {
      cumulativeValues: values,
      finalValue: values[values.length - 1],
      totalReturn: values[values.length - 1] - initialTotal,
      annualizedReturn: Math.pow(values[values.length - 1] / initialTotal, 1 / (minLen / TRADING_DAYS)) - 1,
      rebalanceCount: Math.floor((minLen - 1) / interval),
    };
  }

  // ---- 压力测试 ----

  /**
   * 历史极端情景定义
   */
  const STRESS_SCENARIOS = {
    "2008-金融危机": {
      description: "2008年全球金融危机，A股最大跌幅约70%",
      period: "2007-10-16 ~ 2008-11-04",
      indexDecline: -0.72,
      duration: 253,
    },
    "2015-股灾": {
      description: "2015年A股股灾，上证从5178跌至2850",
      period: "2015-06-12 ~ 2015-08-26",
      indexDecline: -0.45,
      duration: 53,
    },
    "2018-贸易战": {
      description: "2018年中美贸易战，全年阴跌",
      period: "2018-01-24 ~ 2019-01-03",
      indexDecline: -0.32,
      duration: 233,
    },
    "2020-疫情冲击": {
      description: "2020年新冠疫情全球爆发",
      period: "2020-01-14 ~ 2020-03-23",
      indexDecline: -0.16,
      duration: 44,
    },
    "2022-熊市": {
      description: "2022年美联储加息 + 疫情反复",
      period: "2021-12-13 ~ 2022-10-31",
      indexDecline: -0.22,
      duration: 218,
    },
  };

  /**
   * 对单资产执行压力测试
   * 在历史数据中查找最大回撤区间，模拟对应比例的下跌
   */
  function stressTest(prices, dates) {
    if (!prices || prices.length < 10) return null;

    // 找出历史最大回撤
    let peak = prices[0], peakIdx = 0;
    let mdd = 0, troughIdx = 0, mddPeakIdx = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > peak) { peak = prices[i]; peakIdx = i; }
      const dd = (peak - prices[i]) / peak;
      if (dd > mdd) { mdd = dd; troughIdx = i; mddPeakIdx = peakIdx; }
    }

    const currentPrice = prices[prices.length - 1];
    const peakPrice = prices[prices.length - 1]; // 当前视为峰值

    // 模拟：如果当前发生类似幅度的下跌
    const scenarios = Object.entries(STRESS_SCENARIOS).map(([name, s]) => ({
      name,
      description: s.description,
      indexDecline: s.indexDecline,
      // 假设资产与指数同幅度下跌（保守估计，个股波动更大）
      estimatedDecline: Math.max(s.indexDecline * 1.2, -0.99), // 个股乘以1.2倍，底限-99%
      estimatedPrice: currentPrice * (1 + Math.max(s.indexDecline * 1.2, -0.99)),
      estimatedLoss: currentPrice * Math.abs(Math.max(s.indexDecline * 1.2, -0.99)),
      durationDays: s.duration,
    }));

    return {
      currentPrice,
      historicalMaxDrawdown: {
        value: mdd,
        peakDate: dates ? dates[mddPeakIdx] : "",
        troughDate: dates ? dates[troughIdx] : "",
      },
      scenarios,
    };
  }

  /**
   * 组合压力测试：对多个资产同时应用压力情景
   */
  function portfolioStressTest(assetNames, priceArrays, weights) {
    const n = priceArrays.length;
    if (n === 0 || !weights || weights.length !== n) return null;

    const currentPrices = priceArrays.map((p) => p[p.length - 1]);
    const totalCurrent = currentPrices.reduce((sum, p, i) => sum + p * weights[i], 0);

    const allScenarios = Object.entries(STRESS_SCENARIOS).map(([name, s]) => {
      // 每个资产按情景下跌
      let totalAfter = 0;
      const assetImpacts = [];
      for (let i = 0; i < n; i++) {
        const decline = Math.max(s.indexDecline * 1.2, -0.99);
        const newPrice = currentPrices[i] * (1 + decline);
        totalAfter += newPrice * weights[i];
        assetImpacts.push({
          name: assetNames[i],
          before: currentPrices[i],
          after: newPrice,
          decline: decline,
        });
      }
      return {
        name,
        description: s.description,
        portfolioBefore: totalCurrent,
        portfolioAfter: totalAfter,
        portfolioDecline: (totalAfter - totalCurrent) / totalCurrent,
        assetImpacts,
      };
    });

    return { currentValue: totalCurrent, scenarios: allScenarios };
  }

  // ---- 公共 API ----
  return {
    correlationMatrix,
    dcaBacktest,
    dcaVsLumpSum,
    rebalanceSimulation,
    stressTest,
    portfolioStressTest,
    STRESS_SCENARIOS,
    TRADING_DAYS,
  };
})();
