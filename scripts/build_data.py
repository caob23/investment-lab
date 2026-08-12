"""
scripts/build_data.py — 数据构建脚本

在 fetch_data.py 之后运行，负责：
1. 对原始数据进行标准化处理（排序、去重、补全）
2. 生成前端可直接使用的简化 JSON
3. 更新 assets.json 索引
"""

import json
import os
import sys
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

DATA_DIR = os.path.join(PROJECT_ROOT, "data")
HISTORY_DIR = os.path.join(DATA_DIR, "history")


def normalize_asset(filepath: str) -> dict | None:
    """标准化单个资产文件：排序、去重、补齐必要字段。"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            asset = json.load(f)
    except Exception as e:
        print(f"  [跳过] 无法读取 {filepath}: {e}")
        return None

    data = asset.get("data", [])
    if not data:
        return asset

    # 按日期排序
    data.sort(key=lambda x: x.get("date", ""))

    # 去重（保留最后一个）
    seen_dates = {}
    for point in data:
        seen_dates[point["date"]] = point
    deduped = list(seen_dates.values())
    deduped.sort(key=lambda x: x["date"])

    asset["data"] = deduped
    asset["data_start"] = deduped[0]["date"]
    asset["data_end"] = deduped[-1]["date"]

    # 补齐缺失字段
    asset.setdefault("name", asset.get("symbol", ""))
    asset.setdefault("type", "unknown")
    asset.setdefault("market", "CN")
    asset.setdefault("currency", "CNY")
    asset.setdefault("source", "")

    return asset


def main():
    print("=" * 50)
    print("长期投资实验室 — 数据构建")
    print("=" * 50)

    if not os.path.isdir(HISTORY_DIR):
        print("history 目录不存在，请先运行 fetch_data.py")
        return 1

    files = sorted(os.listdir(HISTORY_DIR))
    json_files = [f for f in files if f.endswith(".json")]

    if not json_files:
        print("没有找到数据文件。")
        return 0

    for fname in json_files:
        fpath = os.path.join(HISTORY_DIR, fname)
        normalized = normalize_asset(fpath)
        if normalized:
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(normalized, f, ensure_ascii=False, indent=2)
            print(f"  {fname}: {len(normalized['data'])} 条数据 "
                  f"({normalized['data_start']} ~ {normalized['data_end']})")

    print(f"\n完成: 处理 {len(json_files)} 个文件")
    return 0


if __name__ == "__main__":
    sys.exit(main())
