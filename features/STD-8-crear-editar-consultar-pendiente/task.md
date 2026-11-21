# STD-8 — Crear, editar y consultar un pendiente · Tareas

> Derivadas de `plan.md`. Las tareas completadas las marca el orquestador según el reporte de cada agente.
> **Leyenda:** `[ ]` pendiente · `[x]` hecha · **Dep.** = tareas de las que depende.

## Fase 0 — Preparación (orquestador)

- [x] **T-00** Con el visto bueno del responsable, instalar `luxon` (runtime) y `@types/luxon` (desarrollo) en `backend` (plan §7). *(21-11: `luxon ^3.7.2` y `@types/luxon ^3.7.6`, plan aprobado.)*

## Fase 1A — Backend (`backend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-B01** | **Prisma:** modelos `Task` (`tasks`) y `TaskOccurrence` (`task_occurrences`), enums `TaskPriority` y `OccurrenceStatus`, índices y restricción única del modelo, `recurrence_rule_id` sin FK y `tasks.user_id` con `RESTRICT` (plan §5). Migración `add_tasks`. | — | — |
| - [x] **T-B02** | **`shared/time.ts`:** `toUtcInstant(date, time, zone)` con Luxon, más la conversión de `DATE`/`TIME` de Prisma a `YYYY-MM-DD`/`HH:mm` y al revés. Pruebas unitarias: zona con offset negativo, salto del cambio de horario y fecha sin hora → `null`. | T-00 | CA-03 |
| - [x] **T-B03** | **`tasks.repository.ts`:** crear el pendiente con su ocurrencia 0 (create anidado), buscar por `id` + `user_id`, listar por cursor (`id` descendente, `limit + 1`) y actualizar `tasks` + ocurrencia 0 en una transacción. | T-B01 | — |
| - [x] **T-B04** | **`tasks.schemas.ts`** (Zod estricto, R-02, R-03, fecha de calendario válida, `HH:mm`) y `validateQuery` en `shared/http/validate.ts` para `cursor` y `limit`. `toTaskDto`, que aplana la ocurrencia 0. | T-B01 | CA-02, CA-03 |
| - [x] **T-B05** | **`tasks.service.ts`:** `create`, `list`, `getOwned` y `update`, con la zona del usuario vía `usersService`, la mezcla del `PATCH` (quitar la fecha quita la hora; "no hay hora sin fecha" sobre el resultado), el recálculo de `scheduled_at_utc` y `404` para lo ajeno o inexistente. | T-B02, T-B03, T-B04 | CA-01, CA-03, CA-06, CA-07 |
| - [x] **T-B06** | **Controller y routes:** `GET /`, `POST /` (`201` + `Location`), `GET /:taskId` y `PATCH /:taskId` con `requireAuth`. Id no numérico → `404`. Montar en `/api/v1/tasks` en `api/app.ts`. Sin `DELETE`. | T-B05 | CA-01, CA-04, CA-05, CA-08, CA-09 |
| - [x] **T-B07** | **Pruebas de integración** (`test/tasks.test.ts`) según el plan (§8): caso feliz, validación, autorización (ajeno → `404`, sin sesión → `401`), paginación y `DELETE` → `404`. Cobertura ≥ 80 %. | T-B06 | Todos |
| - [x] **T-B08** | **Verificación:** `lint`, `typecheck` y `test:coverage` sin errores; migración aplicada con `scripts/up.ps1`; prueba de humo con curl. | T-B07 | — |

## Fase 1B — Frontend (`frontend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-F01** | Ampliar `gen:api` para generar `src/api/generated/std-8.ts`; crear `tasksApi.ts` y `useTasks.ts` (TanStack Query, invalidación de `['tasks']`). | — | — |
| - [x] **T-F02** | Componentes base `components/ui/textarea.tsx` y `components/ui/badge.tsx` (estilo shadcn, sin dependencias nuevas) y `features/tasks/format.ts` (etiquetas en español y formato de fecha sin correrse de día). | — | CA-04, CA-05 |
| - [x] **T-F03** | **`TaskForm`:** título, descripción, fecha y hora (deshabilitada sin fecha y vaciada al quitar la fecha), validación de UX, `422` por campo, `ErrorSummary` y `aria-live`. | T-F01, T-F02 | CA-02, CA-03, CA-06 |
| - [x] **T-F04** | **`TasksPage`:** lista con carga, vacío, error y "Cargar más"; botón "Nuevo pendiente". | T-F01, T-F02 | CA-04 |
| - [x] **T-F05** | **`NewTaskPage`, `TaskDetailPage` y `EditTaskPage`:** al guardar navegan al detalle; `404` → "Este pendiente no existe" con un enlace a la lista; sin botón de eliminar. | T-F03 | CA-01, CA-05, CA-06, CA-07, CA-08 |
| - [x] **T-F06** | **Router y layout:** rutas de R-10, `/` → `/tasks`, enlace "Pendientes" en la cabecera, eliminar `HomePage` y ajustar `router.test.tsx`. | T-F04, T-F05 | CA-09 |
| - [x] **T-F07** | **Pruebas** con Testing Library según el plan (§8). Cobertura ≥ 80 %. `lint`, `typecheck` y `build` sin errores. | T-F03–T-F06 | Todos |

## Fase 2 — Integración (orquestador)

- [x] **T-I01** Prueba de humo a través del proxy de Vite: crear sin fecha, con fecha y con fecha y hora; listar y cargar más; consultar; editar quitando la fecha; acceder a un pendiente de otro usuario (→ "no existe"). *(21-11: OK a través del proxy de Vite.)*

## Fase 3 — QA (`qa-reviewer`)

- [x] **T-Q01** Revisión completa y veredicto. *(Aprobado con observaciones: M1 mayor y 13 menores.)*

## Fase 4 — Validación y entrega

- [x] **T-V01** Tus pruebas manuales y aprobación. Mover STD-8 a **Done** o a **Returned**. *(Aprobado por el responsable el 21-11-2026.)*
- [x] **T-V02** Commit en `feature/STD-8-crear-editar-consultar-pendiente` y pull request hacia `main`.
