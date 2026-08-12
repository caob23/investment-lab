"""
data_sources/tencent.py — 腾讯行情数据源

使用腾讯公开行情接口获取股票、ETF、指数和基金数据。
接口均为公开 HTTP 端点，无需 API Key。

接口说明：
- 股票/ETF 日K线（前复权）：
  http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={market}{symbol},day,,,{count},qfq
- 基金净值：
  http://fundgz.1234567.com.cn/js/{symbol}.js
- 指数日K线（不复权）：
  http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={index_code},day,,,{count},
"""

import json
import re
import time
import urllib.request
import urllib.error
from typing import Optional

from data_sources.common import (
    AssetData, AssetMeta, AssetType, Market, DataSource, PricePoint
)

# 请求超时（秒）
REQUEST_TIMEOUT = 15
# 请求间隔（秒），避免频率限制
REQUEST_DELAY = 0.5


def _http_get(url: str) -> Optional[bytes]:
    """带超时和重试的 HTTP GET 请求。"""
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36"
                    ),
                    "Referer": "https://finance.qq.com/",
                },
            )
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                return resp.read()
        except Exception as e:
            if attempt == 2:
                print(f"  [HTTP] 请求失败（已重试3次）: {url[:80]} - {e}")
                return None
            time.sleep(1)
    return None


def _parse_tencent_kline(raw: bytes, symbol: str, name: str,
                         asset_type: AssetType, market: Market) -> Optional[AssetData]:
    """解析腾讯日K线 JSON 响应。

    腾讯接口返回格式：
    {
      "code": 0,
      "data": {
        "{market}{symbol}": {
          "qfqday": [["2025-01-02", "10.50", "10.80", "10.20", "10.60", "123456.00"], ...]
          // 或 "day"（不复权）
        }
      }
    }

    每行: [日期, 开盘, 最高, 最低, 收盘, 成交量]
    """
    try:
        text = raw.decode("gbk", errors="replace")
        # 腾讯接口返回的是 JSONP 风格的纯 JSON
        obj = json.loads(text)
    except Exception as e:
        print(f"  [解析] JSON 解析失败: {e}")
        return None

    if obj.get("code") != 0:
        print(f"  [接口] 返回 code={obj.get('code')}")
        return None

    data_block = obj.get("data", {})
    if not data_block:
        return None

    # 取第一个 key（代码对应的数据块）
    stock_key = list(data_block.keys())[0]
    stock_data = data_block[stock_key]

    # 优先取前复权数据，其次不复权
    rows = stock_data.get("qfqday") or stock_data.get("day")
    if not rows:
        print(f"  [数据] 无日K线数据")
        return None

    price_points = []
    for row in rows:
        try:
            # 跳过空行或无效行
            if not row or len(row) < 6:
                continue
            date_str = str(row[0]).strip()
            if not date_str or date_str == "date":
                continue
            price_points.append(PricePoint(
                date=date_str,
                price=float(row[2]) if row[2] else 0,
                open=float(row[1]) if row[1] else 0,
                high=float(row[3]) if row[3] else 0,
                low=float(row[4]) if row[4] else 0,
                volume=float(row[5]) if len(row) > 5 and row[5] else 0,
            ))
        except (ValueError, IndexError):
            continue

    if not price_points:
        return None

    return AssetData(
        symbol=symbol,
        name=name,
        asset_type=asset_type,
        market=market,
        currency="CNY",
        data=price_points,
        data_start=price_points[0].date,
        data_end=price_points[-1].date,
        source="tencent",
    )


