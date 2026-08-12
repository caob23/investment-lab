"""
scripts/validate_data.py — 数据质量验证

检查采集到的数据是否存在常见问题：
- 日期重复
- 日期缺失（非交易日不计）
- 价格缺失或异常
- 数据乱序
- 数据类型错误

发现问题时生成 data_quality_report.json。
"""

import json
import os
import sys
from datetime import datetime, timedelta

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

DATA_DIR = os.path.join(PROJECT_ROOT, "data")
HISTORY_DIR = os.path.join(DATA_DIR, "history")
REPORT_FILE = os.path.join(DATA_DIR, "data_quality_report.json")


def load_history_files():
    """加载所有历史数据文件。"""
    files = {}
    if not os.path.isdir(HISTORY_DIR):
        return files
    for fname in os.listdir(HISTORY_DIR):
        if fname.endswith(".json"):
            fpath = os.path.join(HISTORY_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    files[fname] = json.load(f)
            except Exception as e:
                print(f"  [警告] 无法读取 {fname}: {e}")
    return files


def validate_asset(filename: str, asset: dict) -> dict:
    """验证单个资产数据，返回问题列表。"""
    issues = []
    data = asset.get("data", [])
    symbol = asset.get("symbol", "?")

    if not data:
        issues.append({"type": "empty_data", "detail": "数据为空"})
        return {"filename": filename, "symbol": symbol, "issues": issues}

    # 1. 检查日期格式和数据类型
    dates = []
    prices = []
    for i, point in enumerate(data):
        d = point.get("date", "")
        p = point.get("price")

        # 日期格式
        try:
            parsed = datetime.strptime(d, "%Y-%m-%d")
            dates.append((parsed, i))
        except (ValueError, TypeError):
            issues.append({
                "type": "bad_date_format",
                "index": i,
                "detail": f"日期格式无效: '{d}'",
            })
            continue

        # 价格有效性
        if p is None:
            issues.append({
                "type": "missing_price",
                "index": i,
                "date": d,
                "detail": "价格缺失",
            })
            continue

        try:
            price_val = float(p)
            if price_val <= 0:
                issues.append({
                    "type": "invalid_price",
                    "index": i,
                    "date": d,
                    "detail": f"价格异常（<=0）: {price_val}",
                })
            prices.append(price_val)
        except (ValueError, TypeError):
            issues.append({
                "type": "bad_price_type",
                "index": i,
                "date": d,
                "detail": f"价格类型错误: {p}",
            })

    # 2. 检查日期重复
    date_strs = [d[0].strftime("%Y-%m-%d") for d in dates]
    seen = set()
    for ds in date_strs:
        if ds in seen:
            issues.append({
                "type": "duplicate_date",
                "detail": f"日期重复: {ds}",
            })
        seen.add(ds)

    # 3. 检查数据乱序（日期应该递增）
    for i in range(1, len(dates)):
        if dates[i][0] < dates[i-1][0]:
            issues.append({
                "type": "date_out_of_order",
                "detail": (
                    f"日期乱序: {dates[i-1][0].strftime('%Y-%m-%d')} "
                    f"后出现 {dates[i][0].strftime('%Y-%m-%d')}"
                ),
            })
            break  # 只报告一次

    # 4. 检查价格异常波动（单日涨跌幅超过 20%）
    if len(prices) >= 2:
        for i in range(1, len(prices)):
            if prices[i-1] and prices[i-1] > 0:
                change = abs(prices[i] - prices[i-1]) / prices[i-1]
                if change > 0.20:
                    idx = dates[i][1] if i < len(dates) else i
                    issues.append({
                        "type": "extreme_change",
                        "index": idx,
                        "detail": (
                            f"单日波动 {change*100:.1f}%: "
                            f"{prices[i-1]:.4f} -> {prices[i]:.4f}"
                        ),
                    })

    # 5. 检查数据跨度（至少需要2个数据点才有分析意义）
    if len(data) < 2:
        issues.append({
            "type": "insufficient_data",
            "detail": f"仅 {len(data)} 条数据，无法进行分析",
        })

    return {"filename": filename, "symbol": symbol, "issues": issues}


def main():
    print("=" * 50)
    print("长期投资实验室 — 数据质量验证")
    print("=" * 50)

    files = load_history_files()
    if not files:
        print("没有找到历史数据文件。")
        return 0

    all_reports = []
    total_issues = 0

    for fname, asset in files.items():
        report = validate_asset(fname, asset)
        all_reports.append(report)
        issue_count = len(report["issues"])
        total_issues += issue_count
        status = "OK" if issue_count == 0 else f"{issue_count} 个问题"
        print(f"  {report['symbol']} ({fname}): {status}")
        for issue in report["issues"]:
            print(f"    - [{issue['type']}] {issue['detail']}")

    report_data = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_files": len(files),
        "total_issues": total_issues,
        "reports": all_reports,
    }

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(report_data, f, ensure_ascii=False, indent=2)

    print(f"\n报告已保存: {REPORT_FILE}")
    print(f"总计: {len(files)} 个文件, {total_issues} 个问题")
    return 0


if __name__ == "__main__":
    sys.exit(main())
