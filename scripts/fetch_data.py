"""
scripts/fetch_data.py — 数据采集主脚本

从配置的资产列表中逐个获取历史数据，保存到 data/history/ 目录。
同时生成 data/assets.json（资产列表索引）和 data/metadata.json（数据元信息）。

用法：
    python scripts/fetch_data.py
"""

import json
import os
import sys
import time
from datetime import datetime

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from data_sources.tencent import get_default_source
from data_sources.common import AssetType, Market, AssetData

# 输出目录
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
HISTORY_DIR = os.path.join(DATA_DIR, "history")
ASSETS_FILE = os.path.join(DATA_DIR, "assets.json")
METADATA_FILE = os.path.join(DATA_DIR, "metadata.json")

# ---------- 资产清单 ----------
# 第一阶段采集的资产列表
# 后续可改为从配置文件读取

ASSETS_TO_FETCH = [
    # === 指数 ===
    {"symbol": "000300", "type": "index", "name": "沪深300"},
    {"symbol": "000905", "type": "index", "name": "中证500"},
    {"symbol": "000852", "type": "index", "name": "中证1000"},
    {"symbol": "000001", "type": "index", "name": "上证指数"},
    {"symbol": "399001", "type": "index", "name": "深证成指"},
    {"symbol": "399006", "type": "index", "name": "创业板指"},
    {"symbol": "000016", "type": "index", "name": "上证50"},
    {"symbol": "000688", "type": "index", "name": "科创50"},

    # === A股股票（示例） ===
    {"symbol": "000001", "market": "sz", "type": "stock", "name": "平安银行"},
    {"symbol": "600519", "market": "sh", "type": "stock", "name": "贵州茅台"},
    {"symbol": "000858", "market": "sz", "type": "stock", "name": "五粮液"},
    {"symbol": "300750", "market": "sz", "type": "stock", "name": "宁德时代"},
    {"symbol": "601318", "market": "sh", "type": "stock", "name": "中国平安"},

    # === ETF ===
    {"symbol": "510050", "market": "sh", "type": "etf", "name": "上证50ETF"},
    {"symbol": "510300", "market": "sh", "type": "etf", "name": "沪深300ETF"},
    {"symbol": "510500", "market": "sh", "type": "etf", "name": "中证500ETF"},
    {"symbol": "159915", "market": "sz", "type": "etf", "name": "创业板ETF"},
    {"symbol": "588000", "market": "sh", "type": "etf", "name": "科创50ETF"},

    # === 基金 ===
    {"symbol": "001512", "type": "fund", "name": "易方达中证海外互联ETF联接"},
    {"symbol": "110011", "type": "fund", "name": "易方达中小盘混合"},
    {"symbol": "161725", "type": "fund", "name": "招商中证白酒指数"},
]


def ensure_dirs():
    """确保输出目录存在。"""
    os.makedirs(HISTORY_DIR, exist_ok=True)


def fetch_one(asset_def: dict) -> AssetData | None:
    """获取单个资产的历史数据。"""
    source = get_default_source()
    symbol = asset_def["symbol"]
    atype = asset_def["type"]
    market = asset_def.get("market", "sz")

    print(f"\n[{symbol}] {asset_def.get('name', '')} ({atype})")

    try:
        if atype == "index":
            return source.get_index_history(symbol)
        elif atype == "stock":
            return source.get_stock_history(symbol, market)
        elif atype == "etf":
            return source.get_etf_history(symbol, market)
        elif atype == "fund":
            return source.get_fund_history(symbol)
    except Exception as e:
        print(f"  [错误] {e}")
        return None

    return None


def save_asset_data(asset: AssetData):
    """将资产数据保存为 JSON 文件。"""
    # 文件名：{type}_{symbol}.json
    filename = f"{asset.asset_type.value}_{asset.symbol}.json"
    filepath = os.path.join(HISTORY_DIR, filename)

    # 构建输出格式：前端友好的简化版
    output = {
        "symbol": asset.symbol,
        "name": asset.name,
        "type": asset.asset_type.value,
        "market": asset.market.value,
        "currency": asset.currency,
        "data_start": asset.data_start,
        "data_end": asset.data_end,
        "source": asset.source,
        "data": [
            {
                "date": p.date,
                "price": round(p.price, 4),
            }
            for p in asset.data
        ],
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"  -> 保存 {len(asset.data)} 条数据到 {filename}")
    return filepath


def build_assets_json(assets_meta: list[dict]):
    """生成 assets.json 资产列表索引。"""
    with open(ASSETS_FILE, "w", encoding="utf-8") as f:
        json.dump(assets_meta, f, ensure_ascii=False, indent=2)
    print(f"\n资产索引: {ASSETS_FILE} ({len(assets_meta)} 项)")


def build_metadata_json(assets_meta: list[dict], success: int, fail: int):
    """生成 metadata.json 数据元信息。"""
    metadata = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_assets": len(assets_meta),
        "fetch_success": success,
        "fetch_fail": fail,
        "data_sources": ["tencent"],
        "assets": assets_meta,
    }
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    print(f"数据元信息: {METADATA_FILE}")


def main():
    print("=" * 50)
    print("长期投资实验室 — 数据采集")
    print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    ensure_dirs()

    success_count = 0
    fail_count = 0
    assets_meta = []

    for asset_def in ASSETS_TO_FETCH:
        result = fetch_one(asset_def)

        meta_entry = {
            "symbol": asset_def["symbol"],
            "name": asset_def.get("name", ""),
            "type": asset_def["type"],
            "market": asset_def.get("market", "cn"),
        }

        if result and result.data:
            save_asset_data(result)
            meta_entry.update({
                "data_start": result.data_start,
                "data_end": result.data_end,
                "data_points": len(result.data),
                "status": "ok",
            })
            success_count += 1
            # 如果数据源返回的名称更准确，更新
            if result.name:
                meta_entry["name"] = result.name
        else:
            print(f"  [跳过] 无法获取数据")
            meta_entry["status"] = "unavailable"
            fail_count += 1

        assets_meta.append(meta_entry)

    build_assets_json(assets_meta)
    build_metadata_json(assets_meta, success_count, fail_count)

    print(f"\n完成: 成功 {success_count}, 失败 {fail_count}")
    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
