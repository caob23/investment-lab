/* ============================================
   长期投资实验室 — 计算器逻辑
   复利 / 定投 / 回撤 / 恢复 / 再平衡
   ============================================ */

(function () {
  'use strict';

  const { formatMoney, formatPct } = window.App;

  /* ---------- 复利计算器 ---------- */

  window.calcCompound = function () {
    const principal = parseFloat(document.getElementById('cp-principal').value) || 0;
    const monthly = parseFloat(document.getElementById('cp-monthly').value) || 0;
    const rate = (parseFloat(document.getElementById('cp-rate').value) || 0) / 100;
    const years = parseInt(document.getElementById('cp-years').value) || 0;

    const monthlyRate = rate / 12;
    const months = years * 12;

    // 初始本金复利
    const fvPrincipal = principal * Math.pow(1 + monthlyRate, months);
    // 每月定投年金终值
    let fvMonthly = 0;
    if (monthlyRate > 0 && monthly > 0) {
      fvMonthly = monthly * (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
    } else if (monthlyRate === 0 && monthly > 0) {
      fvMonthly = monthly * months;
    }

    const finalValue = fvPrincipal + fvMonthly;
    const totalPrincipal = principal + monthly * months;
    const gain = finalValue - totalPrincipal;
    const totalReturn = totalPrincipal > 0 ? (gain / totalPrincipal) * 100 : 0;

    document.getElementById('cp-final').textContent = formatMoney(finalValue) + ' 元';
    document.getElementById('cp-total-principal').textContent = formatMoney(totalPrincipal) + ' 元';
    document.getElementById('cp-gain').textContent = formatMoney(gain) + ' 元';
    document.getElementById('cp-total-return').textContent = formatPct(totalReturn);
    document.getElementById('cp-result').hidden = false;
  };

  /* ---------- 定投计算器 ---------- */

  window.calcDCA = function () {
    const amount = parseFloat(document.getElementById('dca-amount').value) || 0;
    const freq = document.getElementById('dca-freq').value;
    const rate = (parseFloat(document.getElementById('dca-rate').value) || 0) / 100;
    const years = parseInt(document.getElementById('dca-years').value) || 0;

    const periodsPerYear = freq === 'weekly' ? 52 : 12;
    const totalPeriods = periodsPerYear * years;
    const periodRate = rate / periodsPerYear;

    let finalValue = 0;
    if (periodRate > 0 && amount > 0) {
      finalValue = amount * (Math.pow(1 + periodRate, totalPeriods) - 1) / periodRate;
    } else if (periodRate === 0 && amount > 0) {
      finalValue = amount * totalPeriods;
    }

    const totalInvested = amount * totalPeriods;
    const gain = finalValue - totalInvested;
    const totalReturn = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;

    document.getElementById('dca-final').textContent = formatMoney(finalValue) + ' 元';
    document.getElementById('dca-total').textContent = formatMoney(totalInvested) + ' 元';
    document.getElementById('dca-gain').textContent = formatMoney(gain) + ' 元';
    document.getElementById('dca-return').textContent = formatPct(totalReturn);
    document.getElementById('dca-result').hidden = false;
  };

  /* ---------- 回撤计算器 ---------- */

  window.calcDrawdown = function () {
    const high = parseFloat(document.getElementById('dd-high').value);
    const low = parseFloat(document.getElementById('dd-low').value);

    if (!high || !low || high <= 0 || low <= 0) {
      document.getElementById('dd-output').textContent = '请输入有效的高点和低点价格。';
      document.getElementById('dd-result').hidden = false;
      return;
    }

    if (low > high) {
      document.getElementById('dd-output').textContent = '低点价格不能高于高点价格。';
      document.getElementById('dd-result').hidden = false;
      return;
    }

    const drawdown = ((high - low) / high) * 100;
    const recoverNeeded = (drawdown / (100 - drawdown)) * 100;

    document.getElementById('dd-output').innerHTML =
      '从 <strong>' + formatMoney(high) + '</strong> 下跌至 <strong>' + formatMoney(low) + '</strong>，' +
      '最大回撤：<strong>' + formatPct(drawdown) + '</strong>。' +
      '恢复至原点需要上涨：<strong>' + formatPct(recoverNeeded) + '</strong>。';
    document.getElementById('dd-result').hidden = false;
  };

  /* ---------- 再平衡计算器 ---------- */

  window.calcRebalance = function () {
    const total = parseFloat(document.getElementById('rb-total').value) || 0;
    const rows = document.querySelectorAll('#rb-assets .rb-asset-row');
    const assets = [];

    let targetSum = 0;
    rows.forEach(row => {
      const name = row.querySelector('.rb-name').value || '未命名';
      const current = parseFloat(row.querySelector('.rb-current').value) || 0;
      const target = parseFloat(row.querySelector('.rb-target').value) || 0;
      assets.push({ name, current, target });
      targetSum += target;
    });

    if (Math.abs(targetSum - 100) > 0.01) {
      document.getElementById('rb-result').innerHTML =
        '<p style="color:var(--danger)">目标比例之和必须等于 100%，当前为 ' +
        formatPct(targetSum, 1) + '。</p>';
      document.getElementById('rb-result').hidden = false;
      return;
    }

    let html = '<table class="result-table"><tr><th>资产</th><th>当前</th><th>目标</th><th>调整</th></tr>';
    assets.forEach(a => {
      const targetAmount = total * a.target / 100;
      const diff = targetAmount - a.current;
      const action = diff >= 0
        ? '<span class="rb-action-buy">买入 ' + formatMoney(Math.abs(diff)) + '</span>'
        : '<span class="rb-action-sell">卖出 ' + formatMoney(Math.abs(diff)) + '</span>';
      html += '<tr>' +
        '<td>' + a.name + '</td>' +
        '<td>' + formatMoney(a.current) + '</td>' +
        '<td>' + formatMoney(targetAmount) + ' (' + formatPct(a.target, 1) + ')</td>' +
        '<td>' + action + '</td>' +
        '</tr>';
    });
    html += '</table>';
    document.getElementById('rb-result').innerHTML = html;
    document.getElementById('rb-result').hidden = false;
  };
})();
