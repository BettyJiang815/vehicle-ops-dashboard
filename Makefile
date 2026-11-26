.PHONY: help db-up db-down test collector web lint

help:
	@echo "make db-up      起本地 Postgres + PostgREST"
	@echo "make db-down    停掉本地数据库"
	@echo "make test       采集器单测"
	@echo "make collector  用 mock 数据源跑一次采集"
	@echo "make web        前端构建"

db-up:
	docker compose up -d

db-down:
	docker compose down

test:
	cd collector && python3 -m unittest discover -s tests -t . -v

collector:
	cd collector && python3 -m vehicle_ops --config config.json --dry-run

web:
	cd web && npm install && npm run build
