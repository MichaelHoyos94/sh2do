# STD-10 — Crear, editar y eliminar etiquetas propias · Tareas

> Derivadas de `plan.md`. Las tareas completadas las marca el orquestador según el reporte de cada agente.
> **Leyenda:** `[ ]` pendiente · `[x]` hecha · **Dep.** = tareas de las que depende.

## Fase 0 — Preparación (orquestador)

- [x] **T-O01** Anotar en `docs/sh2do-model.json` (comentario de `tags`) la intercalación `utf8mb4_0900_as_ci` de `tags.name` (plan R-02, §5). No hay dependencias nuevas.

## Fase 1A — Backend (`backend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-B01** | **Esquema y migración:** modelos `Tag` y `TaskTag` (plan §5) con relaciones inversas en `User` y `Task`; `prisma migrate dev --create-only --name add_tags`, editar `tags.name` a `COLLATE utf8mb4_0900_as_ci` y aplicar. | — | CA-03, CA-06 |
| - [x] **T-B02** | **`tags.schemas.ts`:** normalización (R-01), mensajes en español, `tagBodySchema` estricto, `listTagsQuerySchema`, `tagIdParamSchema`, `toTagDto`. | — | CA-01, CA-02 |
| - [x] **T-B03** | **`tags.repository.ts`:** `list` (orden `name, id`, cursor por `id`), `findOwned`, `create`, `rename`, `delete`. | T-B01 | CA-06, CA-07 |
| - [x] **T-B04** | **`tags.service.ts`:** propiedad → `404`; renombrar idéntico → sin escribir; `P2002` → `409 TAG_NAME_TAKEN` con error en `name`. Código `TAG_NAME_TAKEN` en `shared/http`. | T-B02, T-B03 | CA-01–CA-08 |
| - [x] **T-B05** | **Controller y rutas** (`validateTagId` antes de `validateBody`) y montaje en `/api/v1/tags`. | T-B04 | CA-08, CA-09 |
| - [x] **T-B06** | **Pruebas de integración** en `test/tags.test.ts` según el plan (§8). Limpieza de `tags`/`task_tags` entre pruebas si el helper no lo hace. Cobertura ≥ 80 %. | T-B05 | Todos |
| - [x] **T-B07** | **Verificación:** `lint`, `typecheck` y `test:coverage` sin errores; `scripts/up.ps1` aplica la migración; prueba de humo con curl. | T-B06 | — |

## Fase 1B — Frontend (`frontend-implementer`)

| ID | Tarea | Dep. | Criterios |
|---|---|---|---|
| - [x] **T-F01** | Ampliar `gen:api` con `src/api/generated/std-10.ts`; tipos en `api/types.ts`; `tagsApi.ts` y `useTags.ts`. | — | — |
| - [x] **T-F02** | **`TagsPage`:** formulario "Nueva etiqueta", lista, vacío, carga, error, "Cargar más"; ruta `/tags` y enlace "Etiquetas" en `AppLayout`. | T-F01 | CA-01, CA-02, CA-03, CA-07 |
| - [x] **T-F03** | **`TagRow`:** renombrar en línea (R-11) y confirmación de eliminación en línea (R-10), con manejo de `409`, `422` y `404` y gestión del foco. | T-F01 | CA-05, CA-06, CA-08 |
| - [x] **T-F04** | **Pruebas** con Testing Library según el plan (§8). Cobertura ≥ 80 %. `lint`, `typecheck` y `build` sin errores. | T-F02, T-F03 | Todos |

## Fase 2 — Integración (orquestador)

- [x] **T-I01** Prueba de humo a través del proxy de Vite: crear, duplicado por mayúsculas (→ `409`), `Café`/`Cafe` (→ ambas), renombrar, eliminar con una fila en `task_tags` (el pendiente sigue), etiqueta ajena (→ `404`) y sin sesión (→ `401`). *(23-11: OK a través del proxy de Vite. Las tildes se verificaron desde el contenedor: el curl de Git Bash en Windows corrompe los caracteres no ASCII al enviarlos.)*

## Fase 3 — QA (`qa-reviewer`)

- [x] **T-Q01** Revisión completa y veredicto. *(Rechazado por B-01, ya corregido; ver plan §10.)*

## Fase 4 — Validación y entrega

- [x] **T-V01** Tus pruebas manuales y aprobación. Mover STD-10 a **Done** o a **Returned**. *(Aprobado por el responsable el 23-11-2026.)*
- [x] **T-V02** Commit en `feature/STD-10-etiquetas` y pull request hacia `main`.
