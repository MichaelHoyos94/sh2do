# STD-11 — Asignar prioridades y etiquetas, y filtrar · Plan de implementación

> **Spec:** STD-11 en Jira (épica STD-2), refinada el 27-11-2026 · **Backlog:** US-005
> **Depende de:** STD-8 (módulo `tasks`), STD-9 (estado del pendiente), STD-10 (módulo `tags`, tablas `tags` y `task_tags`).
> **Estado del plan:** aprobado el 27-11-2026.

---

## 1. Objetivo

Que el usuario elija la prioridad y las etiquetas de sus pendientes al crearlos y editarlos, las vea en la lista y en el detalle, y filtre "Mis pendientes" con chips combinables por estado, prioridad y etiquetas, viendo solo lo suyo.

## 2. Alcance

| Incluido | Fuera de alcance |
|---|---|
| `priority` y `tagIds` en `POST /tasks` y `PATCH /tasks/{taskId}` | Ordenar por prioridad u otro criterio; búsqueda por texto |
| `tags` en el `Task` de todas las respuestas | Filtros guardados |
| Filtros `status`, `priority` y `tagIds` en `GET /tasks` | Crear etiquetas desde el formulario del pendiente |
| Prioridad y etiquetas en el formulario de crear y editar | Prioridad o etiquetas por ocurrencia (STD-12 a STD-14) |
| Chips de filtro en "Mis pendientes", con los filtros en la URL | Cambios masivos |

## 3. Decisiones del refinamiento

Están también en la sección "Refinamiento" de STD-11 en Jira.

