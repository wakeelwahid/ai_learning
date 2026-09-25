# Mobile — React Native + Expo (SDK 51)
#
# Native APK/IPA builds are produced with EAS Build:
#   npm run build:android   |   npm run build:ios
#
# This image runs the Metro / Expo dev bundler so an emulator or a physical
# device on the same LAN can connect (and can also serve the Expo web build).
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache git bash

COPY package*.json ./
RUN npm ci

COPY . .

ENV EXPO_NO_TELEMETRY=1

# Metro bundler (8081) + Expo dev server (19000/19006 for web)
EXPOSE 8081 19000 19006

CMD ["npx", "expo", "start", "--web", "--host", "lan"]