def _parse_fund_nav(raw: bytes, symbol: str, name: str) -> Optional[AssetData]:
    """解析天天基金净值 JSONP 响应。

    返回格式：jsonpgz({...})
    包含字段：jzrq（净值日期）, dwjz（单位净值）
    """
    try:
        text = raw.decode("utf-8", errors="replace")
    except Exception:
        return None

    # 提取 JSONP 中的 JSON 对象
    match = re.search(r"jsonpgz\((\{.*?\})\)", text, re.DOTALL)
    if not match:
        print(f"  [解析] 无法提取 JSONP 数据")
        return None

    try:
        obj = json.loads(match.group(1))
    except json.JSONDecodeError as e:
        print(f"  [解析] JSONP 内 JSON 解析失败: {e}")
        return None

    date_str = obj.get("jzrq", "")
    nav_str = obj.get("dwjz", "")
    if not date_str or not nav_str:
        return None

    try:
        nav = float(nav_str)
    except ValueError:
        return None

    # 注意：天天基金单次请求通常只返回最新净值，
    # 完整的净值历史需要多个请求或使用历史接口。
    # Phase 2 先以单点数据构建基础框架，后续 Phase 可扩展为累计历史。

    price_point = PricePoint(
        date=date_str,
        price=nav,
    )

    return AssetData(
        symbol=symbol,
        name=name or obj.get("name", f"基金{symbol}"),
        asset_type=AssetType.FUND,
        market=Market.CN,
        currency="CNY",
        data=[price_point],
        data_start=date_str,
        data_end=date_str,
        source="tencent",
    )


class TencentDataSource(DataSource):
    """腾讯行情数据源实现。

    支持：
    - A 股股票（沪深）
    - A 股 ETF
    - 主要指数（沪深300/中证500/上证等）
    - 公募基金（通过天天基金接口）
    """

    @property
    def name(self) -> str:
        return "tencent"

    # ---------- 股票 / ETF ----------

    def _get_kline(self, full_symbol: str, symbol: str, name: str,
                   asset_type: AssetType, market: Market) -> Optional[AssetData]:
        """获取日K线数据（股票、ETF、指数共用）。

        full_symbol: 如 "sz000001" / "sh000300"
        count=320: 约 1 年历史数据（过大 count 会导致 API 返回空列表）
        始终使用 qfq（前复权），确保价格连续性。
        """
        url = (
            f"http://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
            f"?param={full_symbol},day,,,320,qfq"
        )
        raw = _http_get(url)
        if raw is None:
            return None
        time.sleep(REQUEST_DELAY)
        return _parse_tencent_kline(raw, symbol, name, asset_type, market)

    def get_stock_history(self, symbol: str, market: str = "sz") -> Optional[AssetData]:
        code = f"{market}{symbol}"
        return self._get_kline(code, symbol, "", AssetType.STOCK, Market.CN)

    def get_etf_history(self, symbol: str, market: str = "sz") -> Optional[AssetData]:
        code = f"{market}{symbol}"
        return self._get_kline(code, symbol, "", AssetType.ETF, Market.CN)

    # ---------- 指数 ----------

    # 常见指数代码映射
    INDEX_MAP = {
        "000300": ("沪深300", "sh000300"),
        "000905": ("中证500", "sh000905"),
        "000852": ("中证1000", "sh000852"),
        "000001": ("上证指数", "sh000001"),
        "399001": ("深证成指", "sz399001"),
        "399006": ("创业板指", "sz399006"),
        "000016": ("上证50", "sh000016"),
        "000688": ("科创50", "sh000688"),
        # 海外指数 — 腾讯接口不支持，后续可扩展其他数据源
    }

    def get_index_history(self, symbol: str) -> Optional[AssetData]:
        # 标准化：去掉 sh/sz 前缀后再查
        clean = symbol.replace("sh", "").replace("sz", "")
        if clean in self.INDEX_MAP:
            name, full_code = self.INDEX_MAP[clean]
        else:
            # 尝试直接用传入的 symbol
            full_code = symbol
            name = ""

        return self._get_kline(full_code, clean, name, AssetType.INDEX, Market.CN)

    # ---------- 基金 ----------

    def get_fund_history(self, symbol: str) -> Optional[AssetData]:
        """获取基金净值。

        注意：天天基金单次接口只返回最新净值。
        完整历史净值需要额外的历史接口（后续 Phase 扩展）。
        """
        url = f"http://fundgz.1234567.com.cn/js/{symbol}.js"
        raw = _http_get(url)
        if raw is None:
            return None
        time.sleep(REQUEST_DELAY)
        return _parse_fund_nav(raw, symbol, "")


# 工厂函数：获取默认数据源实例
_default_source: Optional[TencentDataSource] = None


def get_default_source() -> TencentDataSource:
    """获取默认数据源（单例）。"""
    global _default_source
    if _default_source is None:
        _default_source = TencentDataSource()
    return _default_source
