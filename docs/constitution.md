# Sh2do — Constitución técnica

> Reglas **innegociables** para agentes y desarrolladores. Se leen antes de cualquier tarea.
> **Jerarquía:** `docs/product.md` (qué) → **este documento** (reglas técnicas) → `STD-###` en Jira (spec de la feature) → `features/STD-###-*/plan.md` (cómo).
> Si un plan o una spec contradicen este documento, gana este documento. Si este documento contradice `product.md`, gana `product.md`, y el conflicto se reporta antes de implementar.
> Las palabras **DEBE** y **NO DEBE** indican obligación. **PUEDE** indica que algo está permitido.

---

## 1. Principios

1. **Spec primero.** No se escribe código sin una spec `STD-###` refinada y un `plan.md` aprobado por el responsable.
2. **Alcance estricto.** Cada feature implementa solo lo que su `STD-###` pide. Cualquier trabajo fuera del alcance se avisa **antes** de hacerlo.
3. **Contrato primero.** `features/STD-###-*/contracts/openapi.yaml` es el acuerdo entre la API y el frontend. Ninguno de los dos se desvía de él sin actualizarlo primero.
4. **El servidor manda.** Toda regla de negocio y toda autorización se aplican en el backend. El frontend solo las refleja.
5. **MySQL es la fuente de la verdad.** Redis y BullMQ solo ejecutan trabajos, y cualquier trabajo se puede reconstruir desde MySQL.
6. **Simple antes que ingenioso.** Monolito modular, sin microservicios, sin abstracciones especulativas y sin código "por si acaso".
7. **Dependencias con aviso.** No se instala ninguna dependencia nueva, ni de runtime ni de desarrollo, sin avisar al responsable y obtener su visto bueno.

## 2. Stack obligatorio

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 24 LTS · TypeScript en modo `strict` · ESM |
| Monorepo | **npm workspaces**: `backend` y `frontend` |
| API | **Express** + TypeScript · REST JSON bajo `/api/v1` |
| Validación | **Zod**, solo en el backend, para cada entrada: body, query, params y variables de entorno |
| ORM y base de datos | **Prisma** + **MySQL 8** |
| Colas | **Redis** + **BullMQ**, en un proceso **worker** separado de la API |
| Correo | **Nodemailer** por SMTP. En local, **Mailpit** captura los correos |
| Frontend | **Vite** + **React** + TypeScript · **React Router** · **TanStack Query** |
| UI | **Tailwind CSS** + componentes accesibles **Radix / shadcn/ui** |
| Tipos del frontend | Se **generan** con `openapi-typescript` desde los contratos OpenAPI; no se escriben a mano |
| Fechas | Instantes en UTC con la zona IANA guardada; los cálculos de zona horaria se hacen con **Luxon** |
| Pruebas | **Vitest** · **Supertest** (API) · **Testing Library** (frontend) · cobertura con `@vitest/coverage-v8` |
| Infraestructura | **Docker** + Docker Compose |

## 3. Estructura del repositorio

```
/
├─ package.json              # npm workspaces: backend, frontend
├─ docker-compose.yml
├─ .env.example              # todas las variables, sin valores secretos (se versiona)
├─ .env                      # valores locales (NO se versiona)
├─ scripts/
│  ├─ up.ps1                 # levanta la aplicación en Docker
│  └─ down.ps1               # detiene la aplicación
├─ docs/                     # product.md, constitution.md, sh2do-model.json, product-backlog.md
├─ features/STD-###-nombre/  # plan.md, task.md, contracts/openapi.yaml
├─ backend/
│  ├─ prisma/                # schema.prisma, migrations/, seed
│  ├─ src/
│  │  ├─ api/                # arranque de Express (server.ts, app.ts)
│  │  ├─ worker/             # arranque del worker BullMQ y sus processors
│  │  ├─ modules/<modulo>/   # ver §4
│  │  ├─ shared/             # config, errores, middleware, logger, prisma client, mail, queue
│  │  └─ ...
│  └─ test/                  # helpers y pruebas de integración
└─ frontend/
   └─ src/
      ├─ app/                # router, providers, layout
      ├─ features/<modulo>/  # páginas, componentes y hooks de la feature
      ├─ components/ui/      # componentes base (shadcn/ui)
      ├─ api/                # cliente HTTP y tipos generados (generated/)
      └─ lib/
```

## 4. Arquitectura del backend

