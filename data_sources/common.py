"""
data_sources/common.py — 数据源统一接口与数据模型定义

所有数据源必须实现以下接口，确保上层业务逻辑与具体数据源解耦。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class AssetType(Enum):
    """资产类型枚举"""
    STOCK = "stock"
    ETF = "etf"
    INDEX = "index"
    FUND = "fund"


class Market(Enum):
    """市场枚举"""
    CN = "CN"       # 中国大陆
    HK = "HK"       # 香港
    US = "US"       # 美国


@dataclass
class PricePoint:
    """统一价格数据点。

    无论原始数据是股票日K线还是基金净值，进入分析引擎后统一为：
    date + price（收盘价或净值）。
    """
    date: str           # YYYY-MM-DD
    price: float        # 收盘价（股票/ETF/指数）或净值（基金）

    # 以下字段仅股票/ETF/指数保留，基金为 None
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    volume: Optional[float] = None


@dataclass
class AssetData:
    """统一资产数据模型。

    无论股票、ETF、基金、指数，最终统一为此格式。
    """
    symbol: str                     # 代码，如 "000001"
    name: str                       # 名称，如 "平安银行"
    asset_type: AssetType           # 资产类型
    market: Market                  # 市场
    currency: str = "CNY"           # 货币
    data: list[PricePoint] = field(default_factory=list)
    data_start: str = ""            # 数据起始日期
    data_end: str = ""              # 数据最新日期
    source: str = ""                # 数据来源标识


@dataclass
class AssetMeta:
    """资产元数据（不包含价格数据，用于资产列表索引）。"""
    symbol: str
    name: str
    asset_type: AssetType
    market: Market
    currency: str = "CNY"
    data_start: str = ""
    data_end: str = ""
    data_points: int = 0
    source: str = ""


class DataSource(ABC):
    """数据源抽象基类。

    所有数据源必须继承此类并实现以下方法。
    新增数据源时只需修改 data_sources/ 目录，上层代码无需改动。
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """数据源名称，如 'tencent'"""
        ...

    @abstractmethod
    def get_stock_history(
        self, symbol: str, market: str = "sz"
    ) -> Optional[AssetData]:
        """获取股票历史行情数据。

        Args:
            symbol: 股票代码，如 "000001"
            market: 交易所前缀，如 "sz" / "sh"

        Returns:
            AssetData 或 None（数据不可用时）
        """
        ...

    @abstractmethod
    def get_etf_history(
        self, symbol: str, market: str = "sz"
    ) -> Optional[AssetData]:
        """获取 ETF 历史行情数据。"""
        ...

    @abstractmethod
    def get_index_history(
        self, symbol: str
    ) -> Optional[AssetData]:
        """获取指数历史行情数据。

        Args:
            symbol: 指数代码，如 "sh000300"（沪深300）
        """
        ...

    @abstractmethod
    def get_fund_history(
        self, symbol: str
    ) -> Optional[AssetData]:
        """获取基金历史净值数据。

        Args:
            symbol: 基金代码，如 "001512"
        """
        ...

    def resolve_symbol(self, keyword: str) -> list[AssetMeta]:
        """根据关键词搜索资产（可选实现）。

        默认返回空列表，子类可覆盖以支持搜索。

        Args:
            keyword: 搜索关键词（代码或名称）

        Returns:
            匹配的资产元数据列表
        """
        return []
