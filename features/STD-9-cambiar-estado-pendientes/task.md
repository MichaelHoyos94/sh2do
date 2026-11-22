# STD-9 — Cambiar el estado de mis pendientes · Tareas

> Derivadas de `plan.md`. Las tareas completadas las marca el orquestador según el reporte de cada agente.
> **Leyenda:** `[ ]` pendiente · `[x]` hecha · **Dep.** = tareas de las que depende.

## Fase 0 — Preparación (orquestador)

Nada que preparar: no hay dependencias nuevas ni cambios de esquema (plan §5 y §7).

## Fase 1A — Backend (`backend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-B01** | **`setTaskStatusSchema`** en `tasks.schemas.ts` (estricto, enum de los tres estados, mensaje en español). | — | CA-06 |
| - [x] **T-B02** | **`tasksRepository.updateStatus`:** transacción que actualiza `status` y `completed_at` de la ocurrencia 0 y `tasks.updated_at`. | — | CA-01, CA-03 |
| - [x] **T-B03** | **`tasksService.setStatus`:** pendiente propio o `404`; mismo estado → sin escribir; `completedAt` según R-03. | T-B01, T-B02 | CA-01–CA-04, CA-06 |
| - [x] **T-B04** | **Controller y ruta** `PUT /tasks/:taskId/status` con `validateTaskId` antes de `validateBody`. | T-B03 | CA-01, CA-06, CA-07 |
| - [x] **T-B05** | **Pruebas de integración** en `test/tasks.test.ts` según el plan (§8), con reloj controlado para `completed_at`. Cobertura ≥ 80 %. | T-B04 | Todos |
| - [x] **T-B06** | **Verificación:** `lint`, `typecheck` y `test:coverage` sin errores; prueba de humo con curl. | T-B05 | — |

## Fase 1B — Frontend (`frontend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-F01** | Ampliar `gen:api` para generar `src/api/generated/std-9.ts`; `SetTaskStatusRequest` en `api/types.ts`; `setTaskStatus` en `tasksApi.ts` y `useSetTaskStatus` en `useTasks.ts`. | — | — |
| - [x] **T-F02** | **`TaskStatusPicker`:** grupo de tres botones con `aria-pressed`, guardado inmediato, deshabilitado mientras guarda, "Estado actualizado" con `role="status"` y error con `role="alert"`; pulsar el actual no llama a la API. | T-F01 | CA-01, CA-04, CA-05 |
| - [x] **T-F03** | Integrarlo en `TaskDetailPage`. | T-F02 | CA-01 |
| - [x] **T-F04** | **Pruebas** con Testing Library según el plan (§8). Cobertura ≥ 80 %. `lint`, `typecheck` y `build` sin errores. | T-F03 | Todos |

## Fase 2 — Integración (orquestador)

- [x] **T-I01** Prueba de humo a través del proxy de Vite: recorrer los tres estados, volver de `Completado`, repetir el estado actual, pendiente ajeno (→ `404`) y sin sesión (→ `401`). *(21-11: OK a través del proxy de Vite.)*

## Fase 3 — QA (`qa-reviewer`)

- [x] **T-Q01** Revisión completa y veredicto. *(Aprobado con observaciones: 6 menores, sin bloqueantes ni mayores.)*

## Fase 4 — Validación y entrega

- [x] **T-V01** Tus pruebas manuales y aprobación. Mover STD-9 a **Done** o a **Returned**. *(Aprobado por el responsable el 21-11-2026.)*
- [x] **T-V02** Commit en `feature/STD-9-cambiar-estado-pendientes` y pull request hacia `main`.
