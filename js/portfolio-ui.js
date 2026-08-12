/**
 * js/portfolio-ui.js — 组合分析页面的 UI 交互逻辑
 */

(function () {
  "use strict";

  let assetMeta = {}; // symbol → {name, type, market, currency}

  // ---- 初始化 ----

  async function init() {
    const list = await DataLoader.getAvailableAssets();
    // 过滤掉基金（缺少数据）
    const usable = list.filter((a) => a.type !== "fund");
    assetMeta = {};
    usable.forEach((a) => { assetMeta[a.symbol] = a; });

    // 填充下拉列表
    const corrSel = document.getElementById("corr-asset-select");
    const dcaSel = document.getElementById("dca-asset-select");
    const stressSel = document.getElementById("stress-asset-select");

    [corrSel, dcaSel, stressSel].forEach((sel) => {
      if (!sel) return;
      sel.innerHTML = "";
      usable.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.symbol;
        opt.textContent = `${a.symbol} ${a.name || ""}`;
        sel.appendChild(opt);
      });
    });

    // 默认选中上证/沪深300/创业板
    if (corrSel) {
      ["sh000001", "sh000300", "sz399006"].forEach((s) => {
        const opt = corrSel.querySelector(`option[value="${s}"]`);
        if (opt) opt.selected = true;
      });
    }
  }

  // ---- 加载单个资产价格 ----

  async function loadAssetPrices(symbol) {
    try {
      const meta = assetMeta[symbol];
      if (!meta) return null;
      const data = await DataLoader.loadAssetData(symbol, meta.type);
      if (!data || !data.data || data.data.length === 0) return null;
      return {
        symbol,
        name: meta.name || symbol,
        type: meta.type,
        prices: data.data.map((d) => d.price),
        dates: data.data.map((d) => d.date),
      };
    } catch (e) {
      return null;
    }
  }

  // ====================================================================
  // 第 1 节：相关性矩阵
  // ====================================================================

  window.runCorrelation = async function () {
    const sel = document.getElementById("corr-asset-select");
    const selected = Array.from(sel.selectedOptions).map((o) => o.value);
    if (selected.length < 2) {
      document.getElementById("heatmap-container").innerHTML =
        '<p class="warn-msg">请至少选择 2 项资产</p>';
      return;
    }
    if (selected.length > 8) {
      document.getElementById("heatmap-container").innerHTML =
        '<p class="warn-msg">最多支持 8 项资产</p>';
      return;
    }

    document.getElementById("heatmap-container").innerHTML =
      '<p class="info-msg">正在加载数据…</p>';

    const results = [];
    for (const s of selected) {
      const r = await loadAssetPrices(s);
      if (r) results.push(r);
    }

    if (results.length < 2) {
      document.getElementById("heatmap-container").innerHTML =
        '<p class="error-msg">数据加载失败，请重试</p>';
      return;
    }

    const priceArrays = results.map((r) => r.prices);
    const labels = results.map((r) => r.symbol);
    const corr = PortfolioEngine.correlationMatrix(priceArrays, labels);

    if (!corr.matrix.length) {
      document.getElementById("heatmap-container").innerHTML =
        '<p class="error-msg">数据不足，无法计算相关性</p>';
      return;
    }

    drawHeatmap(corr.labels, corr.matrix);
    renderCorrTable(corr.labels, corr.matrix);
  };

  function drawHeatmap(labels, matrix) {
    const n = labels.length;
    const container = document.getElementById("heatmap-container");

    const canvas = document.createElement("canvas");
    const size = Math.min(520, window.innerWidth - 40);
    canvas.width = size;
    canvas.height = size;
    container.innerHTML = "";
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const margin = 40;
    const cellW = (size - margin * 2) / n;
    const cellH = (size - margin * 2) / n;

    // 背景
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);

    // 标签
    ctx.fillStyle = "#555";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      ctx.fillText(labels[i], margin - 6, margin + i * cellH + cellH / 2);
    }
    ctx.save();
    ctx.translate(0, 0);
    for (let j = 0; j < n; j++) {
      ctx.save();
      ctx.translate(margin + j * cellW + cellW / 2, margin - 8);
      ctx.rotate(-0.5);
      ctx.fillStyle = "#555";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(labels[j], 0, 0);
      ctx.restore();
    }

    // 单元格
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const val = matrix[i][j];
        const x = margin + j * cellW;
        const y = margin + i * cellH;
        // 颜色：正相关红色，负相关蓝色
        let r, g, b;
        if (val >= 0) {
          r = 220; g = Math.round(220 - val * 140); b = Math.round(220 - val * 140);
        } else {
          b = 220; g = Math.round(220 + val * 140); r = Math.round(220 + val * 140);
        }
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

        ctx.fillStyle = val > 0.35 || val < -0.35 ? "#fff" : "#333";
        ctx.font = `${Math.min(13, cellW * 0.5)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(val.toFixed(2), x + cellW / 2, y + cellH / 2);
      }
    }
  }

  function renderCorrTable(labels, matrix) {
    const legend = document.getElementById("corr-legend");
    let html = '<table class="stress-table" style="max-width:100%;margin-top:12px;">';
    html += "<tr><th></th>";
    labels.forEach((l) => { html += `<th>${l}</th>`; });
    html += "</tr>";
    for (let i = 0; i < matrix.length; i++) {
      html += `<tr><td><strong>${labels[i]}</strong></td>`;
      for (let j = 0; j < matrix[i].length; j++) {
        const val = matrix[i][j];
        const cls = i !== j && Math.abs(val) > 0.5
          ? (val > 0 ? 'style="color:#c62828;font-weight:600"' : 'style="color:#1565c0;font-weight:600"')
          : '';
        html += `<td ${cls}>${val.toFixed(2)}</td>`;
      }
      html += "</tr>";
    }
    html += "</table>";
    legend.innerHTML = html;
  }

  // ====================================================================
  // 第 2 节：定投回测
  // ====================================================================

  window.runDCA = async function () {
    const symbol = document.getElementById("dca-asset-select").value;
    const amount = parseFloat(document.getElementById("dca-amount").value) || 1000;

    if (!symbol) {
      document.getElementById("dca-result").innerHTML =
        '<p class="warn-msg">请选择一项资产</p>';
      return;
    }

    document.getElementById("dca-result").innerHTML =
      '<p class="info-msg">正在回测…</p>';

    const data = await loadAssetPrices(symbol);
    if (!data) {
      document.getElementById("dca-result").innerHTML =
        '<p class="error-msg">数据加载失败</p>';
      return;
    }

    const prices = data.prices;
    const si = 0;
    const ei = prices.length - 1;
    const dca = PortfolioEngine.dcaBacktest(prices, amount, si, ei);
    const cmp = PortfolioEngine.dcaVsLumpSum(prices, amount, si, ei);

    // 结果卡片
    let html = '<div class="result-grid">';

    html += `<div class="result-card">
      <div class="r-label">定投总投入</div>
      <div class="r-value">¥${dca.totalInvested.toLocaleString("zh-CN", {maximumFractionDigits:0})}</div>
    </div>`;
    html += `<div class="result-card">
      <div class="r-label">定投终值</div>
      <div class="r-value">¥${dca.finalValue.toLocaleString("zh-CN", {maximumFractionDigits:0})}</div>
    </div>`;
    html += `<div class="result-card">
      <div class="r-label">定投收益率</div>
      <div class="r-value ${dca.totalReturn >= 0 ? 'positive' : 'negative'}">${(dca.totalReturn * 100).toFixed(1)}%</div>
      <div class="r-sub">年化 ${(dca.annualizedReturn * 100).toFixed(1)}% · ${dca.yearsHeld.toFixed(1)}年</div>
    </div>`;
    html += `<div class="result-card">
      <div class="r-label">一次性投入</div>
      <div class="r-value ${cmp.lumpSum.return >= 0 ? 'positive' : 'negative'}">${(cmp.lumpSum.return * 100).toFixed(1)}%</div>
      <div class="r-sub">终值 ¥${cmp.lumpSum.finalValue.toLocaleString("zh-CN", {maximumFractionDigits:0})}</div>
    </div>`;
    html += `<div class="result-card">
      <div class="r-label">定投笔数</div>
      <div class="r-value">${dca.tradesCount}</div>
      <div class="r-sub">每笔 ¥${amount.toLocaleString()}</div>
    </div>`;

    html += "</div>";

    // 结论
    const winner = cmp.winner === "dca" ? "定投" : "一次性投入";
    const diff = Math.abs(dca.finalValue - cmp.lumpSum.finalValue);
    html += `<p style="margin-top:12px;font-size:13px;color:#555;">
      回测期 ${dca.yearsHeld.toFixed(1)} 年：<strong>${winner}</strong> 最终价值更高，
      相差 ¥${diff.toLocaleString("zh-CN", {maximumFractionDigits:0})}。
    </p>`;

    document.getElementById("dca-result").innerHTML = html;

    // 图表
    drawDCAChart(prices, dca, cmp, data.dates, amount);
  };

  function drawDCAChart(prices, dca, cmp, dates, amount) {
    const container = document.getElementById("chart-dca");
    container.innerHTML = "";

    const canvas = document.createElement("canvas");
    canvas.width = 700; canvas.height = 360;
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    const w = 700, h = 360;
    const margin = { top: 30, right: 20, bottom: 40, left: 60 };
    const pw = w - margin.left - margin.right;
    const ph = h - margin.top - margin.bottom;

    // 背景
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);

    // 计算范围
    const n = prices.length;
    const allVals = prices.concat(dca.trades.map((t) => t.cumulativeShares * t.price));
    const yMin = Math.min(...allVals) * 0.9;
    const yMax = Math.max(...allVals) * 1.1;

    function xScale(i) { return margin.left + (i / (n - 1)) * pw; }
    function yScale(v) { return margin.top + ph - ((v - yMin) / (yMax - yMin)) * ph; }

    // 网格
    ctx.strokeStyle = "#f0f0f0"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (ph * i) / 4;
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
    }

    // 价格线
    ctx.strokeStyle = "#1565c0"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(prices[0]));
    for (let i = 1; i < n; i++) {
      ctx.lineTo(xScale(i), yScale(prices[i]));
    }
    ctx.stroke();

    // 定投买入点
    dca.trades.forEach((t) => {
      ctx.fillStyle = "#ff6f00";
      ctx.beginPath();
      ctx.arc(xScale(t.index), yScale(t.price), 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 坐标轴
    ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(margin.left, margin.top); ctx.lineTo(margin.left, h - margin.bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(margin.left, h - margin.bottom); ctx.lineTo(w - margin.right, h - margin.bottom); ctx.stroke();

    // Y 轴标签
    ctx.fillStyle = "#888"; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const val = yMin + ((yMax - yMin) * i) / 4;
      ctx.fillText(val.toFixed(2), margin.left - 6, margin.top + ph - (ph * i) / 4 + 4);
    }

    // 图例
    ctx.fillStyle = "#1565c0"; ctx.fillRect(margin.left, margin.top - 20, 12, 12);
    ctx.fillStyle = "#333"; ctx.font = "12px sans-serif"; ctx.textAlign = "left";
    ctx.fillText("资产价格", margin.left + 16, margin.top - 7);

    ctx.fillStyle = "#ff6f00";
    ctx.beginPath();
    ctx.arc(margin.left + 80, margin.top - 14, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#333";
    ctx.fillText("定投买入点", margin.left + 88, margin.top - 7);

    // 标题
    ctx.fillStyle = "#333"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("定投回测 — 资产价格与买入时机", w / 2, margin.top - 26);
  }

  // ====================================================================
  // 第 3 节：压力测试
  // ====================================================================

  window.runStress = async function () {
    const symbol = document.getElementById("stress-asset-select").value;
    if (!symbol) {
      document.getElementById("stress-result").innerHTML =
        '<p class="warn-msg">请选择一项资产</p>';
      return;
    }

    document.getElementById("stress-result").innerHTML =
      '<p class="info-msg">正在分析…</p>';

    const data = await loadAssetPrices(symbol);
    if (!data) {
      document.getElementById("stress-result").innerHTML =
        '<p class="error-msg">数据加载失败</p>';
      return;
    }

    const result = PortfolioEngine.stressTest(data.prices, data.dates);
    if (!result) {
      document.getElementById("stress-result").innerHTML =
        '<p class="error-msg">数据不足</p>';
      return;
    }

    let html = `<div class="result-grid">
      <div class="result-card">
        <div class="r-label">当前价格</div>
        <div class="r-value">${result.currentPrice.toFixed(2)}</div>
      </div>
      <div class="result-card">
        <div class="r-label">历史最大回撤</div>
        <div class="r-value negative">${(result.historicalMaxDrawdown.value * 100).toFixed(1)}%</div>
      </div>
    </div>`;

    html += '<table class="stress-table" style="margin-top:12px;">';
    html += `<tr>
      <th>历史情景</th>
      <th>描述</th>
      <th>指数跌幅</th>
      <th>预估资产跌幅</th>
      <th>预估价格</th>
      <th>预估损失</th>
    </tr>`;
    result.scenarios.forEach((s) => {
      html += `<tr>
        <td><strong>${s.name}</strong></td>
        <td style="font-size:12px;color:#888;">${s.description}</td>
        <td class="decline">${(s.indexDecline * 100).toFixed(0)}%</td>
        <td class="decline">${(s.estimatedDecline * 100).toFixed(0)}%</td>
        <td>${s.estimatedPrice.toFixed(2)}</td>
        <td class="loss">-${Math.abs(s.estimatedLoss).toFixed(2)}</td>
      </tr>`;
    });
    html += "</table>";

    html += `<p style="margin-top:8px;font-size:12px;color:#999;">
      注：资产跌幅按指数跌幅×1.2 估算（保守），实际个股/ETF 波动可能更大。
    </p>`;

    document.getElementById("stress-result").innerHTML = html;
  };

  // ---- 启动 ----
  init();
})();
