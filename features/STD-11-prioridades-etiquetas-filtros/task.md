# STD-11 — Asignar prioridades y etiquetas, y filtrar · Tareas

> Derivadas de `plan.md`. Las tareas completadas las marca el orquestador según el reporte de cada agente.
> **Leyenda:** `[ ]` pendiente · `[x]` hecha · **Dep.** = tareas de las que depende.

## Fase 0 — Preparación (orquestador)

Nada que preparar: no hay dependencias nuevas ni cambios de esquema (plan §5 y §7).

## Fase 1A — Backend (`backend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-B01** | **Esquemas:** `priority` y `tagIds` en crear y editar; filtros `status`, `priority` y `tagIds` en la query de la lista; `TaskDto` con `tags`. | — | CA-01, CA-02, CA-04, CA-07 |
| - [x] **T-B02** | **`tagsService.findOwnedIds` y `getOwnedByIds`** (con su repositorio), en orden `name, id`. | — | CA-03, CA-04 |
| - [x] **T-B03** | **`tasksRepository`:** `priority` y `task_tags` en `create` y `update` (misma transacción, R-04); filtros en `list` (R-07); lecturas con los `tagId`. | T-B01 | CA-02, CA-03, CA-05, CA-06 |
| - [x] **T-B04** | **`tasksService`:** validar `tagIds` (R-03), no-op con prioridad y conjunto (R-06), `P2003` → `422` (R-05), DTO con nombres con una llamada por página. | T-B02, T-B03 | CA-01–CA-07 |
| - [x] **T-B05** | **Pruebas** de integración y la unitaria de `P2003` según el plan (§8); ajustar las de STD-8/STD-9 al `Task` con `tags`. Cobertura ≥ 80 %. | T-B04 | Todos |
| - [x] **T-B06** | **Verificación:** `lint`, `typecheck` y `test:coverage` sin errores; prueba de humo con curl. | T-B05 | — |

## Fase 1B — Frontend (`frontend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-F01** | Ampliar `gen:api` con `std-11.ts` y mover los tipos de pendientes a `std-11` en `api/types.ts`; ajustar fixtures y pruebas existentes al `Task` con `tags`. | — | — |
| - [x] **T-F02** | **Filtros en la URL** (`taskFilters.ts`), `listTasks(filters, cursor)` y `useTaskList(filters)` con la clave nueva (R-10, R-12). | T-F01 | CA-05, CA-06, CA-08 |
| - [x] **T-F03** | **`TaskFilters`** (chips con `aria-pressed`, "Limpiar filtros") e integración en `TasksPage` con el vacío con filtros (R-09, R-11). | T-F02 | CA-05, CA-06, CA-08, CA-09 |
| - [x] **T-F04** | **Formulario:** prioridad (radios) y etiquetas (checkboxes, máx. 20, vacío, "Cargar más etiquetas"); `diffTask` con `priority` y `tagIds` (R-08). | T-F01 | CA-01–CA-04 |
| - [x] **T-F05** | **Insignias de etiquetas** en la lista y el detalle (R-13); `useTags` invalida también los pendientes (R-12). | T-F01 | CA-02, CA-03 |
| - [x] **T-F06** | **Pruebas** con Testing Library según el plan (§8). Cobertura ≥ 80 %. `lint`, `typecheck` y `build` sin errores. | T-F03–T-F05 | Todos |

## Fase 2 — Integración (orquestador)

- [x] **T-I01** Prueba de humo a través del proxy de Vite: crear con prioridad y etiquetas, editar el conjunto, etiqueta ajena (→ `422`), filtros OR/AND, filtro con etiqueta ajena (→ vacío), `PUT /status` con `tags` y sin sesión (→ `401`). *(27-11: OK a través del proxy de Vite.)*

## Fase 3 — QA (`qa-reviewer`)

- [x] **T-Q01** Revisión completa y veredicto. *(Aprobado con observaciones: 1 mayor y 7 menores, sin bloqueantes.)*

## Fase 4 — Validación y entrega

- [x] **T-V01** Tus pruebas manuales y aprobación. Mover STD-11 a **Done** o a **Returned**. *(Aprobado por el responsable el 27-11-2026.)*
- [x] **T-V02** Commit en `feature/STD-11-prioridades-etiquetas-filtros` y pull request hacia `main`.
