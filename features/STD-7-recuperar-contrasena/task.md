# STD-7 — Recuperar mi contraseña · Tareas

> Derivadas de `plan.md`. Las tareas completadas las marca el orquestador según el reporte de cada agente.
> **Leyenda:** `[ ]` pendiente · `[x]` hecha · **Dep.** = tareas de las que depende.

## Fase 0 — Preparación (orquestador)

- [x] **T-00** Añadir el valor `password_changed` al enum `email_deliveries.kind` en `docs/sh2do-model.json` (plan §5).

## Fase 1A — Backend (`backend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-B01** | **Prisma:** modelo `PasswordResetToken` (`password_reset_tokens`), valor `password_changed` en `EmailKind` y la migración `add_password_reset`. | T-00 | — |
| - [x] **T-B02** | `password-reset-token.repository.ts` y `usersService.updatePassword` (con su repository). | T-B01 | CA-05 |
| - [x] **T-B03** | **Correo:** plantillas `reset-password` y `password-changed` (en español); `SendEmailJob.token` opcional; despacho por `kind` en `email.processor.ts`, con la comprobación de vigencia de `reset_password`; la reconciliación reencola los `password_changed`. | T-B01 | CA-01, CA-03, CA-09 |
| - [x] **T-B04** | **`POST /auth/forgot-password`:** límites de intentos (correo e IP), respuesta genérica y la transacción que anula los enlaces anteriores, crea el token y crea el delivery. | T-B02, T-B03 | CA-01, CA-02, CA-03, CA-04 |
| - [x] **T-B05** | **`POST /auth/reset-password/check`** y **`POST /auth/reset-password`:** la transacción de R-06, borrar la cookie y encolar el aviso. | T-B02, T-B03 | CA-05, CA-06, CA-07, CA-08 |
| - [x] **T-B06** | **Pruebas** de integración y unitarias según el plan (§8), incluido el uso simultáneo del mismo token. Cobertura ≥ 80 %. | T-B04, T-B05 | Todos |
| - [x] **T-B07** | **Verificación:** `lint`, `typecheck` y `test:coverage` sin errores; migración aplicada con `scripts/up.ps1`; prueba de humo con curl y Mailpit. | T-B06 | — |

## Fase 1B — Frontend (`frontend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-F01** | Ampliar `gen:api` para generar `src/api/generated/std-7.ts` y añadir `forgotPassword`, `checkResetToken` y `resetPassword` en `authApi.ts`, más `clearSession()` en el `AuthProvider`. | — | — |
| - [x] **T-F02** | **`ForgotPasswordPage`** (`/forgot-password`, con `RedirectIfAuthenticated`): mensaje genérico con `role="status"`, 422 y 429. | T-F01 | CA-01, CA-02, CA-04, CA-10 |
| - [x] **T-F03** | **`ResetPasswordPage`** (`/reset-password`, sin guardas): comprueba el token al montar (una sola vez), formulario con confirmación, `ErrorSummary`, estado de enlace no válido o vencido, y al terminar cierra la sesión local y navega a `/login`. | T-F01 | CA-05, CA-06, CA-07 |
| - [x] **T-F04** | **`LoginPage`:** enlace "¿Olvidaste tu contraseña?" y el aviso que llega tras el cambio (R-08). | T-F03 | CA-05, CA-10 |
| - [x] **T-F05** | **Pruebas** con Testing Library según el plan (§8). Cobertura ≥ 80 %. `lint`, `typecheck` y `build` sin errores. | T-F02–T-F04 | Todos |

## Fase 2 — Integración (orquestador)

- [x] **T-I01** Prueba de humo a través del proxy de Vite: solicitud, correo en Mailpit, comprobación, cambio, aviso en Mailpit, inicio de sesión con la contraseña nueva, enlace usado y sesiones revocadas. *(21-11: OK a través del proxy de Vite.)*

## Fase 3 — QA (`qa-reviewer`)

- [x] **T-Q01** Revisión completa y veredicto. *(Aprobado con observaciones; ver plan §10.)*

## Fase 4 — Validación y entrega

- [x] **T-V01** Tus pruebas manuales y aprobación. Mover STD-7 a **Done** o a **Returned**. *(Aprobado por el responsable el 21-11-2026.)*
- [ ] **T-V02** Commit en `feature/STD-7-recuperar-contrasena` y pull request hacia `main`. Dos commits: `chore` con el formato de Prettier de los archivos de STD-6 y la comprobación de formato en `lint`, y `feat` con STD-7.