| # | Decisión |
|---|---|
| R-01 | **`priority` y `tagIds` van en `POST` y `PATCH /tasks`,** no en endpoints propios: son campos del formulario del pendiente, y el contrato de STD-8 ya los dejaba para STD-11. El contrato de STD-11 redefine `CreateTaskRequest`, `UpdateTaskRequest` y `Task`; el `Task` nuevo (con `tags`) aplica también a `PUT /tasks/{taskId}/status` de STD-9. |
| R-02 | **`tagIds` es el conjunto completo** de etiquetas del pendiente: en `PATCH` lo sustituye (`[]` las quita todas; ausente, no cambian). Sin repetidos y como máximo **20**. Los errores van en el campo `tagIds` con `422` (ver mensajes en el contrato). |
| R-03 | **Etiqueta ajena o inexistente en `tagIds` → `422`** "Alguna de las etiquetas elegidas no existe.", sin decir cuál ni por qué (no revela etiquetas ajenas). No es `404`: el recurso de la ruta (el pendiente) sí existe. |
| R-04 | **`task_tags` pasa a ser del módulo `tasks`** (es la asignación de un pendiente; STD-10 no la escribe en ningún sitio, solo cae por `ON DELETE CASCADE`). Así la escritura de `task_tags` va en la **misma transacción** del repositorio de `tasks` que ya actualiza `tasks` y la ocurrencia, sin transacciones entre módulos. El módulo `tags` sigue siendo el único que toca la tabla `tags`. |
| R-05 | **Frontera con `tags`:** `tasksService` llama a dos funciones nuevas de `tagsService`: `findOwnedIds(userId, ids)` para validar `tagIds` antes de escribir, y `getOwnedByIds(userId, ids)` para obtener los nombres (en orden alfabético) al construir los DTO. En la lista se hace **una sola** llamada por página con los ids de todos sus pendientes. Si una etiqueta se elimina entre la validación y la escritura, la FK falla (`P2003`) y se responde el mismo `422` de R-03. |
| R-06 | **Sin cambios reales → `200` sin escribir** (se compara también `priority` y el conjunto de `tagIds` sin importar el orden). Un cambio real de prioridad o etiquetas actualiza `tasks.updated_at`, como cualquier edición. |
| R-07 | **Filtros en `GET /tasks`:** `status`, `priority` y `tagIds`, con valores separados por comas. **OR dentro de un parámetro, AND entre parámetros;** un parámetro ausente no filtra. `status` filtra por la ocurrencia 0; `tagIds` exige al menos una de las etiquetas. Un valor vacío, desconocido, repetido de más (más de 20 `tagIds`) o mal formado → `422` en ese parámetro. Un `tagIds` ajeno no se valida: no coincide con ningún pendiente propio (los `task_tags` solo unen pendientes y etiquetas del mismo usuario), así que no revela nada. El orden y el cursor no cambian (`id` descendente, siempre dentro de `userId`). |
| R-08 | **Formulario:** la prioridad es un grupo de **radios nativos** (`fieldset` "Prioridad": Baja, Media, Alta; Media marcada al crear). Las etiquetas, un grupo de **checkboxes nativos** (`fieldset` "Etiquetas") con las etiquetas propias en orden alfabético. Con 20 marcadas, las demás se deshabilitan y se muestra "Máximo 20 etiquetas". Sin etiquetas: "Aún no tienes etiquetas." con un enlace a "Etiquetas". Si hay más de 100 etiquetas, "Cargar más etiquetas". En editar, solo se envían `priority` y `tagIds` si cambiaron. |
| R-09 | **Chips de filtro** en "Mis pendientes": tres grupos (`role="group"` con título visible "Estado", "Prioridad", "Etiquetas") de **botones con `aria-pressed`**, como el selector de STD-9. Pulsar alterna el chip. "Limpiar filtros" aparece solo con algún chip activo. El grupo "Etiquetas" no aparece si el usuario no tiene etiquetas. |
| R-10 | **Los filtros viven en la URL** (`/tasks?status=pending&priority=high,medium&tagIds=3,7`, con `useSearchParams`): se conservan al recargar, al volver atrás y al volver del detalle. La URL es la fuente de verdad; la clave de TanStack Query incluye los filtros. Los valores desconocidos de la URL se ignoran. |
| R-11 | **Sin resultados con filtros:** "Ningún pendiente coincide con los filtros." con el botón "Limpiar filtros". Sin pendientes y sin filtros, se mantiene el vacío de STD-8. Un `tagIds` de la URL que ya no existe (etiqueta eliminada) deja la lista vacía con "Limpiar filtros" disponible; no se trata aparte. |
| R-12 | **Caché:** renombrar o eliminar una etiqueta (STD-10) invalida también las consultas de pendientes, porque el `Task` lleva los nombres. La clave de la lista pasa a `['tasks', 'list', filtros]`, para no chocar con el detalle `['tasks', id]`. |
| R-13 | **Mostrar:** en la lista y en el detalle, las etiquetas se ven como insignias con el nombre, en una lista con nombre accesible "Etiquetas", después del estado y la prioridad. |

## 4. Diseño

### 4.1 Backend

| Archivo | Contenido |
|---|---|
| `tasks/tasks.schemas.ts` | `priority` (`z.enum`, "Elige una prioridad válida.") y `tagIds` (array de enteros positivos, sin repetidos, máx. 20) en `createTaskSchema` y `updateTaskSchema`; filtros `status`, `priority` y `tagIds` en `listTasksQuerySchema` (texto separado por comas → arrays validados); `TaskDto` con `tags`; `toTaskDto(task, tagsById)` |
| `tasks/tasks.repository.ts` | `create` y `update` reciben `priority` y `tagIds` (en `update`, `tagIds` opcional: si viene, se borran y se insertan los `task_tags` dentro de la transacción existente); `list` acepta los filtros (`priority in`, `occurrences some { sequenceNo: 0, status in }`, `taskTags some { tagId in }`); las lecturas incluyen `taskTags: { select: { tagId: true } }` |
| `tasks/tasks.service.ts` | Valida `tagIds` con `tagsService.findOwnedIds` (R-03); no-op con prioridad y conjunto de etiquetas (R-06); `P2003` → `422` (R-05); construye los DTO con `tagsService.getOwnedByIds` (una llamada por respuesta o por página) |
| `tags/tags.service.ts` y `tags/tags.repository.ts` | `findOwnedIds(userId, ids)` y `getOwnedByIds(userId, ids)` (orden `name, id`) |

