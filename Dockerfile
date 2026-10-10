FROM node:22-alpine AS web
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_GA_MEASUREMENT_ID=
RUN npm run build

FROM python:3.12-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000 DEBUG=false
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY --from=web /build/frontend/dist ./frontend/dist/
COPY scripts/start.sh ./scripts/start.sh
RUN python backend/manage.py collectstatic --noinput && \
    useradd --system --uid 10001 --create-home routecast && \
    chmod +x scripts/start.sh
USER routecast
EXPOSE 8000
CMD ["./scripts/start.sh"]
