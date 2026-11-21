# STD-7 — Recuperar mi contraseña · Plan de implementación

> **Spec:** STD-7 en Jira (épica STD-1), refinada el 21-11-2026 · **Backlog:** US-016
> **Depende de:** STD-6 (cuentas, sesiones, correo y worker ya existen).
> **Estado del plan:** aprobado el 21-11-2026. Ajustado tras la revisión de QA (ver §10).

---

## 1. Objetivo

Que un usuario que olvidó su contraseña pida un enlace a su correo y, con él, fije una contraseña nueva. Esta feature reutiliza la base de STD-6: el módulo `auth`, el worker de correo, los límites de intentos y las sesiones.

## 2. Alcance

| Incluido | Fuera de alcance |
|---|---|
| Página "¿Olvidaste tu contraseña?" y enlace desde el login | Preguntas de seguridad u otros métodos de verificación de identidad |
| Correo con enlace de un solo uso, válido 24 h | 2FA |
| Página para fijar la contraseña nueva, con confirmación | Cambiar la contraseña desde el perfil (con sesión) |
| Cierre de todas las sesiones y correo de aviso tras el cambio | — |

## 3. Decisiones del refinamiento

| # | Decisión |
|---|---|
| R-01 | **Respuesta genérica:** la solicitud responde siempre lo mismo ("Si existe una cuenta con ese correo, te enviamos un enlace"), exista o no la cuenta (constitución §7). Si la cuenta no existe, no se envía nada. |
| R-02 | El enlace **vence en 24 h** y es de **un solo uso**. Cada solicitud nueva **anula** los enlaces anteriores sin usar. |
| R-03 | **Límites de intentos de la solicitud:** 3 por hora por correo y 10 por hora por IP, con respuesta `429` y la cabecera `Retry-After`. El límite por correo cuenta igual exista o no la cuenta, así que no revela nada. |
| R-04 | La contraseña nueva sigue la regla del registro: entre 8 y 128 caracteres, sin reglas de composición. La confirmación se valida en el frontend. Se permite repetir la contraseña anterior. |
| R-05 | Al abrir el enlace, la página **comprueba antes** si sigue vigente, para que el usuario no escriba la contraseña en vano. Si venció, ya se usó o fue reemplazado, se muestra "El enlace venció o ya se usó" con la opción de pedir otro. |
| R-06 | **Efectos del cambio, en una sola transacción:** se guarda el nuevo hash, se marca el enlace como usado, se anulan los demás enlaces pendientes, se **cierran todas las sesiones** del usuario y, si el correo no estaba verificado, se marca como **verificado**. |
| R-07 | Después del cambio se envía el **correo de aviso** "Tu contraseña de Sh2do cambió", sin enlaces. |
| R-08 | Después del cambio, el frontend **cierra la sesión local** (si la había) y lleva a `/login`, con el aviso "Tu contraseña se cambió. Inicia sesión con la nueva". |
| R-09 | **Rutas del frontend:** `/forgot-password` es pública y, con sesión, redirige a `/`, igual que `/login`. `/reset-password?token=…` es pública con o sin sesión, igual que `/verify-email`. El login muestra el enlace "¿Olvidaste tu contraseña?". |

## 4. Diseño

### 4.1 Backend (módulo `auth`)

**Archivos nuevos o modificados**

| Archivo | Contenido |
|---|---|
| `password-reset-token.repository.ts` (nuevo) | `create`, `findById`, `findByHash`, `markUsed`, `invalidateUnused` |
| `auth.service.ts` | `requestPasswordReset`, `checkPasswordResetToken`, `resetPassword` e `isPasswordResetLinkCurrent` (este último para el worker) |
| `auth.schemas.ts`, `auth.controller.ts`, `auth.routes.ts` | Los 3 endpoints nuevos |
| `users.service.ts` y `users.repository.ts` | `updatePassword(userId, hash, tx)`. `markEmailVerified` ya existe |
| `session.repository.ts` | Reutiliza `revokeAllForUser` |
| `shared/mail/templates/` | `reset-password.ts` y `password-changed.ts`, en español |
| `shared/queue/queues.ts` | `SendEmailJob.token` pasa a ser opcional, porque el aviso no lleva token |
| `worker/email.processor.ts` | Despacho por `kind`, con un caso por tipo de correo (ver abajo) |
| `worker/reconcile.ts` | Los `password_changed` sin job **se reencolan**, porque no dependen de un token. Los que llevan token siguen marcándose `failed` |

