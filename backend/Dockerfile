FROM node:24-bookworm-slim
# openssl: lo necesita el motor de esquema de Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