Sin cambios de rutas: `GET`, `POST` y `PATCH /tasks` siguen donde están.

### 4.2 Frontend

| Archivo | Contenido |
|---|---|
| `package.json` (`gen:api`) y `api/types.ts` | Genera `src/api/generated/std-11.ts`; `Task`, `TaskPage`, `TaskStatus`, `TaskPriority`, `CreateTaskRequest`, `UpdateTaskRequest` y `TaskTag` pasan a venir de `std-11` |
| `tasks/taskFilters.ts` (nuevo) | Leer y escribir los filtros de `URLSearchParams` (ignora valores desconocidos) y construir la query de la API |
| `tasks/tasksApi.ts` y `tasks/useTasks.ts` | `listTasks(filters, cursor)`; `useTaskList(filters)` con la clave `['tasks', 'list', filters]`; las mutaciones invalidan `['tasks', 'list']` |
| `tasks/TaskFilters.tsx` (nuevo) | Los tres grupos de chips y "Limpiar filtros" (R-09) |
| `tasks/TasksPage.tsx` | Usa los filtros de la URL, muestra `TaskFilters`, el vacío con filtros (R-11) y las etiquetas de cada pendiente |
| `tasks/TaskForm.tsx` y `tasks/taskValues.ts` | Prioridad y etiquetas (R-08); `diffTask` con `priority` y `tagIds` |
| `tasks/TaskBadges.tsx` o `tasks/TaskTags.tsx` (nuevo) | Insignias de etiquetas (R-13), usadas en la lista y en `TaskDetailPage.tsx` |
| `tags/useTags.ts` | Las mutaciones invalidan también `['tasks']` (R-12) |

- **Accesibilidad:** `fieldset` + `legend` en prioridad y etiquetas; errores del servidor en `priority` y `tagIds` asociados al grupo y anunciados (mismo mecanismo de errores por campo de STD-8); chips con `aria-pressed` y texto (no solo color); foco visible; los chips y los grupos se apilan a 360 px.
- **Textos:** "Prioridad", "Baja", "Media", "Alta", "Etiquetas", "Máximo 20 etiquetas", "Aún no tienes etiquetas.", "Cargar más etiquetas", "Estado", "Limpiar filtros", "Ningún pendiente coincide con los filtros.".

## 5. Datos

Sin cambios de esquema ni migración: `tasks.priority` existe desde STD-8 y `task_tags` desde STD-10. `sh2do-model.json` no cambia (su comentario de `task_tags`, "validar que ambos pertenezcan al mismo usuario", lo cumple R-03).

## 6. API

El contrato está en `contracts/openapi.yaml`. Va bajo `/api/v1` y requiere sesión.

| Método y ruta | Cambio | Éxito | Errores |
|---|---|---|---|
| `GET /tasks` | Filtros `status`, `priority`, `tagIds` | `200` `TaskPage` | 401, 422 |
| `POST /tasks` | Acepta `priority` y `tagIds` | `201` `Task` | 400, 401, 422 |
| `GET /tasks/{taskId}` | `Task` con `tags` | `200` `Task` | 401, 404 |
| `PATCH /tasks/{taskId}` | Acepta `priority` y `tagIds` | `200` `Task` | 400, 401, 404, 422 |
| `PUT /tasks/{taskId}/status` (STD-9) | Solo la respuesta: `Task` con `tags` | `200` `Task` | sin cambios |

No hay códigos de error nuevos.

## 7. Dependencias

**Ninguna nueva.**

## 8. Pruebas: qué prueba verifica cada criterio

