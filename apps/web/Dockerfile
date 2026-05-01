FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json tsconfig.json
COPY next.config.ts next.config.ts
COPY next-env.d.ts next-env.d.ts

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
