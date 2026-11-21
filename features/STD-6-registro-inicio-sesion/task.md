# STD-6 — Registro e inicio de sesión · Tareas

> Derivadas de `plan.md`. Las tareas completadas las marca el orquestador según el reporte de cada agente.
> **Leyenda:** `[ ]` pendiente · `[x]` hecha · **Dep.** = tareas de las que depende.

## Fase 0 — Preparación (orquestador)

- [x] **T-00** Ejecutar `git init` y crear la rama `feature/STD-6-registro-inicio-sesion`. `.gitignore` excluye: `.env`, `node_modules/`, `dist/`, `coverage/`, `*.log` y los datos locales.
- [x] **T-01** Crear el `package.json` raíz con los workspaces `backend` y `frontend`, el `package.json` de cada workspace con las dependencias aprobadas en el plan (§9), y ejecutar un único `npm install`. *Nota: `prisma` y `@prisma/client` se fijan en la versión exacta `7.10.1`, porque la etiqueta `latest` de `prisma` apunta a una prerelease (`8.0.0-rc.34`).*

## Fase 1A — Backend (`backend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-B01** | **Infraestructura:** `docker-compose.yml` (mysql, redis, mailpit, api, worker, web, con healthchecks), init SQL de `sh2do_test`, `backend/Dockerfile` y `frontend/Dockerfile`, `.env.example`, `scripts/up.ps1` y `scripts/down.ps1`. | T-01 | EN-001 |
| - [x] **T-B02** | **Base de TypeScript:** `tsconfig` estricto en ESM, ESLint flat config y Prettier en la raíz, scripts de npm (`lint`, `typecheck`, `test`, `test:coverage`). | T-01 | EN-001 |
| - [x] **T-B03** | `shared/config/env.ts` (Zod), `logger.ts` (pino, con datos sensibles ocultos), `clock.ts`, `db/prisma.ts`. | T-B02 | EN-001, EN-004 |
| - [x] **T-B04** | **Prisma:** modelos `users`, `user_sessions`, `email_verification_tokens` y `email_deliveries` según el plan (§5), y la migración inicial. | T-B03 | EN-001 |
| - [x] **T-B05** | **HTTP compartido:** `AppError` y el error handler a Problem Details, el middleware `validate` (Zod → 422), `request-id`, `helmet`, `cors` y el límite del body. `app.ts`, `server.ts` y `GET /health`. | T-B03 | EN-004 |
| - [x] **T-B06** | **Seguridad:** `password.ts` (Argon2id), `tokens.ts` (randomBytes + SHA-256), `jwt.ts` (jose HS256, 15 min) y `rate-limit.ts` (ioredis), con sus pruebas unitarias. | T-B03 | EN-004, CA-08, CA-13 |
| - [x] **T-B07** | **Correo y cola:** `mailer.ts`, la plantilla `verify-email` (en español, con `APP_URL/verify-email?token=`), `email-deliveries.repository.ts`, `queues.ts` y el worker (`index.ts` con reconciliación, `email.processor.ts` con reintentos), con sus pruebas unitarias. | T-B04 | EN-003, CA-01, CA-05 |
| - [x] **T-B08** | **Módulo `users`:** repository, service (crear con el correo normalizado, buscar por correo o id, marcar como verificado) y `GET /users/me`. | T-B04, T-B05 | CA-11 |
| - [x] **T-B09** | **Módulo `auth`, sesiones:** `session.repository`, rotación con detección de reutilización, cookie `sh2do_rt`, `requireAuth` (Bearer → `req.user`) y `requireVerifiedEmail`. | T-B06, T-B08 | CA-10, CA-11, CA-12 |
| - [x] **T-B10** | **`POST /auth/register`:** transacción (usuario + token + delivery), encolar después del commit, sesión, 409 y rate limit. | T-B07, T-B09 | CA-01, CA-02, CA-03, CA-13 |
| - [x] **T-B11** | **`POST /auth/login`**, con verificación ficticia si el correo no existe y rate limit de fallos; **`POST /auth/refresh`**; **`POST /auth/logout`**. | T-B09 | CA-06, CA-07, CA-08, CA-09, CA-10 |
| - [x] **T-B12** | **`POST /auth/verify-email`** y **`POST /auth/verification-email`** (reenvío: anula los tokens anteriores, 409 si ya está verificado, rate limit). | T-B07, T-B09 | CA-04, CA-05 |
| - [x] **T-B13** | **Pruebas de integración** de todos los endpoints según el plan (§10), el `globalSetup` de la BD de pruebas y el reset de Redis. Cobertura ≥ 80 %. | T-B10–T-B12 | Todos |
| - [x] **T-B14** | **Verificación:** `lint`, `typecheck` y `test:coverage` sin errores; `scripts/up.ps1` levanta todo; prueba de humo con curl (registro → correo en Mailpit → verificación → inicio y cierre de sesión). | T-B13 | EN-001 |

