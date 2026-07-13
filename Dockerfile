# Reportage Post — прод-образ. Простота > оптимальность (v1):
# полный node_modules (нужен prisma CLI для migrate deploy на старте).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 3000
# Миграции встроены в старт (урок Verifi: schema drift → 500)
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
