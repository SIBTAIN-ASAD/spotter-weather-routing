.PHONY: setup api web test build serve

setup:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements.txt
	npm --prefix frontend ci

api:
	DEBUG=true .venv/bin/python backend/manage.py runserver 127.0.0.1:8001

web:
	npm --prefix frontend run dev

test:
	.venv/bin/python backend/manage.py test routing.tests fuel.tests
	npm --prefix frontend test
	npm --prefix frontend run typecheck

build:
	npm --prefix frontend run build
	.venv/bin/python backend/manage.py collectstatic --noinput

serve:
	PATH="$(CURDIR)/.venv/bin:$$PATH" PORT=8001 ./scripts/start.sh
