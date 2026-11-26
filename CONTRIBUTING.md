# 贡献指南

## 开发环境

- Python ≥ 3.10（采集器零第三方依赖）
- Node ≥ 18（前端）
- 可选：Docker（本地数据库）

## 本地跑通

```bash
docker compose up -d

cd collector && cp config.example.json config.json
python3 -m unittest discover -s tests -t . -v
python3 -m vehicle_ops --config config.json

cd ../web && cp .env.example .env.local && npm install && npm run dev
```

## 新增一个数据源

1. 在 `collector/vehicle_ops/providers/` 下新建 `your_platform.py`
2. 实现 `fetch() -> list[Vehicle]`，字段缺失就留空，不要编造
3. 在 `providers/__init__.py` 的 `build_provider` 注册
4. 补一个基于样例响应的单测（不需要真网络）
5. README 的「接真实数据」补一段说明

原则：**provider 只负责把平台字段翻译成统一模型**，不要在 provider 里做入库、告警、重试。

## 代码风格

- Python：标准库优先；函数命名说人话；异常不要静默吞掉（采集失败必须非 0 退出）
- JS/JSX：函数组件 + hooks；派生数据用 `useMemo`；Tailwind 类名必须是静态字符串（拼接会被 purge）
- 提交信息：`feat: xxx` / `fix: xxx` / `docs: xxx`

## PR 检查清单

- [ ] `python3 -m unittest discover -s tests -t . -v` 全绿
- [ ] `npm run build` 通过
- [ ] 没有提交 `config.json`、`.env.local`、任何 key
- [ ] 改了表结构的，附了新的 migration 文件
- [ ] 改了「异常」口径的，Python 与前端两边同步
