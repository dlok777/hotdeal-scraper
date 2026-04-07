FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN chmod +x /app/scheduler.sh

CMD ["/app/scheduler.sh"]
