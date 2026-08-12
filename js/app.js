/* ============================================
   长期投资实验室 — 全局应用逻辑
   ============================================ */

(function () {
  'use strict';

  /* 当前 Phase 1，app.js 提供全局工具基础。
     后续 Phase 会扩展导航、数据加载等功能。 */

  // 工具：安全的 DOM 选择
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  // 工具：格式化数字（千分位 + 两位小数）
  function formatMoney(value) {
    return Number(value).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // 工具：格式化百分比
  function formatPct(value, decimals = 2) {
    return Number(value).toFixed(decimals) + '%';
  }

  // 暴露到全局
  window.App = {
    $,
    $$,
    formatMoney,
    formatPct
  };
})();
