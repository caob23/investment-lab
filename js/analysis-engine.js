/**
 * js/analysis-engine.js — 资产分析计算引擎
 * 
 * 所有计算均为纯函数，输入价格数组，输出分析指标。
 * 严格遵守：无未来函数、无预测、仅基于已有数据。
 * 
 * 数据格式：{date: "YYYY-MM-DD", price: number}[]
 */

const AnalysisEngine = (function () {
  "use strict";

  // 中国 A 股交易日约 244 天/年，简化用 252（国际惯例）
  const TRADING_DAYS = 252;
  // 无风险利率（默认 2.5%，可配置）
  const DEFAULT_RISK_FREE_RATE = 0.025;

  // ---- 基础计算 ----

  /**
   * 日收益率序列
   * @param {number[]} prices
   * @returns {number[]} 长度 = prices.length - 1
   */
  function dailyReturns(prices) {
    const rets = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] === 0 || prices[i - 1] == null) {
        rets.push(0);
      } else {
        rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
    }
    return rets;
  }

  /**
   * 累计收益序列（从第1天起）
   * @param {number[]} prices
   * @returns {number[]} 长度 = prices.length
   */
  function cumulativeReturns(prices) {
    if (prices.length === 0) return [];
    const base = prices[0];
    return prices.map((p) => (p - base) / base);
  }

  // ---- 统计工具 ----

  function mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function std(arr, avg) {
    if (arr.length < 2) return 0;
    const m = avg != null ? avg : mean(arr);
    const sqDiffs = arr.map((v) => (v - m) ** 2);
    return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (arr.length - 1));
  }

  // ---- 核心指标 ----

  /**
   * 年化收益率
   * 公式：(期末/期初)^(1/年数) - 1
   */
  function annualizedReturn(prices) {
    if (prices.length < 2) return null;
    const years = (prices.length - 1) / TRADING_DAYS;
    if (years <= 0) return null;
    return Math.pow(prices[prices.length - 1] / prices[0], 1 / years) - 1;
  }

  /**
   * 年化波动率
   * 公式：std(日收益率) × sqrt(252)
   */
  function annualizedVolatility(prices) {
    const rets = dailyReturns(prices);
    if (rets.length < 2) return null;
    return std(rets) * Math.sqrt(TRADING_DAYS);
  }

  /**
   * 最大回撤
   * @returns {{mdd: number, peakIdx: number, troughIdx: number}}
   */
  function maxDrawdown(prices) {
    if (prices.length < 2) return { mdd: 0, peakIdx: 0, troughIdx: 0 };
    let peak = prices[0];
    let peakIdx = 0;
    let mdd = 0;
    let troughIdx = 0;
    let mddPeakIdx = 0;

    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > peak) {
        peak = prices[i];
        peakIdx = i;
      }
      const dd = (peak - prices[i]) / peak;
      if (dd > mdd) {
        mdd = dd;
        troughIdx = i;
        mddPeakIdx = peakIdx;
      }
    }
    return { mdd, peakIdx: mddPeakIdx, troughIdx };
  }

  /**
   * 夏普比率
   * 公式：(年化收益 - 无风险利率) / 年化波动率
   * @param {number} riskFreeRate 默认 0.025
   */
  function sharpeRatio(prices, riskFreeRate) {
    const rf = riskFreeRate != null ? riskFreeRate : DEFAULT_RISK_FREE_RATE;
    const annRet = annualizedReturn(prices);
    const annVol = annualizedVolatility(prices);
    if (annRet == null || annVol == null || annVol === 0) return null;
    return (annRet - rf) / annVol;
  }

  /**
   * 滚动最大回撤序列（用于绘制回撤曲线）
   * 每天算一次"到当天为止的最大回撤"
   */
  function rollingDrawdowns(prices) {
    const result = [];
    if (prices.length === 0) return result;
    let peak = prices[0];
    for (let i = 0; i < prices.length; i++) {
      if (prices[i] > peak) peak = prices[i];
      result.push((peak - prices[i]) / peak);
    }
    return result;
  }

  /**
   * 回撤恢复天数（从最大回撤的谷底到回到前高所需天数）
   * 如果从未恢复，返回 null
   */
  function recoveryDays(prices, troughIdx, peakPrice) {
    for (let i = troughIdx + 1; i < prices.length; i++) {
      if (prices[i] >= peakPrice) {
        return i - troughIdx;
      }
    }
    return null;
  }

  /**
   * 胜率 / 盈亏比
   */
  function winLossStats(prices) {
    const rets = dailyReturns(prices);
    if (rets.length === 0) return { winRate: 0, totalDays: 0, avgGain: 0, avgLoss: 0 };
    const up = rets.filter((r) => r > 0);
    const down = rets.filter((r) => r < 0);
    return {
      totalDays: rets.length,
      upDays: up.length,
      downDays: down.length,
      winRate: rets.length > 0 ? up.length / rets.length : 0,
      avgGain: up.length > 0 ? mean(up) : 0,
      avgLoss: down.length > 0 ? mean(down) : 0,
    };
  }

  // ---- 综合分析 ----

  /**
   * 对单资产执行完整分析
   * @param {{date: string, price: number}[]} data
   * @param {{riskFreeRate?: number}} options
   */
  function analyze(data, options) {
    const opts = options || {};
    const rf = opts.riskFreeRate != null ? opts.riskFreeRate : DEFAULT_RISK_FREE_RATE;

    if (!data || data.length < 2) {
      return {
        insufficient: true,
        message: `数据不足（仅 ${data ? data.length : 0} 条），无法进行分析。至少需要 2 个数据点。`,
      };
    }

    const prices = data.map((d) => d.price);
    const dates = data.map((d) => d.date);
    const rets = dailyReturns(prices);
    const cumRets = cumulativeReturns(prices);
    const mdd = maxDrawdown(prices);
    const winLoss = winLossStats(prices);
    const annRet = annualizedReturn(prices);
    const annVol = annualizedVolatility(prices);
    const sharpe = sharpeRatio(prices, rf);
    const recovery = recoveryDays(prices, mdd.troughIdx, prices[mdd.peakIdx]);

    return {
      insufficient: false,
      dataPoints: data.length,
      dateRange: { start: dates[0], end: dates[dates.length - 1] },
      years: ((data.length - 1) / TRADING_DAYS).toFixed(1),

      annualizedReturn: annRet != null ? annRet : null,
      annualizedVolatility: annVol != null ? annVol : null,
      sharpeRatio: sharpe != null ? sharpe : null,
      maxDrawdown: {
        value: mdd.mdd,
        peakDate: dates[mdd.peakIdx],
        troughDate: dates[mdd.troughIdx],
        recoveryDays: recovery,
      },
      winLoss: winLoss,

      // 序列数据（供图表使用）
      series: {
        dates: dates,
        prices: prices,
        dailyReturns: rets,
        cumulativeReturns: cumRets,
        rollingDrawdowns: rollingDrawdowns(prices),
      },
    };
  }

  /**
   * 多资产对比（仅计算年化收益/波动/夏普/最大回撤）
   * @param {{symbol: string, name: string, data: {date, price}[]}[]} assets
   */
  function compare(assets, options) {
    return assets.map((a) => {
      const result = analyze(a.data, options);
      return {
        symbol: a.symbol,
        name: a.name,
        insufficient: result.insufficient,
        message: result.message || "",
        dataPoints: result.dataPoints,
        annualizedReturn: result.annualizedReturn,
        annualizedVolatility: result.annualizedVolatility,
        sharpeRatio: result.sharpeRatio,
        maxDrawdown: result.maxDrawdown ? result.maxDrawdown.value : null,
      };
    });
  }

  // ---- 公共 API ----
  return {
    TRADING_DAYS,
    DEFAULT_RISK_FREE_RATE,
    dailyReturns,
    cumulativeReturns,
    annualizedReturn,
    annualizedVolatility,
    maxDrawdown,
    sharpeRatio,
    rollingDrawdowns,
    winLossStats,
    analyze,
    compare,
  };
})();
