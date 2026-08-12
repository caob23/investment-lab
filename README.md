# 长期投资实验室 (Investment Lab)

帮助普通人学习投资、分析资产、理解风险、研究组合。

**授人以渔，而不是授人以鱼。**

## 技术栈

- GitHub Pages — 静态网站托管
- HTML / CSS / JavaScript — 前端（零框架依赖）
- Python + GitHub Actions — 数据采集与更新
- JSON — 数据存储

## 项目结构

```
investment-lab/
├── index.html        # 首页
├── learn.html        # 投资课程
├── assets.html       # 资产分析
├── portfolio.html    # 组合分析
├── calculator.html   # 投资计算器
├── css/
│   ├── main.css
│   └── mobile.css
├── js/
│   ├── app.js
│   ├── assets.js
│   ├── portfolio.js
│   ├── calculator.js
│   ├── backtest.js
│   ├── risk.js
│   └── charts.js
├── data/
│   ├── assets.json
│   ├── history/
│   └── metadata.json
├── scripts/
│   ├── fetch_data.py
│   ├── normalize_data.py
│   ├── validate_data.py
│   └── build_data.py
├── .github/workflows/
│   └── update-data.yml
└── README.md
```

## 开发阶段

| Phase | 内容 | 状态 |
|-------|------|------|
| 1 | 项目结构、首页、学习页面、计算器、响应式布局 | 进行中 |
| 2 | 数据模型、数据采集、数据清洗、JSON数据 | 待开始 |
| 3 | 资产分析、收益、回撤、波动率、图表 | 待开始 |
| 4 | 组合、相关性、定投、再平衡、压力测试 | 待开始 |
| 5 | 历史时期、投资案例、课程互动 | 待开始 |
| 6 | GitHub Actions、自动更新、部署 | 待开始 |

## 免责声明

本网站用于投资知识学习、历史数据分析和模拟研究，不构成投资、税务或法律建议。历史收益不代表未来收益。回测结果不代表未来实际表现。
