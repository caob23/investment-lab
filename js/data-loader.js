/**
 * js/data-loader.js — 数据加载器
 * 
 * 从 data/ 目录加载资产列表和历史数据。
 * 支持缓存避免重复请求。
 */

const DataLoader = (function () {
  "use strict";

  const DATA_BASE = "data";
  let _assetList = null;
  let _cache = {}; // { filename: assetData }

  /**
   * 加载资产列表索引
   * @returns {Promise<Array>}
   */
  async function loadAssetList() {
    if (_assetList) return _assetList;
    try {
      const resp = await fetch(`${DATA_BASE}/assets.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      _assetList = await resp.json();
      return _assetList;
    } catch (e) {
      console.error("加载资产列表失败:", e);
      return [];
    }
  }

  /**
   * 加载单个资产历史数据
   * @param {string} symbolOrFilename — 如 "index_000300" 或 "000300"
   * @param {string} assetType — "index" / "stock" / "etf" / "fund"
   */
  async function loadAssetData(symbolOrFilename, assetType) {
    let filename;
    if (symbolOrFilename.includes("_")) {
      filename = symbolOrFilename;
    } else {
      filename = `${assetType}_${symbolOrFilename}`;
    }

    if (_cache[filename]) return _cache[filename];

    try {
      const resp = await fetch(`${DATA_BASE}/history/${filename}.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      _cache[filename] = data;
      return data;
    } catch (e) {
      console.error(`加载 ${filename} 失败:`, e);
      return null;
    }
  }

  /**
   * 按资产类型筛选列表
   */
  async function getAssetsByType(assetType) {
    const list = await loadAssetList();
    return list.filter((a) => a.type === assetType && a.status === "ok");
  }

  /**
   * 获取所有可用资产（仅 status=ok）
   */
  async function getAvailableAssets() {
    const list = await loadAssetList();
    return list.filter((a) => a.status === "ok");
  }

  /** 清除缓存 */
  function clearCache() {
    _cache = {};
    _assetList = null;
  }

  return {
    loadAssetList,
    loadAssetData,
    getAssetsByType,
    getAvailableAssets,
    clearCache,
  };
})();