## Fase 1B — Frontend (`frontend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-F01** | **Base:** `vite.config.ts` (plugin de React, Tailwind y proxy de `/api` a `http://api:3000`), `tsconfig` estricto, `index.html` con `lang="es"`, configuración de Vitest (jsdom, setup de jest-dom, umbral del 80 %) y el script `gen:api`. | T-01 | EN-001 |
| - [x] **T-F02** | **Componentes shadcn/ui:** `button`, `input`, `label`, `card`, `alert`, `utils` (`cn`) y los tokens de Tailwind. | T-F01 | — |
| - [x] **T-F03** | Generar `src/api/generated/std-6.ts` desde el contrato. **`client.ts`:** Bearer en memoria, `credentials: 'same-origin'`, un único refresh compartido ante 401 y parseo de Problem Details a `ApiError`. | T-F01 | CA-10, CA-11 |
| - [x] **T-F04** | **`AuthProvider` / `useAuth`:** restaura la sesión al cargar (refresh), y expone `login`, `register`, `logout`, `resendVerification` y el estado de carga. | T-F03 | CA-06, CA-09, CA-10 |
| - [x] **T-F05** | **Router:** rutas públicas (`/login`, `/register`, `/verify-email`), `RequireAuth` (cualquier otra ruta → `/login?redirect=`), `RedirectIfAuthenticated`, `AppLayout`, `HomePage` y `NotFoundPage` (solo con sesión). Validación de `redirect` interno. | T-F04 | CA-11 |
| - [x] **T-F06** | **`RegisterPage`:** nombre, correo, contraseña y confirmación; detección de la zona horaria; errores por campo (422); 409 con enlace al inicio de sesión; 429. | T-F05 | CA-01, CA-02, CA-03 |
| - [x] **T-F07** | **`LoginPage`:** mensaje genérico ante 401, 429 y vuelta a `redirect`. | T-F05 | CA-06, CA-07, CA-08 |
| - [x] **T-F08** | **`VerifyEmailPage`** (lee `token`, llama a la API y muestra éxito, vencido o inválido) y **`VerifyEmailBanner`** con el botón de reenvío (202, 409, 429, anunciado por `aria-live`). | T-F05 | CA-04, CA-05 |
| - [x] **T-F09** | **Accesibilidad y diseño responsive:** etiquetas, foco en el primer error y en el título al cambiar de ruta, navegación por teclado, contraste y diseño desde 360 px. | T-F06–T-F08 | WCAG 2.2 AA |
| - [x] **T-F10** | **Pruebas** con Testing Library según el plan (§10), con `fetch` simulado. Cobertura ≥ 80 %. `lint` y `typecheck` sin errores. | T-F06–T-F09 | Todos |

## Fase 2 — Integración (orquestador)

- [x] **T-I01** Levantar la app con `scripts/up.ps1` y recorrer el flujo en el navegador: registro, correo en Mailpit (http://localhost:8025), verificación, cierre de sesión, inicio de sesión, ruta protegida y 404. *(21-11: verificado por API a través del proxy de Vite; el recorrido visual en el navegador queda para las pruebas manuales.)*
- [x] **T-I02** Comprobar que `openapi.yaml`, la API y los tipos generados coinciden. *(QA: los tipos generados son idénticos al contrato.)*

## Fase 3 — QA (`qa-reviewer`)

- [x] **T-Q01** Revisión completa y veredicto. *(Rechazado: B-1, M-1 y menores.)*

## Fase 4 — Validación (responsable)

- [x] **T-V01** Pruebas manuales y aprobación. Mover STD-6 a **Finalizada** o a **Returned**. *(Aprobado por el responsable el 21-11-2026.)*

## Fase 3b — Correcciones de QA (21-11-2026)

- [x] **T-B15** (backend) B-1: conteo atómico del límite de inicio de sesión antes de verificar la contraseña, con prueba de peticiones simultáneas.
- [x] **T-B16** (backend) M-1: margen de carrera de 10 s en el refresh, sin revocar todas las sesiones ni borrar la cookie.
- [x] **T-B17** (backend) m2, m3, m4 y m7: revalidar los enlaces antes de enviarlos, zonas horarias IANA canónicas, hash del correo en las claves de Redis, mensaje de campo no permitido.
- [x] **T-B18** (backend) m10: pruebas que faltan (`Secure` con `COOKIE_SECURE`, límites superiores, aislamiento de la clave correo + IP, `jobId`) y quitar las redundantes.
- [x] **T-F11** (frontend) M-1: `navigator.locks` para serializar el refresh entre pestañas.
- [x] **T-F12** (frontend) m5, m6, m10 y m11: `role="region"` en el aviso, resumen de errores con `role="alert"`, ajuste de pruebas y conservar `redirect`.
- [x] **T-Q02** Nueva revisión de QA. *(Rechazado: N-1, regresión de m3.)*
- [x] **T-B19** (backend) N-1: aceptar las zonas IANA vigentes (`Intl.DateTimeFormat`) y n1: log `Refresh race within margin`.
- [x] **T-Q03** Comprobación de QA de N-1. *(APROBADO.)*
