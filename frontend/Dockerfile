FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 프로덕션 빌드 진행
RUN npm run build
EXPOSE 3000

CMD ["npm", "run", "start"]