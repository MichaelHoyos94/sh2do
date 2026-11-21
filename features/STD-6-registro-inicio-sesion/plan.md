# STD-6 — Registro e inicio de sesión · Plan de implementación

> **Spec:** STD-6 en Jira (épica STD-1), refinada el 21-11-2026 · **Backlog:** US-001
> **Incluye los enablers:** EN-001 (base del monorepo y Docker), EN-003 (correo) y EN-004 (seguridad transversal). Ver `constitution.md` §14.
> **Estado del plan:** aprobado el 21-11-2026. Ajustado tras la revisión de QA (ver §13).

---

## 1. Objetivo

Que una persona pueda **registrarse**, **verificar su correo**, **iniciar sesión** y **cerrarla**. Que cualquier ruta privada exija sesión. Y dejar operativa la base técnica del proyecto: monorepo, Docker, Prisma, correo, seguridad y pruebas.

## 2. Alcance

| Incluido | Fuera de alcance |
|---|---|
| Registro (nombre, correo, contraseña) con sesión automática | Recuperar contraseña (STD-7) |
| Correo de verificación, verificación y reenvío | 2FA, Google OAuth |
| Inicio y cierre de sesión; renovación de la sesión | Edición del perfil y de la zona horaria |
| Protección de rutas (frontend) y autenticación (API) | Preferencias de correo (`user_preferences`, STD-17) |
| Middleware `requireVerifiedEmail`, que todavía ningún endpoint usa | Endpoint de asistencia a planes (STD-22) |
| Página de inicio mínima, página 404 | Pendientes, planes y notificaciones |
| Infraestructura: Docker, scripts, Prisma, worker, Mailpit, lint, pruebas | CI, HTTPS y backups (Incremento 3) |

## 3. Decisiones del refinamiento

| # | Decisión |
|---|---|
| R-01 | El registro pide **nombre visible** (2–60 caracteres, recortado), **correo** y **contraseña** (8–128 caracteres, sin reglas de composición) con confirmación. La **zona horaria** se detecta del navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`); si es inválida o falta, se usa `UTC`. |
| R-02 | El correo se normaliza (recortado y en minúsculas) antes de guardarlo o compararlo. |
| R-03 | Un correo ya registrado responde `409 EMAIL_ALREADY_REGISTERED`, con el mensaje "Ya existe una cuenta con este correo" y un enlace al inicio de sesión. |
| R-04 | Después de registrarse, **la sesión queda iniciada** y la aplicación muestra el aviso "Verifica tu correo". |
| R-05 | El enlace de verificación **vence en 24 h** y es de un solo uso. El usuario sin verificar puede **reenviarlo** desde la app; el reenvío anula los enlaces anteriores. |
| R-06 | Un usuario sin verificar **puede iniciar sesión** y usar la app; lo único que no puede es confirmar asistencia a planes (`product.md`, STD-6). |
| R-07 | Credenciales incorrectas → `401 INVALID_CREDENTIALS`, con el mensaje "Correo o contraseña incorrectos", sin indicar cuál de los dos falla. |
| R-08 | La sesión dura **30 días deslizantes**: el refresh se rota en cada uso y renueva el vencimiento. No hay casilla "Recordarme". |
| R-09 | Límites de intentos en Redis, con respuesta `429 TOO_MANY_REQUESTS` y la cabecera `Retry-After`: **inicio de sesión**, 5 fallos cada 15 min por correo + IP; **registro**, 5 cada hora por IP; **reenvío de verificación**, 3 cada hora por usuario. |
| R-10 | **Rutas del frontend sin sesión:** cualquier URL, exista o no, salvo las públicas (`/login`, `/register`, `/verify-email`), redirige a `/login?redirect=<ruta>`. **Con sesión:** una URL inexistente muestra la página 404, y `/login` y `/register` redirigen a `/`. Tras iniciar sesión se vuelve a `redirect` si es una ruta interna (empieza por `/` y no por `//`); si no, se va a `/`. |
| R-11 | **Asistencia sin verificar:** STD-6 entrega el middleware `requireVerifiedEmail` (responde `403 EMAIL_NOT_VERIFIED`, consultando la BD) y su prueba aislada. STD-22 lo aplica al endpoint de asistencia. |
| R-12 | El enlace de verificación lleva a `/verify-email?token=…` en el frontend, que llama a la API. Funciona **con o sin sesión**, porque el token es la credencial. |

