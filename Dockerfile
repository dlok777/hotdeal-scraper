FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN chmod +x /app/scheduler.sh

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

CMD ["/app/scheduler.sh"]
