# 半成品-长期投资实验室 (Investment Lab)

帮助普通人学习投资、分析资产、理解风险、研究组合。

**授人以渔，而不是授人以鱼。**

## 技术栈

- GitHub Pages — 静态网站托管（零成本）
- HTML / CSS / JavaScript — 前端（零框架依赖，纯 Canvas 图表）
- Python + GitHub Actions — 数据采集与更新
- JSON — 数据存储

## 项目结构

```
investment-lab/
├── index.html              # 首页（五入口卡片）
├── learn.html              # 投资课程（28课 + 互动测验 + 投资案例）
├── history.html            # 历史时期分析（5个关键市场窗口）
├── analysis.html           # 资产分析（单资产+多资产对比）
├── portfolio.html          # 组合分析（相关性、定投、压力测试）
├── calculator.html         # 投资计算器（复利/定投/回撤/再平衡）
├── css/
│   ├── main.css            # 主样式
│   └── mobile.css          # 移动端适配
├── js/
│   ├── app.js              # 全局交互
│   ├── data-loader.js      # 数据加载器（fetch + 缓存）
│   ├── analysis-engine.js  # 分析引擎（收益/波动/夏普/回撤）
│   ├── analysis-ui.js      # 分析页面交互
│   ├── chart-renderer.js   # Canvas 图表渲染器（零依赖）
│   ├── portfolio-engine.js # 组合引擎（相关性/定投/压力测试）
│   ├── portfolio-ui.js     # 组合页面交互
│   └── calculator.js       # 计算器逻辑
├── data/
│   ├── assets.json         # 资产索引列表
│   ├── metadata.json       # 资产元数据
│   ├── data_quality_report.json
│   └── history/            # 历史数据（每资产一个 JSON）
│       ├── index_000001.json
│       └── ...
├── data_sources/
│   ├── __init__.py
│   ├── common.py           # 数据模型（PricePoint/AssetData/DataSource）
│   └── tencent.py          # 腾讯行情数据源
├── scripts/
│   ├── __init__.py
│   ├── fetch_data.py       # 数据采集
│   ├── build_data.py       # 数据构建
│   ├── validate_data.py    # 数据质量验证
│   ├── normalize_data.py   # 数据标准化
│   └── requirements.txt
├── .github/workflows/
│   ├── update-data.yml     # 定时数据更新（UTC 0:00，支持手动触发）
│   └── deploy.yml          # 自动部署到 GitHub Pages
└── README.md
```

## 数据源

### 腾讯行情接口（主数据源）

| 接口 | 地址 | 用途 | 状态 |
|------|------|------|------|
| 日K线 | `web.ifzq.gtimg.cn/appstock/app/fqkline/get` | 股票/ETF/指数历史日线（前复权） | 正常 |
| 实时快照 | `qt.gtimg.cn/q={codes}` | 股票/ETF/指数实时行情 + 基金最新净值 | 正常 |

**日K线接口格式：**
```
GET http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={market}{symbol},day,,,320,qfq
# market: sh / sz
# count=320 约为 1 年历史数据（超过可能返回空列表）
# qfq = 前复权（保证价格连续性）
```

**实时快照接口格式：**
```
GET http://qt.gtimg.cn/q={code1},{code2},...
# 股票/ETF/指数: sh000001 / sz399001
# 基金: jj000001（jj 前缀）
# 响应为 GBK 编码的 var 赋值文本，字段用 ~ 分隔
```

### 基金数据（已知限制）

- 腾讯 `web.ifzq.gtimg.cn` K 线接口不支持基金（返回 0 行）
- `qt.gtimg.cn` 可获取基金最新净值，但不提供历史净值序列
- 天天基金 `fundgz.1234567.com.cn` 接口已失效
- 基金完整历史净值需用东方财富 `api.fund.eastmoney.com/f10/lsjz` 接口（后续替换）

## CI/CD 自动化

通过 GitHub Actions 实现零人工维护的数据更新与部署流水线：

| 工作流 | 触发条件 | 功能 |
|--------|----------|------|
| `update-data.yml` | 每日 UTC 0:00（北京时间 8:00）+ 手动 `workflow_dispatch` | fetch → build → validate → 有变更则 commit+push |
| `deploy.yml` | push 到 main + `update-data.yml` 完成 | 上传根目录 artifact → 部署到 GitHub Pages |

数据采集失败时保留旧数据并继续后续部署步骤，确保网站始终可用。

## 开发阶段

| Phase | 内容 | 状态 |
|-------|------|------|
| 1 | 项目结构、首页、学习页面、计算器、响应式布局 | 完成 |
| 2 | 数据模型、数据采集（47 项资产）、清洗、验证 | 完成 |
| 3 | 资产分析页：收益/回撤/波动率/夏普、Canvas 图表、多资产对比 | 完成 |
| 4 | 组合分析：相关性矩阵、定投回测、压力测试（5 个历史情景） | 完成 |
| 5 | 历史时期分析（5个窗口）、课程互动测验（三级）、投资决策训练案例 | 完成 |
| 6 | GitHub Actions 自动数据更新（每日 UTC 0:00）、GitHub Pages 自动部署 | 完成 |

## 已采集资产（47 项）

- **指数**（9）：上证指数、沪深300、中证500、中证1000、上证50、科创50、创业板指、创业板50、深证成指
- **股票**（22）：覆盖金融（中国平安、招商银行、工商银行、中信证券、东方财富）、消费（贵州茅台、五粮液、牧原股份、中国中免）、科技（宁德时代、海康威视、科大讯飞、中芯国际、京东方A）、制造（三一重工、比亚迪、隆基绿能、海螺水泥）、医药（恒瑞医药、迈瑞医疗）、地产（万科A）、银行（平安银行）
- **ETF**（13）：宽基（沪深300/中证500/中证1000/上证50/创业板/科创50）、行业（证券/酒/芯片/医疗）、跨境（日经/纳指）
- **基金**（3）：易方达海外互联、易方达中小盘、招商白酒（天天基金接口仅返回最新净值，历史数据不足）

## 免责声明

本网站用于投资知识学习、历史数据分析和模拟研究，不构成投资、税务或法律建议。
历史收益不代表未来收益。回测结果不代表未来实际表现。