| Criterio (Jira) | Backend (`test/tasks.test.ts` o `test/tasks-filters.test.ts`) | Frontend |
|---|---|---|
| CA-01 Prioridad por defecto | `POST` sin `priority` → `medium` | Al crear, "Media" está marcada |
| CA-02 Elegir prioridad | `POST` y `PATCH` con `low`/`high` → guardada; `GET` la devuelve; valor desconocido → `422` en `priority` | Elegir "Alta" envía `priority: 'high'`; en editar solo se envía si cambió |
| CA-03 Etiquetas | `POST` con `tagIds` → `tags` en orden alfabético; `PATCH` sustituye el conjunto; `[]` las quita; ausente no las toca; mismo conjunto en otro orden → `200` sin cambiar `updatedAt` | Marcar y desmarcar envía el conjunto; la lista y el detalle muestran las etiquetas |
| CA-04 Rechazos | Etiqueta ajena o inexistente → `422` en `tagIds` y la BD sin cambios; repetidas → `422`; 21 → `422`; `P2003` por carrera → `422` (prueba unitaria del servicio con el repositorio simulado) | Un `422` en `tagIds` se muestra en el grupo; con 20 marcadas, las demás se deshabilitan |
| CA-05 OR en un grupo | `status=pending,completed`, `priority=high,low` y `tagIds=a,b` devuelven los que cumplen cualquiera | Pulsar dos chips de un grupo pide la API con ambos valores |
| CA-06 AND entre grupos | `status` + `priority` + `tagIds` a la vez devuelven solo los que cumplen todo; paginación con filtros y `nextCursor` | Chips de varios grupos se combinan en la petición |
| CA-07 Solo los míos | Con filtros, nunca aparecen pendientes de otro usuario; `tagIds` de una etiqueta ajena → lista vacía; valores inválidos → `422` | — |
| CA-08 Limpiar y conservar | — | "Limpiar filtros" quita los parámetros de la URL; renderizar `/tasks?priority=high` deja el chip activo y filtra |
| CA-09 Sin resultados | — | Con filtros y página vacía: "Ningún pendiente coincide con los filtros." |
| CA-10 Sin sesión | `GET` con filtros, `POST` y `PATCH` → `401` | — (las rutas privadas ya redirigen) |

Además: renombrar o eliminar una etiqueta invalida las consultas de pendientes (frontend), y el `PUT /status` de STD-9 devuelve `tags` (backend). La cobertura sigue con el umbral del 80 % en los dos workspaces.

## 9. Orden de ejecución

1. **Fase 0 (orquestador):** nada que preparar (sin dependencias ni migración).
2. **Fase 1, en paralelo:** `backend-implementer` (T-B*) y `frontend-implementer` (T-F*), contra `contracts/openapi.yaml`.
3. **Fase 2, integración:** prueba de humo a través del proxy de Vite.
4. **Fase 3:** `qa-reviewer`.
5. **Fase 4:** tus pruebas manuales. Con tu aprobación, STD-11 pasa a **Done** y se abre la **pull request** hacia `main`.

## 10. Ajustes tras la revisión de QA (27-11-2026)

Veredicto: **aprobado con observaciones** (1 mayor y 7 menores, sin bloqueantes).

| Hallazgo | Decisión |
|---|---|
| M-1 "Volver a mis pendientes" (detalle), "Cancelar" (nuevo) y la página de pendiente inexistente iban a `/tasks` sin los filtros (R-10) | **Corregido por el orquestador:** la lista guarda su búsqueda en `sessionStorage` (`rememberListSearch` en `taskFilters.ts`) y esos enlaces usan `tasksListPath()`. Se usa la pestaña y no el estado del router porque este se pierde al pasar por editar. Prueba nueva en `TaskFilters.test.tsx` |
| m-1 a m-7 | Aceptados sin cambios por el responsable |
| Reformateo accidental de Prettier en `std-6.ts`…`std-10.ts` y `features/auth/*` (ajeno a la feature) | Descartado con la autorización del responsable; `std-11.ts` regenerado con `gen:api` |