### 4.1 Módulos de dominio
`auth`, `users`, `tasks`, `tags`, `recurrence`, `plans`, `participation`, `share-links`, `reminders`, `notifications`, `jobs`.

### 4.2 Capas de cada módulo (obligatorias)

```
routes → controller → service → repository (Prisma)
```

| Capa | Responsabilidad | NO DEBE |
|---|---|---|
| `*.routes.ts` | Declarar rutas, aplicar middleware de autenticación y validación Zod | Contener lógica |
| `*.controller.ts` | Traducir HTTP ↔ servicio: leer la request ya validada y dar forma a la respuesta y al código HTTP | Acceder a Prisma ni aplicar reglas de negocio |
| `*.service.ts` | Reglas de negocio, autorización por recurso, transacciones y orquestación entre módulos | Conocer `req`/`res` de Express |
| `*.repository.ts` | El único lugar con acceso a Prisma para las tablas del módulo | Contener reglas de negocio |
| `*.schemas.ts` | Esquemas Zod de entrada y DTOs de salida | — |

- **DEBE** haber fronteras entre módulos: un módulo **NO DEBE** acceder al repositorio ni a las tablas de otro. Lo hace a través del **servicio** del otro módulo.
- Las operaciones que cambian varias tablas, o que programan recordatorios o notificaciones, **DEBEN** ir en una transacción Prisma.
- La API y el worker comparten `modules/` y `shared/`. Solo cambia el punto de arranque.

### 4.3 Trabajos asíncronos (worker)
- Antes de crear un job de BullMQ, el registro durable correspondiente (`scheduled_reminders`, `email_deliveries`) **DEBE** existir en MySQL.
- Cada job **DEBE** ser idempotente: antes de actuar, revalida en MySQL que el aviso sigue vigente y usa `dedupe_key` o `event_key`.
- Al arrancar, el worker **DEBE** reconciliar: reprograma los registros `pending` que no tengan job y marca los obsoletos.
- Los reintentos de correo son 3, con espera exponencial. Un recordatorio obsoleto (más de 2 h tarde) no se envía (`product.md` D-12).

## 5. Base de datos

- `docs/sh2do-model.json` es el modelo de referencia. `schema.prisma` **DEBE** respetarlo, con tablas y columnas en `snake_case` (`@@map` / `@map`) y modelos y campos en `camelCase` en TypeScript.
- Cualquier desviación del modelo (una columna, un índice o una restricción nuevos) **DEBE** justificarse en el `plan.md` de la feature y actualizar `sh2do-model.json`.
- Los cambios de esquema se hacen solo con `prisma migrate`. Las migraciones se versionan y **NO DEBEN** editarse una vez aplicadas en un entorno compartido.
- Las fechas y horas se guardan en **UTC** junto con la zona IANA y la fecha y hora locales cuando el modelo lo prevé. Nunca se usa la hora local del servidor.
- Las restricciones que el modelo no puede expresar (por ejemplo "exactamente una FK destino", "máximo 3 slots" o "un enlace vigente por plan") **DEBEN** validarse en el servicio y cubrirse con pruebas.

## 6. Convenciones de la API

- Rutas REST en inglés, en plural y en `kebab-case`, bajo `/api/v1` (p. ej. `/api/v1/tasks/:id/occurrences`).
- El JSON de requests y responses va en **`camelCase`**. Las fechas van en ISO 8601: los instantes en UTC con `Z`, y las fechas y horas locales como `YYYY-MM-DD` y `HH:mm` junto con `timezone`.
- **Errores:** usan el formato **Problem Details (RFC 9457)**, con `Content-Type: application/problem+json`:
  ```json
  { "type": "https://sh2do.app/problems/validation-error", "title": "Datos inválidos", "status": 422,
    "detail": "Revisa los campos marcados.", "code": "VALIDATION_ERROR",
    "errors": [{ "field": "title", "message": "El título es obligatorio." }] }
  ```
  - `code` en `UPPER_SNAKE_CASE`, estable y documentado en el contrato.
  - `title`, `detail` y `message` en **español**, aptos para mostrarse al usuario.
  - Códigos HTTP: `400` request malformada · `401` sin sesión · `403` sesión válida pero acción prohibida (p. ej. correo sin verificar) · `404` recurso inexistente **o ajeno** · `409` conflicto de estado · `422` validación · `429` límite de intentos.
- Los listados se paginan por cursor (`?cursor=&limit=`, con `limit` máximo de 100).
- Toda ruta nueva **DEBE** estar en el `openapi.yaml` de su feature (OpenAPI 3.1) **antes** de implementarse.

