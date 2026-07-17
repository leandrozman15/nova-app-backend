# Setup Neon + Render

## Estado actual

- Backend creado desde cero en esta carpeta.
- Compila correctamente con `npm run build`.
- Incluye `render.yaml` listo para deploy.
- Incluye `.env.example` con variables necesarias.

## 1) Crear proyecto en Neon

1. Entrar en Neon dashboard.
2. Crear nuevo proyecto (region cercana a Render).
3. Crear base de datos y usuario.
4. Copiar connection string (pooled) con `sslmode=require`.
5. Guardar como `DATABASE_URL`.

Formato esperado:

`postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require`

## 2) Crear servicio en Render

1. En Render: New + Web Service.
2. Conectar el repositorio GitHub del backend.
3. Confirmar que detecte `render.yaml`.
4. Configurar Secret File:
   - Nombre: `firebase-admin.json`
   - Mount path: `/etc/secrets/firebase-admin.json`
5. Variables de entorno:
   - `DATABASE_URL` = cadena de Neon
   - `CORS_ORIGIN` = URL del frontend
   - `FIREBASE_PROJECT_ID` = ID de Firebase

## 3) Comandos usados por Render

Build command:

`npm ci --include=dev && npx prisma generate && npm run build`

Start command:

`sh -c "npx prisma migrate deploy && node dist/main.js"`

## 4) Migración inicial

Antes del primer deploy productivo, en local:

1. `cp .env.example .env`
2. Completar `DATABASE_URL` apuntando a Neon.
3. `npx prisma migrate dev --name init`
4. Hacer commit del directorio `prisma/migrations`.

## 5) Smoke test

Con backend levantado:

- `GET /health` debe responder `{ ok: true, db: "connected", ... }`.

Con auth:

- `GET /users` requiere:
  - `Authorization: Bearer <firebase_id_token>`
  - `X-Company-Id: <company-id>`
