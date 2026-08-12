/**
 * js/chart-renderer.js — 轻量 Canvas 图表渲染器
 * 
 * 零依赖，纯 Canvas 2D 实现。
 * 支持折线图、面积图，响应式缩放。
 */

const ChartRenderer = (function () {
  "use strict";

  /** 创建 Canvas 并绑定到容器 */
  function createCanvas(container, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    container.innerHTML = "";
    container.appendChild(canvas);
    return canvas;
  }

  /** 高 DPI 适配 */
  function setupHiDPI(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    return { width: rect.width, height: rect.height };
  }

  /**
   * 绘制折线图
   * @param {string} containerId
   * @param {{labels: string[], datasets: {label: string, data: number[], color: string}[]}} chartData
   * @param {{width?: number, height?: number, yLabel?: string, percentFormat?: boolean}} options
   */
  function lineChart(containerId, chartData, options) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const opts = Object.assign(
      {
        width: container.clientWidth || 600,
        height: 300,
        yLabel: "",
        percentFormat: false,
      },
      options || {}
    );

    const canvas = createCanvas(container, opts.width, opts.height);
    const ctx = canvas.getContext("2d");
    const d = setupHiDPI(canvas, ctx);
    const W = d.width;
    const H = d.height;

    const pad = { top: 20, right: 20, bottom: 40, left: 60 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    // 找出所有数据的全局 min/max
    let allValues = [];
    chartData.datasets.forEach((ds) => {
      allValues = allValues.concat(ds.data.filter((v) => v != null));
    });
    if (allValues.length === 0) return;
    let yMin = Math.min(...allValues);
    let yMax = Math.max(...allValues);
    // 留 5% 边距
    const yRange = yMax - yMin || 1;
    yMin -= yRange * 0.05;
    yMax += yRange * 0.05;

    const labels = chartData.labels;
    const n = labels.length;
    if (n < 2) return;

    // 背景
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, W, H);

    // 网格线 + Y轴标签
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 0.5;
    ctx.fillStyle = "#888";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";

    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const yVal = yMin + (yMax - yMin) * (i / yTicks);
      const y = pad.top + plotH * (1 - i / yTicks);
      // 网格线
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      // Y 标签
      const label = opts.percentFormat
        ? (yVal * 100).toFixed(1) + "%"
        : yVal > 10
          ? yVal.toFixed(0)
          : yVal.toFixed(2);
      ctx.fillText(label, pad.left - 8, y + 4);
    }
    ctx.textAlign = "center";

    // X 轴标签（最多显示 6 个）
    const xStep = Math.max(1, Math.floor(n / 6));
    ctx.fillStyle = "#888";
    ctx.font = "10px -apple-system, sans-serif";
    for (let i = 0; i < n; i += xStep) {
      const x = pad.left + (i / (n - 1)) * plotW;
      ctx.fillText(labels[i], x, H - pad.bottom + 16);
    }

    // 裁剪区域
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();

    // 绘制每条线
    chartData.datasets.forEach((ds) => {
      if (!ds.data || ds.data.length < 2) return;
      ctx.strokeStyle = ds.color || "#2196f3";
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 0; i < ds.data.length; i++) {
        if (ds.data[i] == null) continue;
        const x = pad.left + (i / (ds.data.length - 1)) * plotW;
        const y = pad.top + plotH * (1 - (ds.data[i] - yMin) / (yMax - yMin));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    ctx.restore();

    // 图例
    const legendY = pad.top - 2;
    let legendX = pad.left;
    chartData.datasets.forEach((ds) => {
      if (!ds.label) return;
      ctx.fillStyle = ds.color || "#2196f3";
      ctx.fillRect(legendX, legendY, 12, 3);
      ctx.fillStyle = "#555";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(ds.label, legendX + 16, legendY + 8);
      legendX += ctx.measureText(ds.label).width + 28;
    });
  }

  /**
   * 绘制柱状图（用于对比）
   */
  function barChart(containerId, chartData, options) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const opts = Object.assign(
      {
        width: container.clientWidth || 600,
        height: 300,
        colorPositive: "#4caf50",
        colorNegative: "#f44336",
      },
      options || {}
    );

    const canvas = createCanvas(container, opts.width, opts.height);
    const ctx = canvas.getContext("2d");
    const d = setupHiDPI(canvas, ctx);
    const W = d.width;
    const H = d.height;

    const pad = { top: 20, right: 20, bottom: 60, left: 60 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const labels = chartData.labels;
    const values = chartData.datasets[0]?.data || [];
    const n = labels.length;
    if (n === 0) return;

    const yMax = Math.max(...values.map(Math.abs)) * 1.15 || 1;

    // 背景
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, W, H);

    // 零线
    const zeroY = pad.top + plotH / 2;
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(W - pad.right, zeroY);
    ctx.stroke();

    // 柱子
    const barWidth = Math.max(4, (plotW / n) * 0.7);
    const gap = plotW / n;

    for (let i = 0; i < n; i++) {
      const barH = (Math.abs(values[i]) / yMax) * (plotH / 2);
      const x = pad.left + gap * i + (gap - barWidth) / 2;
      const y = values[i] >= 0 ? zeroY - barH : zeroY;
      ctx.fillStyle = values[i] >= 0 ? opts.colorPositive : opts.colorNegative;
      ctx.fillRect(x, y, barWidth, barH || 1);
    }

    // X 轴标签
    ctx.fillStyle = "#888";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i < n; i++) {
      const x = pad.left + gap * i + gap / 2;
      // 旋转标签以防重叠
      ctx.save();
      ctx.translate(x, H - pad.bottom + 14);
      ctx.rotate(-0.4);
      ctx.fillText(labels[i], 0, 0);
      ctx.restore();
    }
  }

  return { lineChart, barChart, createCanvas };
})();