El worker trata cada tipo de correo así:
- `verify_email`: igual que en STD-6.
- `reset_password`: revalida con `isPasswordResetLinkCurrent` y, si el enlace ya no vale, lo marca `superseded`. La URL es `APP_URL/reset-password?token=`.
- `password_changed`: plantilla sin enlace.

**Flujos**

1. **Solicitud** (`POST /auth/forgot-password`):
   1. Normaliza el correo y aplica `consume` con las claves `rl:pwreset:ip:<ip>` (10 por hora) y `rl:pwreset:<sha256(email)>` (3 por hora).
   2. Busca el usuario. Si no existe, responde `202` sin hacer nada más.
   3. Si existe, en una transacción anula los enlaces pendientes, crea un token nuevo (+24 h) y crea un delivery `reset_password` con `dedupe_key = reset_password:<tokenId>`.
   4. Encola el job después del commit y responde `202`.
2. **Comprobación** (`POST /auth/reset-password/check`): busca el token por su hash y responde `204` si es vigente. Si no, responde `400` con `PASSWORD_RESET_TOKEN_INVALID` (inexistente, usado o anulado) o con `PASSWORD_RESET_TOKEN_EXPIRED`. No modifica nada.
3. **Cambio** (`POST /auth/reset-password`):
   1. Valida el token igual que la comprobación.
   2. Hashea la contraseña con Argon2id.
   3. En una transacción: `markUsed` (si otra petición ya lo usó, responde `PASSWORD_RESET_TOKEN_INVALID`), `updatePassword`, `invalidateUnused`, `revokeAllForUser`, `markEmailVerified` si hacía falta, y crea el delivery `password_changed` con `dedupe_key = password_changed:<tokenId>`.
   4. Encola el aviso después del commit.
   5. Responde `204` y **borra la cookie** de refresh, porque esa sesión ya no vale.

- **Tiempo de respuesta:** con un correo inexistente la solicitud se ahorra la transacción, unos pocos milisegundos. No se iguala artificialmente: con el límite de 3 por hora por correo y 10 por hora por IP no hay volumen suficiente para medir esa diferencia.
- **Logs:** el token nunca se registra, porque va en el body, no en la URL.

### 4.2 Frontend

| Archivo | Contenido |
|---|---|
| `features/auth/ForgotPasswordPage.tsx` (nuevo) | Campo de correo. Tras el envío muestra el mensaje genérico (R-01) anunciado con `role="status"`, y también muestra 422 y 429 |
| `features/auth/ResetPasswordPage.tsx` (nuevo) | Lee `token` y llama a `check` al montar, una sola vez (igual que `VerifyEmailPage`). Si es válido, muestra contraseña y confirmación (errores por campo y `ErrorSummary`). Si no, muestra el mensaje con el enlace a `/forgot-password`. Al terminar, cierra la sesión local y navega a `/login` |
| `features/auth/LoginPage.tsx` | Enlace "¿Olvidaste tu contraseña?" y el aviso de R-08 cuando llega desde el cambio (estado de navegación) |
| `features/auth/authApi.ts`, `AuthProvider.tsx` | `forgotPassword`, `checkResetToken` y `resetPassword`. El `AuthProvider` expone `clearSession()` para el cierre local |
| `app/router.tsx` | `/forgot-password` bajo `RedirectIfAuthenticated` y `/reset-password` sin guardas |
| `package.json` (`gen:api`) | Genera también `src/api/generated/std-7.ts` desde el contrato de STD-7 |

## 5. Datos

- **Tabla `password_reset_tokens`:** ya existe en `sh2do-model.json` y se añade a `schema.prisma` tal cual: `user_id`, `token_hash` único (VARCHAR 64), `expires_at`, `used_at`, `created_at`, con un índice por `user_id`.
- **Desviación del modelo:** se añade el valor `password_changed` al enum `email_deliveries.kind`, porque lo necesita el correo de aviso (R-07). El orquestador actualiza `sh2do-model.json` antes de implementar (constitución §5).
- **Migración nueva:** `add_password_reset`.
- **Desviación documentada (QA M1):** la FK `password_reset_tokens.user_id` usa `ON DELETE RESTRICT`, igual que las FK a `users` de STD-6 (`user_sessions`, `email_verification_tokens` y `email_deliveries`), aunque `sh2do-model.json` indica `Cascade`. Se mantiene `RESTRICT` en todas las FK hacia `users` hasta que exista la feature de borrado de cuenta, que decidirá el comportamiento. Hoy no hay borrado de usuarios en el alcance.