## 4. Arquitectura

### 4.1 Backend (`backend/`)

```
src/
├─ api/            app.ts (Express app, sin listen) · server.ts (listen)
├─ worker/         index.ts (arranque, reconciliación) · email.processor.ts
├─ modules/
│  ├─ auth/        auth.routes · auth.controller · auth.service · auth.schemas
│  │               session.repository · verification-token.repository
│  │               require-auth.middleware · require-verified-email.middleware
│  └─ users/       users.routes · users.controller · users.service · users.repository · users.schemas
└─ shared/
   ├─ config/      env.ts (Zod; si falta algo, el proceso no arranca)
   ├─ http/        problem.ts (AppError → Problem Details) · error-handler · validate (Zod) · request-id
   ├─ security/    password.ts (Argon2id) · tokens.ts (randomBytes + SHA-256) · jwt.ts (jose HS256) · rate-limit.ts (Redis)
   ├─ mail/        mailer.ts (Nodemailer SMTP) · templates/verify-email.ts · email-deliveries.repository.ts
   ├─ queue/       queues.ts (BullMQ: cola "email")
   ├─ db/          prisma.ts
   ├─ logger.ts    pino
   └─ clock.ts     reloj inyectable (now()) para pruebas
```

- **Capas:** `routes → controller → service → repository`. `auth.service` usa `users.service` para crear y leer usuarios, y no accede directamente a su repositorio.
- **Correo asíncrono (EN-003 + base de EN-002):**
  1. En la **misma transacción** del registro o del reenvío se crean el token y un `email_deliveries` en estado `queued`.
  2. Tras el commit se encola el job `send-email` con `jobId = email-<delivery.id>`, que BullMQ usa como dedupe (BullMQ no admite ids numéricos).
  3. El **worker** carga el delivery, comprueba que siga en `queued` y **revalida que siga vigente**: el token del `dedupe_key` no está usado ni anulado y el usuario sigue sin verificar. Si ya no es vigente, marca el delivery como `failed` (`last_error = "superseded"`) y no envía nada. Si es vigente, construye el correo y lo envía por SMTP. Después actualiza el delivery a `accepted` (con `provider_message_id`) o a `failed` (con `last_error`).
  4. Reintentos: `attempts: 4` (1 + 3 reintentos), con backoff exponencial desde 30 s. Cada intento incrementa `attempt_count`.
  5. **Reconciliación al arrancar el worker:** revisa los deliveries en `queued` de más de 1 minuto. Si su job sigue en la cola, los deja; si no, aplica el paso 6.
  6. El token en claro **no se guarda**. Viaja en el payload del job y se descarta tras el envío. Si se pierde el job, la reconciliación no puede reconstruir el enlace: marca el delivery como `failed` con `last_error = "token unavailable"`, y el usuario puede reenviar.

### 4.2 Frontend (`frontend/`)

```
src/
├─ app/            router.tsx · providers.tsx (QueryClient, AuthProvider) · AppLayout.tsx
├─ api/            client.ts (fetch + Bearer + refresco ante 401 + Problem Details) · generated/std-6.ts
├─ features/auth/  LoginPage · RegisterPage · VerifyEmailPage · AuthProvider/useAuth
│                  RequireAuth · RedirectIfAuthenticated · VerifyEmailBanner
├─ features/home/  HomePage (saludo con el displayName)
├─ components/ui/  button · input · label · card · alert (shadcn)
└─ pages/          NotFoundPage
```

- **Sesión:**
  - El access token vive **solo en memoria**, en el `AuthProvider`.
  - Al cargar la app se llama a `POST /auth/refresh`: si responde 200, hay sesión; si no, se considera anónimo. Mientras tanto se muestra un estado de carga accesible.
  - Si una petición responde `401`, el cliente intenta **un** refresh. Las peticiones simultáneas comparten el mismo refresh en curso, y entre pestañas el refresh se serializa con `navigator.locks` (`sh2do-refresh`). Si el refresh falla, se limpia la sesión y se redirige al login.
