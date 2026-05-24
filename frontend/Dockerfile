FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 빌드 타임 환경변수 주입 (NAS/외부 배포용)
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# 프로덕션 빌드 진행
RUN npm run build
EXPOSE 3000

CMD ["npm", "run", "start"]