## 7. Seguridad

- **Contraseñas:** se hashean con **Argon2id**. Nunca se registran en logs ni se devuelven.
- **Sesión:**
  - El access token es un JWT de corta duración (unos 15 min) que el frontend guarda **solo en memoria**.
  - El refresh token es opaco y aleatorio. Va en una cookie `HttpOnly`, `Secure` (fuera de local), `SameSite=Strict`, con `Path` limitado a la ruta de refresco. Se **rota en cada uso** y se guarda como hash en `user_sessions`.
  - Cerrar sesión revoca el refresh token. Detectar la reutilización de un refresh ya rotado revoca la sesión.
- **Tokens** de verificación, recuperación y enlace de plan: tienen al menos 32 bytes de `crypto.randomBytes`. Se guardan solo como **hash SHA-256**, y el valor en claro solo aparece en la URL o en el correo.
- **Autorización por recurso:** cada servicio verifica la propiedad o la participación. Un recurso ajeno responde `404`, para no revelar que existe.
- **Respuestas genéricas** en el inicio de sesión y la recuperación de contraseña: nunca revelan si un correo existe.
- **Límite de intentos** en el inicio de sesión, el registro, la recuperación de contraseña, el reenvío de verificación y el acceso por token de plan.
- **Cabeceras y CORS:** cabeceras de seguridad HTTP, y CORS restringido al origen del frontend configurado.
- **Secretos:** solo en variables de entorno. `.env` **NO DEBE** versionarse; `.env.example` sí, sin valores reales. Las variables se validan con Zod al arrancar: si falta alguna, el proceso no arranca.

## 8. Frontend

- Las llamadas HTTP pasan por un único cliente en `src/api/`, que añade el access token y renueva la sesión ante un `401`.
- El estado del servidor se maneja **solo** con TanStack Query, sin duplicarlo en stores globales.
- Los tipos de requests y responses se generan desde el OpenAPI (`openapi-typescript`) en `src/api/generated/`. Esos archivos no se editan a mano.
- La validación en formularios es solo para la experiencia de usuario. La validación que vale es la del servidor, y los errores `422` se muestran por campo.
- **Accesibilidad (objetivo WCAG 2.2 AA):**
  - HTML semántico, etiquetas asociadas a cada campo, foco visible, navegación completa por teclado, contraste suficiente y mensajes de error anunciados (`aria-live`).
  - Se usan los componentes de Radix/shadcn en lugar de reimplementar diálogos, menús o selects.
- **Responsive** desde 360 px de ancho.
- Todos los textos de la interfaz y de los correos están en **español**.
- Las fechas se muestran en la zona horaria del usuario que mira.

## 9. Pruebas

- **Regla por criterio:** cada criterio de aceptación de la `STD-###` **DEBE** tener al menos una prueba automatizada que lo verifique.
- **Cobertura mínima: 80 %** de líneas en `backend` y en `frontend`, medida con `vitest --coverage`. Bajar del umbral bloquea el cierre de la feature.
- **Pruebas mínimas obligatorias:**

  | Tipo | Qué cubre |
  |---|---|
  | Unitarias (Vitest) | Reglas de negocio de los servicios: recurrencias, cálculo de recordatorios, zonas horarias, fin de mes |
  | Integración (Vitest + Supertest) | Cada endpoint contra una **MySQL de pruebas** en Docker: el caso feliz, la validación y la **autorización** (acceso ajeno → `404`, sin sesión → `401`) |
  | Frontend (Vitest + Testing Library) | Formularios, estados de carga y error, y flujos clave de cada pantalla, con la API simulada |

- **No excederse.** No se escriben pruebas redundantes, ni pruebas de librerías de terceros, ni snapshots, ni pruebas de detalles de implementación. Una prueba que no verifica un criterio, una regla o un caso borde relevante sobra.
- **Sin E2E automatizado.** No se escriben pruebas E2E (Playwright, Cypress). Los flujos completos se validan con las pruebas manuales del responsable.
- Las pruebas **DEBEN** ser deterministas: reloj controlado (`vi.useFakeTimers` o un reloj inyectable), sin depender de la red externa, con correo simulado y con la BD limpia entre pruebas.

## 10. Calidad del código