## 6. API

El contrato completo está en `contracts/openapi.yaml`. Todas las rutas van bajo `/api/v1` y ninguna requiere sesión.

| Método y ruta | Resumen | Éxito | Errores |
|---|---|---|---|
| `POST /auth/forgot-password` | Pide el enlace. La respuesta es siempre genérica | `202` | 422, 429 |
| `POST /auth/reset-password/check` | Comprueba si el enlace sigue vigente | `204` | 400, 422 |
| `POST /auth/reset-password` | Fija la contraseña nueva | `204` + cookie borrada | 400, 422 |

Códigos de error nuevos: `PASSWORD_RESET_TOKEN_INVALID` y `PASSWORD_RESET_TOKEN_EXPIRED`.

## 7. Dependencias

**Ninguna nueva.** Todo se hace con lo que ya instaló STD-6.

## 8. Pruebas: qué prueba verifica cada criterio

| Criterio (Jira) | Backend | Frontend |
|---|---|---|
| CA-01 La solicitud envía un enlace | 202; token guardado como hash con +24 h; delivery `reset_password`; job encolado | Envía el correo y muestra el mensaje genérico |
| CA-02 Correo inexistente | 202 con el mismo cuerpo; ningún token ni delivery | — (el mismo mensaje) |
| CA-03 Una solicitud nueva anula la anterior | El token anterior → 400 `INVALID`; el worker marca `superseded` el correo anterior que siga pendiente | — |
| CA-04 Límites de intentos | La 4.ª solicitud para un mismo correo → 429; la 11.ª desde una misma IP → 429 | Muestra el mensaje del 429 |
| CA-05 Cambio correcto | 204; la contraseña nueva funciona y la anterior no; todas las sesiones revocadas (refresh → 401); cookie borrada; delivery `password_changed` | Navega a `/login` con el aviso y la sesión local queda limpia |
| CA-06 La confirmación no coincide o la contraseña es inválida | 422 si la contraseña tiene menos de 8 o más de 128 caracteres | El error de "no coincide" y el de longitud se muestran por campo, sin llamar a la API |
| CA-07 Enlace vencido, usado o reemplazado | `check` y `reset` → 400 con su código (vencido con reloj controlado); dos `reset` simultáneos con el mismo token → solo uno da 204 | Muestra el mensaje y el enlace para pedir otro |
| CA-08 Cuenta sin verificar | Después del cambio, `email_verified_at` tiene valor | — |
| CA-09 Correo de aviso | El processor envía `password_changed` sin enlace; la reconciliación reencola un `password_changed` que no tenga job | — |
| CA-10 Navegación | — | El login enlaza a `/forgot-password`; con sesión, `/forgot-password` redirige a `/`; `/reset-password` funciona con y sin sesión |

La cobertura sigue con el umbral del 80 % en los dos workspaces.

## 9. Orden de ejecución

1. **Fase 0, orquestador:** actualizar `sh2do-model.json` (valor `password_changed` en el enum). No hay dependencias que instalar.
2. **Fase 1, en paralelo:** `backend-implementer` (T-B*) y `frontend-implementer` (T-F*), contra `contracts/openapi.yaml`.
3. **Fase 2, integración:** prueba de humo a través del proxy de Vite y de Mailpit.
4. **Fase 3:** `qa-reviewer`.
5. **Fase 4:** tus pruebas manuales. Con tu aprobación, STD-7 pasa a **Done** y se abre la **pull request** hacia `main`.

## 10. Ajustes tras la revisión de QA (21-11-2026)

Veredicto: **aprobado con observaciones**.

| Hallazgo | Decisión |
|---|---|
| M1 FK `RESTRICT` frente a `Cascade` del modelo | Documentado en §5 |
| 1 Archivos sin formatear con Prettier | Corregido: todo el frontend formateado, y `lint` incluye `prettier --check` en los dos workspaces |
| 2 Estado del plan desactualizado | Corregido |
| 7 El 400 por JSON mal formado no estaba en el contrato | Corregido en `openapi.yaml` |
| 3, 4, 5, 6, 8 y 9 Pruebas adicionales, foco tras enviar, aviso del login, log de la reconciliación, prueba con 429 | Aceptados sin cambios por el responsable |
| 10 Límite por IP detrás de un proxy | Pendiente para EN-006 (Incremento 3) |
