/**
 * js/analysis-ui.js — 分析页面交互逻辑
 * 
 * 桥接 DataLoader / AnalysisEngine / ChartRenderer
 */

(function () {
  "use strict";

  let currentMode = "single";

  // ---- 模式切换 ----
  window.switchMode = function (mode) {
    currentMode = mode;
    document.getElementById("tab-single").classList.toggle("active", mode === "single");
    document.getElementById("tab-compare").classList.toggle("active", mode === "compare");
    document.getElementById("mode-single").style.display = mode === "single" ? "block" : "none";
    document.getElementById("mode-compare").style.display = mode === "compare" ? "block" : "none";
    if (mode === "single") onTypeChange();
    if (mode === "compare") onCompareTypeChange();
  };

  // ---- 单资产模式 ----

  async function onTypeChange() {
    const type = document.getElementById("asset-type-select").value;
    const sel = document.getElementById("asset-select");
    sel.innerHTML = '<option value="">-- 加载中 --</option>';

    try {
      const assets = await DataLoader.getAssetsByType(type);
      sel.innerHTML = '<option value="">-- 请选择 --</option>';
      assets.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.type + "_" + a.symbol;
        opt.textContent = `${a.name || a.symbol} (${a.symbol})`;
        if (a.data_points) opt.textContent += ` · ${a.data_points}条`;
        sel.appendChild(opt);
      });
    } catch (e) {
      sel.innerHTML = '<option value="">-- 加载失败 --</option>';
    }
  }
  window.onTypeChange = onTypeChange;

  async function runAnalysis() {
    const sel = document.getElementById("asset-select");
    const filename = sel.value;
    if (!filename) return;

    const [assetType, symbol] = filename.split("_", 2);
    const btn = document.getElementById("btn-analyze");
    btn.disabled = true;
    btn.textContent = "分析中...";

    try {
      const data = await DataLoader.loadAssetData(symbol, assetType);
      if (!data || !data.data || data.data.length < 2) {
        showError("metrics-single", "数据不足，无法分析。");
        return;
      }

      const rfInput = document.getElementById("rf-rate");
      const rf = parseFloat(rfInput.value) / 100;
      const result = AnalysisEngine.analyze(data.data, { riskFreeRate: isNaN(rf) ? 0.025 : rf });

      if (result.insufficient) {
        showError("metrics-single", result.message);
        return;
      }

      renderMetrics(result, data);
      renderCharts(result);
    } catch (e) {
      console.error(e);
      showError("metrics-single", "分析出错: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "开始分析";
    }
  }
  window.runAnalysis = runAnalysis;

  function renderMetrics(result, assetData) {
    const container = document.getElementById("metrics-single");
    const fmtPct = (v) => v != null ? (v * 100).toFixed(2) + "%" : "—";
    const fmtNum = (v, d) => v != null ? v.toFixed(d) : "—";

    const cards = [
      { label: "资产名称", value: assetData.name || assetData.symbol, cls: "", sub: `${assetData.symbol} · ${result.dataPoints}条数据` },
      { label: "年化收益率", value: fmtPct(result.annualizedReturn), cls: (result.annualizedReturn || 0) >= 0 ? "positive" : "negative", sub: `${result.dateRange.start} ~ ${result.dateRange.end}` },
      { label: "年化波动率", value: fmtPct(result.annualizedVolatility), cls: "", sub: "标准差 × √252" },
      { label: "夏普比率", value: fmtNum(result.sharpeRatio, 2), cls: (result.sharpeRatio || 0) >= 1 ? "positive" : (result.sharpeRatio || 0) < 0 ? "negative" : "", sub: result.sharpeRatio >= 2 ? "优秀" : result.sharpeRatio >= 1 ? "良好" : result.sharpeRatio >= 0 ? "一般" : "负收益" },
      { label: "最大回撤", value: fmtPct(result.maxDrawdown.value), cls: "negative", sub: `${result.maxDrawdown.peakDate} → ${result.maxDrawdown.troughDate}` },
      { label: "上涨天数", value: result.winLoss.upDays + "天", cls: "positive", sub: `胜率 ${(result.winLoss.winRate * 100).toFixed(1)}%` },
      { label: "下跌天数", value: result.winLoss.downDays + "天", cls: "negative", sub: `平均跌幅 ${fmtPct(result.winLoss.avgLoss)}` },
      { label: "恢复天数", value: result.maxDrawdown.recoveryDays != null ? result.maxDrawdown.recoveryDays + "天" : "未恢复", cls: "", sub: "回撤谷底回到前高" },
    ];

    container.innerHTML = cards
      .map(
        (c) =>
          `<div class="metric-card">
            <div class="label">${c.label}</div>
            <div class="value ${c.cls}">${c.value}</div>
            <div class="sub">${c.sub}</div>
          </div>`
      )
      .join("");
  }

  function renderCharts(result) {
    const s = result.series;

    // 累计收益曲线
    if (s.cumulativeReturns && s.cumulativeReturns.length > 1) {
      ChartRenderer.lineChart("chart-cumulative", {
        labels: s.dates,
        datasets: [{ label: "累计收益", data: s.cumulativeReturns, color: "#1565c0" }],
      }, { percentFormat: true });
    }

    // 滚动回撤
    if (s.rollingDrawdowns && s.rollingDrawdowns.length > 1) {
      ChartRenderer.lineChart("chart-drawdown", {
        labels: s.dates,
        datasets: [{ label: "回撤", data: s.rollingDrawdowns.map((v) => -v), color: "#c62828" }],
      }, { percentFormat: true, yLabel: "回撤" });
    }

    // 日收益率分布（柱状图）
    if (s.dailyReturns && s.dailyReturns.length > 1) {
      ChartRenderer.barChart("chart-returns", {
        labels: s.dates.slice(1),
        datasets: [{ label: "日收益率", data: s.dailyReturns, color: "#4caf50" }],
      });
    }
  }

  function showError(containerId, msg) {
    document.getElementById(containerId).innerHTML = `<div class="error-msg">${msg}</div>`;
  }

  // ---- 多资产对比模式 ----

  async function onCompareTypeChange() {
    const type = document.getElementById("compare-type-select").value;
    const sel = document.getElementById("compare-asset-select");
    sel.innerHTML = '<option value="">-- 加载中 --</option>';

    try {
      const assets = await DataLoader.getAssetsByType(type);
      sel.innerHTML = "";
      assets.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.type + "_" + a.symbol;
        opt.textContent = `${a.name || a.symbol} (${a.symbol})`;
        sel.appendChild(opt);
      });
    } catch (e) {
      sel.innerHTML = '<option value="">-- 加载失败 --</option>';
    }
  }
  window.onCompareTypeChange = onCompareTypeChange;

  async function runCompare() {
    const sel = document.getElementById("compare-asset-select");
    const selected = Array.from(sel.selectedOptions).map((o) => o.value);

    if (selected.length === 0) return;
    if (selected.length > 6) {
      showError("compare-table", "最多选择 6 项进行对比。");
      return;
    }

    const btn = document.getElementById("btn-compare");
    btn.disabled = true;
    btn.textContent = "对比中...";

    try {
      const rfInput = document.getElementById("rf-rate");
      const rf = parseFloat(rfInput.value) / 100;

      // 并行加载所有选中资产
      const promises = selected.map(async (filename) => {
        const [assetType, symbol] = filename.split("_", 2);
        const data = await DataLoader.loadAssetData(symbol, assetType);
        return { symbol, name: data?.name || symbol, data: data?.data || [] };
      });

      const assets = await Promise.all(promises);
      const validAssets = assets.filter((a) => a.data && a.data.length >= 2);

      if (validAssets.length === 0) {
        showError("compare-table", "所选资产均无有效数据。");
        return;
      }

      const results = AnalysisEngine.compare(validAssets, {
        riskFreeRate: isNaN(rf) ? 0.025 : rf,
      });

      renderCompareTable(results);
      renderCompareChart(validAssets);
    } catch (e) {
      console.error(e);
      showError("compare-table", "对比出错: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "对比分析";
    }
  }
  window.runCompare = runCompare;

  function renderCompareTable(results) {
    const headers = ["资产", "数据量", "年化收益", "年化波动", "夏普比率", "最大回撤"];
    const fmtPct = (v) => (v != null ? (v * 100).toFixed(2) + "%" : "—");
    const fmtNum = (v) => (v != null ? v.toFixed(2) : "—");

    let html = "<thead><tr>" + headers.map((h) => `<th>${h}</th>`).join("") + "</tr></thead><tbody>";

    results.forEach((r) => {
      const retCls = (r.annualizedReturn || 0) >= 0 ? "positive" : "negative";
      html += `<tr>
        <td><strong>${r.name}</strong></td>
        <td>${r.dataPoints || "—"}</td>
        <td class="${retCls}">${fmtPct(r.annualizedReturn)}</td>
        <td>${fmtPct(r.annualizedVolatility)}</td>
        <td>${fmtNum(r.sharpeRatio)}</td>
        <td class="negative">${fmtPct(r.maxDrawdown)}</td>
      </tr>`;
    });

    html += "</tbody>";
    document.getElementById("compare-table").innerHTML = html;
  }

  function renderCompareChart(assets) {
    const colors = ["#1565c0", "#c62828", "#2e7d32", "#f57f17", "#6a1b9a", "#00695c"];
    const datasets = assets.map((a, i) => ({
      label: a.name,
      data: AnalysisEngine.cumulativeReturns(a.data.map((d) => d.price)),
      color: colors[i % colors.length],
    }));

    // 使用第一个资产的时间轴
    const labels = assets[0].data.map((d) => d.date);

    ChartRenderer.lineChart("chart-compare-cumulative", {
      labels: labels,
      datasets: datasets,
    }, { percentFormat: true });
  }

  // ---- 初始化 ----
  document.addEventListener("DOMContentLoaded", () => {
    onTypeChange();
  });
})();