- TypeScript `strict`, sin `any` implícito. Un `any` explícito necesita un comentario que lo justifique.
- Lint y formato con ESLint y Prettier. El código entregado no tiene errores de lint, de tipos ni de pruebas (`npm run lint`, `npm run typecheck`, `npm test`).
- **Idioma:** los identificadores, rutas, tablas, nombres de archivo y commits van en **inglés**. La interfaz, los correos, los mensajes de error y la documentación van en **español**.
- **Nombres:**
  - `camelCase` para variables y funciones; `PascalCase` para tipos y componentes.
  - `kebab-case` para los archivos del backend; `PascalCase.tsx` para los componentes.
  - `UPPER_SNAKE_CASE` para constantes y códigos de error.
- Los comentarios explican el **porqué**, no el qué. No se deja código comentado ni `console.log` (se usa el logger).
- **Logs:** JSON estructurado, con id de request, sin contraseñas, tokens ni datos personales innecesarios. Los fallos de jobs y de correo siempre se registran.

## 11. Docker y entorno local

- La aplicación se levanta **solo** con `scripts/up.ps1` y se detiene con `scripts/down.ps1`.
- Servicios de `docker-compose.yml`:

  | Servicio | Puerto local |
  |---|---|
  | `web` (Vite) | 5173 |
  | `api` (Express) | 3000 |
  | `worker` (BullMQ) | — |
  | `mysql` | 3306 |
  | `redis` | 6379 |
  | `mailpit` | 8025 (UI) · 1025 (SMTP) |

- `up.ps1` **DEBE** dejar la aplicación usable: levanta los servicios, espera a que estén sanos (healthchecks) y aplica las migraciones pendientes.
- Hay una base de datos separada para las pruebas de integración.
- Las imágenes usan Node 24 LTS. Las versiones de MySQL y Redis están fijadas, nunca son `latest`.

## 12. Git

- La rama `main` siempre está estable. Cada feature se desarrolla en su rama `feature/STD-###-nombre-corto`.
- Los commits siguen **Conventional Commits** en inglés y citan la clave de Jira: `feat(tasks): add occurrence status change [STD-9]`.
- Una feature se integra en `main` solo después de la revisión de QA y de la aprobación de las pruebas manuales del responsable.
- **NO DEBEN** versionarse `.env`, credenciales, `node_modules`, builds, reportes de cobertura ni datos locales de Docker.

## 13. Definición de terminado (técnica)

Una feature `STD-###` está terminada cuando:
1. Cumple todos los criterios de su spec y de `product.md`, sin trabajo fuera del alcance.
2. Su `openapi.yaml` refleja exactamente la API implementada, y los tipos del frontend están regenerados.
3. `lint`, `typecheck` y `test` pasan, y la cobertura es del 80 % o más.
4. La autorización y los casos de error están probados.
5. Las migraciones y `sh2do-model.json` están actualizados si cambió el esquema.
6. La accesibilidad básica está verificada: teclado, etiquetas, foco y contraste.
7. La aplicación arranca con `scripts/up.ps1` y la feature se puede probar manualmente.
8. QA la revisó y el responsable aprobó las pruebas manuales.

## 14. Fundamentos técnicos (enablers del backlog)

No tienen issue propio (`product.md` D-13). Se implementan dentro de la **primera feature que los necesite**, y esa feature los incluye en su `plan.md`.

| Enabler | Criterio de cierre | Primera feature que lo incluye |
|---|---|---|
| EN-001 Monorepo, API, worker, web, Prisma, MySQL y Docker | Los servicios arrancan con `up.ps1`; las migraciones son reproducibles; los secretos están fuera del repositorio | STD-6 |
| EN-003 Correo y plantillas | Correos transaccionales enviados vía Mailpit en local; resultado registrado en `email_deliveries`; probado con un transporte simulado | STD-6 |
| EN-004 Seguridad transversal | Validación Zod, autorización por recurso, Argon2id, límites de intentos y cabeceras de seguridad | STD-6 |
| EN-002 Redis, BullMQ y programación | Jobs programados, reintentos, validación de vigencia, idempotencia y reconciliación al arrancar | STD-15 / STD-16 |
| EN-005 Observabilidad y respaldo | Logs estructurados de fallos; reconciliación de trabajos; respaldo y restauración de MySQL probados | Incremento 3 (los logs, desde STD-6) |
| EN-006 CI, pruebas y despliegue | `lint`, `typecheck` y `test` automatizados; HTTPS; gestión de secretos; revisión responsive y de accesibilidad | Incremento 3 (los scripts de `npm`, desde STD-6) |
