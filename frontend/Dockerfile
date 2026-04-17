# scCloud v2 — 前端 Dockerfile (Next.js standalone)
# 多阶段构建: 依赖安装 → 构建 → 最小化运行时

# ===== Stage 1: 依赖安装 =====
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# ===== Stage 2: 构建 =====
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建时注入后端地址 — Next.js rewrites 在 build 阶段读取
ARG BACKEND_URL=http://localhost:8000
ENV BACKEND_URL=${BACKEND_URL}

RUN npm run build

# ===== Stage 3: 运行时 =====
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone 输出
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
