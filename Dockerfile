# Reportage Post — прод-образ. Простота > оптимальность (v1):
# полный node_modules (нужен prisma CLI для migrate deploy на старте).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# dev-зависимости нужны для next build (tailwind/postcss/ts) — NODE_ENV ставим ПОСЛЕ
RUN npm ci --include=dev
COPY . .
# CA Яндекса для TLS к Managed PostgreSQL (verify-full)
ADD https://storage.yandexcloud.net/cloud-certs/CA.pem /app/yc-ca.pem
RUN npx prisma generate && npm run build
ENV NODE_ENV=production
EXPOSE 3000
# Миграции встроены в старт (урок Verifi: schema drift → 500)
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