- **Layout privado:** cabecera con el nombre, el botón "Cerrar sesión" y `VerifyEmailBanner` (si `emailVerified = false`), con el botón "Reenviar correo".
- **Proxy de Vite:** `/api` → `http://api:3000`. Navegador y API comparten origen, así que la cookie `SameSite=Strict` funciona sin CORS en desarrollo.

## 5. Datos

Solo se crean en `schema.prisma` las tablas que usa esta feature, fieles a `sh2do-model.json`. Las demás tablas las añade la feature que las necesite.

| Tabla | Uso |
|---|---|
| `users` | Cuenta: `email` único y normalizado, `password_hash`, `display_name`, `email_verified_at`, `timezone` |
| `user_sessions` | Un registro por refresh vigente: `refresh_token_hash` único, `expires_at`, `revoked_at`, `last_used_at` |
| `email_verification_tokens` | `token_hash` único, `expires_at` (+24 h), `used_at` |
| `email_deliveries` | Registro del envío: `kind = verify_email`, `status`, `attempt_count`, `dedupe_key`, etc. |

- **Desviación temporal:** `email_deliveries.notification_id` se crea como columna nullable **sin relación**, porque `notifications` todavía no existe. STD-16 añade la FK. No cambia `sh2do-model.json`.
- **Rotación del refresh sin columnas nuevas:**
  1. Cada refresh **revoca** su fila (`revoked_at`) y **crea** otra nueva.
  2. Si llega un refresh cuyo hash existe pero está revocado, es una **reutilización**: se revocan todas las sesiones activas del usuario y se responde `401`.
  3. **Margen de carrera de 10 s:** si la fila se revocó por rotación hace menos de 10 s (por ejemplo, dos pestañas que renuevan a la vez), se responde `401 SESSION_INVALID` **sin** revocar las demás sesiones y **sin** borrar la cookie. Además, el frontend serializa el refresh entre pestañas con `navigator.locks`.
- **Access token tras cerrar sesión (aceptado):** el JWT sigue siendo válido hasta 15 min después de cerrar sesión o de una revocación. Es coherente con la constitución §7 (token corto en memoria) y el frontend lo descarta al instante.
- `dedupe_key` del delivery: `verify_email:{tokenId}`.

## 6. API

El contrato está en `contracts/openapi.yaml`. Todas las rutas van bajo `/api/v1`.

| Método y ruta | Auth | Resumen | Éxito | Errores |
|---|---|---|---|---|
| `POST /auth/register` | — | Crea la cuenta, inicia la sesión y encola el correo de verificación | `201` AuthSession + cookie | 409, 422, 429 |
| `POST /auth/login` | — | Inicia sesión | `200` AuthSession + cookie | 401, 422, 429 |
| `POST /auth/refresh` | cookie | Rota el refresh y emite un access token | `200` AuthSession + cookie | 401 |
| `POST /auth/logout` | cookie (opcional) | Revoca la sesión y borra la cookie. Es idempotente | `204` | — |
| `POST /auth/verify-email` | — | Verifica el correo con el token | `200` `{ emailVerified: true }` | 400, 422 |
| `POST /auth/verification-email` | Bearer | Reenvía el correo de verificación | `202` | 401, 409, 429 |
| `GET /users/me` | Bearer | Usuario actual | `200` User | 401 |
| `GET /health` | — | Liveness para Docker (fuera de `/api/v1`) | `200` | — |

- **Access token:** JWT HS256 de 15 min, `sub = userId`, guardado solo en memoria. Las respuestas lo incluyen en `accessToken`, junto con `accessTokenExpiresIn = 900`.
- **Cookie del refresh:** `sh2do_rt`, `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Max-Age=30 días`, y `Secure` cuando `COOKIE_SECURE=true`.
- **Inicio de sesión:** si el correo no existe, también se ejecuta una verificación Argon2 ficticia, para que el tiempo de respuesta no permita adivinar qué correos existen.
- **Errores (`code`):** `VALIDATION_ERROR`, `EMAIL_ALREADY_REGISTERED`, `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `SESSION_INVALID`, `VERIFICATION_TOKEN_INVALID`, `VERIFICATION_TOKEN_EXPIRED`, `EMAIL_ALREADY_VERIFIED`, `EMAIL_NOT_VERIFIED` (middleware), `TOO_MANY_REQUESTS`, `NOT_FOUND` (ruta inexistente) e `INTERNAL_ERROR`.

## 7. Seguridad (EN-004)

- Las entradas se validan con Zod en `routes` (body); cualquier error responde `422` con su lista de campos.
- Seguridad HTTP y límites:
  - `helmet`.
  - `cors` restringido a `CORS_ORIGIN`, con `credentials`.
  - Body JSON de 100 kb como máximo.
  - `x-powered-by` desactivado.
- Contraseñas con Argon2id, usando los parámetros por defecto de la librería `argon2` (m = 64 MiB, t = 3, p = 4).
- Tokens de verificación y de refresh: 32 bytes de `crypto.randomBytes` en base64url, guardados como SHA-256.
- El rate limit (R-09) es una función propia sobre ioredis (`INCR` + `EXPIRE` en `MULTI`, es decir, atómico).
  - En el inicio de sesión, el intento se cuenta **antes** de verificar la contraseña, para que no se pueda saltar con peticiones simultáneas: si se supera el límite, se responde `429`; si la contraseña es correcta, se descuenta.
  - Las claves de Redis no contienen datos personales: el correo va como hash SHA-256.
- La zona horaria se acepta si `Intl.DateTimeFormat` la reconoce y es un nombre de región (`Area/Lugar`) o `UTC`; se guarda la forma que devuelve `resolvedOptions().timeZone`. Los desfases (`+05:00`), las abreviaturas (`EST`) y los nombres inválidos se guardan como `UTC`. No se usa `Intl.supportedValuesOf`, porque en Node 24 (ICU 78) no incluye los nombres IANA vigentes (p. ej. `Asia/Kolkata`).
- **Logs:** pino en JSON, con `requestId`. Nunca registran el body de `/auth/*`, las cookies, la cabecera `Authorization` ni los tokens.

## 8. Infraestructura (EN-001)

| Servicio | Imagen / build | Puerto | Healthcheck |
|---|---|---|---|
| `mysql` | `mysql:8.4` · volumen `mysql-data` · init SQL que crea `sh2do_test` y le da permisos | 3306 | `mysqladmin ping` |
| `redis` | `redis:7.4-alpine` | 6379 | `redis-cli ping` |
| `mailpit` | `axllent/mailpit:v1.21` | 8025 (UI) · 1025 (SMTP) | — |
| `api` | `backend/Dockerfile` (`node:24-bookworm-slim` + openssl) · `npm run dev -w backend` (tsx watch) | 3000 | `GET /health` |
| `worker` | La misma imagen que `api` · `npm run dev:worker -w backend` | — | — |
| `web` | `frontend/Dockerfile` (`node:24-bookworm-slim`) · `vite --host` | 5173 | — |

- El código se monta como volumen, y `node_modules` vive en volúmenes nombrados por servicio para no mezclarse con el host Windows.
- **`scripts/up.ps1`:**
  1. Si no existe `.env`, lo crea desde `.env.example` y avisa.
  2. Ejecuta `docker compose up -d --build --wait`.
  3. Ejecuta `docker compose exec api npx prisma migrate deploy`.
  4. Imprime las URLs: web, API y Mailpit.
- **`scripts/down.ps1`:** ejecuta `docker compose down`. Con `-Volumes`, también borra los datos, previa confirmación.
- **Variables (`.env.example`):** `NODE_ENV`, `LOG_LEVEL`, `API_PORT`, `APP_URL`, `CORS_ORIGIN`, `DATABASE_URL`, `DATABASE_URL_TEST`, `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `REDIS_URL`, `JWT_SECRET` (mínimo 32 caracteres), `COOKIE_SECURE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`.
- **Scripts de npm en la raíz:** `lint`, `typecheck`, `test`, `test:coverage` y `format`. Los workspaces tienen sus propios `dev`, `build`, `test`, `test:coverage`, `typecheck` y `lint`. El frontend tiene además `gen:api`, que ejecuta `openapi-typescript` contra el contrato.

## 9. Dependencias que hay que aprobar

> Las instala el orquestador en la fase 0, en una sola ejecución de `npm install`, para que los agentes no se pisen el `package-lock.json` trabajando en paralelo. Los agentes no pueden instalar nada más.

| Workspace | Runtime | Desarrollo |
|---|---|---|
| raíz | — | `eslint`, `@eslint/js`, `typescript-eslint`, `globals`, `eslint-plugin-react-hooks`, `prettier`, `typescript` |
| backend | `express`, `zod`, `@prisma/client`, `@prisma/adapter-mariadb` *(aprobado el 21-11-2026: Prisma 7 exige un driver adapter para conectarse a MySQL)*, `argon2`, `jose`, `cookie-parser`, `helmet`, `cors`, `nodemailer`, `bullmq`, `ioredis`, `pino`, `pino-http` | `prisma`, `tsx`, `vitest`, `@vitest/coverage-v8`, `supertest`, `@types/express`, `@types/cookie-parser`, `@types/cors`, `@types/nodemailer`, `@types/supertest`, `@types/node` |
| frontend | `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `tailwindcss`, `@tailwindcss/vite`, `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`, `@radix-ui/react-label` | `vite`, `@vitejs/plugin-react`, `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `openapi-typescript`, `@types/react`, `@types/react-dom` |

Deliberadamente fuera: Luxon (STD-6 no calcula fechas; la zona se valida con `Intl.DateTimeFormat` y se guarda en la forma que este resuelve), `express-rate-limit` (basta con una función propia de 20 líneas), `react-hook-form` (los formularios son pequeños) y MSW (`fetch` se simula con `vi`).

## 10. Pruebas: qué prueba verifica cada criterio

| Criterio (Jira) | Backend (integración / unitaria) | Frontend (Testing Library) |
|---|---|---|
| CA-01 Registro válido | `POST /register` → 201, usuario guardado con el hash, cookie, delivery en `queued` y job encolado | RegisterPage envía los datos y navega a `/` con el aviso |
| CA-02 Datos inválidos | 422 con `errors[]` (nombre, correo, contraseña) | Errores por campo y foco en el primer error |
| CA-03 Correo duplicado | 409, también con otro uso de mayúsculas o espacios | Mensaje con enlace a `/login` |
| CA-04 Verificación | 200 y `email_verified_at`; token usado, vencido o inexistente → 400 con su código | VerifyEmailPage: éxito y error, con reenvío si hay sesión |
| CA-05 Reenvío | 202 y anulación de los tokens anteriores; 409 si ya está verificado; 429 al 4.º intento | El banner reenvía y anuncia el resultado (`aria-live`) |
| CA-06 Inicio de sesión correcto | 200 y cookie; funciona aunque el correo no esté verificado | Navega a `redirect` o a `/`; rechaza `redirect` externos |
| CA-07 Inicio de sesión incorrecto | 401 `INVALID_CREDENTIALS` con correo inexistente y con contraseña errónea, con el mismo cuerpo | Muestra "Correo o contraseña incorrectos" |
| CA-08 Límite en el inicio de sesión | El 6.º fallo en 15 min → 429 con `Retry-After` | Muestra el mensaje del 429 |
| CA-09 Cierre de sesión | 204; un refresh posterior → 401 | El botón limpia la sesión y lleva a `/login` |
| CA-10 Persistencia y rotación | refresh → 200 con un token nuevo; reutilizar el anterior → 401 y todas las sesiones revocadas; refresh vencido (reloj controlado) → 401 | Al recargar con una cookie válida se restaura la sesión |
| CA-11 Rutas protegidas | `GET /users/me` sin Bearer o con un JWT inválido o vencido → 401 | Sin sesión, `/x` → `/login?redirect=/x`; con sesión, `/x` → 404 y `/login` → `/` |
| CA-12 Sin verificar no confirma asistencia | Unitaria de `requireVerifiedEmail`: sin verificar → 403 `EMAIL_NOT_VERIFIED`; verificado → `next()` | — |
| CA-13 Límite en el registro | El 6.º registro por IP en 1 h → 429 | — |
| Worker | Unitaria del processor con un transporte falso: `accepted`, `failed` y reintentos (`attempt_count`); los enlaces ya no vigentes no se envían (`superseded`); la reconciliación marca como `failed` los `queued` que no tienen job | — |

- **Integración:** Supertest contra `app.ts`, con la base de datos `sh2do_test` (migrada en el `globalSetup`, con las tablas vaciadas entre pruebas) y Redis en la DB 1 (vaciada entre pruebas). La cola BullMQ se sustituye por un stub en las pruebas de API.
- **Ejecución:**
  - Backend: `docker compose exec api npm run test:coverage`.
  - Frontend: `npm run test:coverage -w frontend`, en el host.
  - Umbral del 80 % en los dos.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| `argon2` y Prisma necesitan binarios nativos para Linux | Se instalan dentro del contenedor (Debian slim con openssl); el `node_modules` del host no se usa en Docker |
| Varias peticiones refrescan a la vez y una de ellas parece una reutilización | Una única promesa de refresh por pestaña, `navigator.locks` entre pestañas y un margen de carrera de 10 s en el backend (§5), que además deja un log `Refresh race within margin` |
| La cookie `SameSite=Strict` y los puertos distintos | El proxy de Vite sirve web y API en el mismo origen |
| El host tiene Node 22 y los contenedores, Node 24 | Todo se ejecuta en Docker; en el host solo se generan el lockfile y la ayuda del editor |

## 12. Orden de ejecución

1. **Fase 0, orquestador (secuencial):** `git init` y la rama `feature/STD-6-registro-inicio-sesion`; `.gitignore`; el `package.json` raíz con los workspaces; los `package.json` de `backend` y `frontend` con las dependencias aprobadas; `npm install` (que genera el lockfile).
2. **Fase 1, en paralelo:** `backend-implementer` (T-B*) y `frontend-implementer` (T-F*), los dos contra `contracts/openapi.yaml`.
3. **Fase 2:** integración. Se levanta la app con `scripts/up.ps1` y se hace una prueba de humo del flujo completo con Mailpit.
4. **Fase 3:** `qa-reviewer`.
5. **Fase 4:** tus pruebas manuales.

## 13. Ajustes tras la revisión de QA (21-11-2026)

| Hallazgo | Decisión |
|---|---|
| B-1 Límite de intentos de inicio de sesión saltable con peticiones simultáneas | Corregir: conteo atómico antes de verificar (§7) y prueba de concurrencia |
| M-1 Dos refresh simultáneos cierran la sesión | Corregir: margen de carrera de 10 s en el backend (§5) y `navigator.locks` en el frontend |
| m1 El JWT sigue válido hasta 15 min tras cerrar sesión | Aceptado (§5) |
| m2 El worker envía enlaces anulados | Corregir: revalidar la vigencia antes de enviar (§4.1) |
| m3 Zonas horarias no IANA | Corregido (§7). La primera corrección rechazaba zonas IANA vigentes (N-1, re-revisión de QA) y se ajustó |
| N-1 Zonas IANA vigentes guardadas como `UTC` | Corregir: validar con `Intl.DateTimeFormat` (§7) |
| n1 La carrera del refresh no deja log | Corregir: log `Refresh race within margin`; el margen se mantiene en 10 s |
| m4 Correo en claro en las claves de Redis | Corregir: hash SHA-256 (§7) |
| m5 Aviso de verificación no anunciado | Corregir: `role="region"` con `aria-labelledby` |
| m6 Errores por campo sin `aria-live` | Corregir: resumen de errores con `role="alert"` |
| m7 Mensaje de campo no permitido | Corregido: un error por clave, con `field` = la clave y `message` = "Campo no permitido." |
| m8 `/health` fuera del contrato | Corregido: documentado en `openapi.yaml` |
| m9 Plan y tareas desactualizados | Corregido en este documento y en `task.md` |
| m10 Pruebas que faltan o sobran | Corregir: añadir las que faltan y quitar las redundantes |
| m11 Se pierde `redirect` entre el login y el registro | Corregir: conservar `redirect` en los enlaces |
