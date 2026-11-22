# STD-9 — Cambiar el estado de mis pendientes · Plan de implementación

> **Spec:** STD-9 en Jira (épica STD-2), refinada el 21-11-2026 · **Backlog:** US-003
> **Depende de:** STD-8 (módulo `tasks`, tablas `tasks` y `task_occurrences`, detalle del pendiente).
> **Estado del plan:** aprobado el 21-11-2026. Ajustado tras la revisión de QA (ver §10).

---

## 1. Objetivo

Que el usuario cambie el estado de sus pendientes entre **Pendiente**, **En progreso** y **Completado** desde el detalle del pendiente, y que el estado quede guardado. Al completar se registra la fecha de completado, que usarán STD-15 y STD-16 para no emitir recordatorios de pendientes completados (RN-PEN-4).

## 2. Alcance

| Incluido | Fuera de alcance |
|---|---|
| Endpoint para fijar el estado de un pendiente propio | Cambiar el estado desde la lista o de varios a la vez |
| Selector de estado en el detalle, que guarda al momento | Estados por ocurrencia de una recurrencia (STD-13) |
| `completed_at` al completar y su borrado al salir de `Completado` | Cancelar recordatorios al completar (no existen hasta STD-15 y STD-16) |
| La lista y el detalle reflejan el estado nuevo | Filtrar por estado (STD-11) · Mostrar la fecha de completado |

## 3. Decisiones del refinamiento

Están también en la sección "Refinamiento" de STD-9 en Jira.

| # | Decisión |
|---|---|
| R-01 | **Transiciones libres** (RN-PEN-2): de cualquier estado a cualquiera, incluido volver de `completed`. "En proceso" en el resumen de Jira es `En progreso` (`in_progress`), como en `product.md`. |
| R-02 | **Endpoint propio, `PUT /tasks/{taskId}/status`**, en vez de añadir `status` al `PATCH` de STD-8. Así el contrato de STD-8 no cambia, el cambio de estado es una acción explícita e idempotente, y STD-13 podrá ofrecer lo mismo por ocurrencia. |
| R-03 | **`completed_at`:** al pasar a `completed` se guarda `clock.now()`; al salir de `completed` se pone `null`. **No se expone en la API** (el DTO `Task` no cambia) porque nada lo muestra todavía. |
| R-04 | **Mismo estado → `200` sin cambios:** no se escribe en la BD ni cambia `updatedAt`, igual que un `PATCH` sin cambios en STD-8. |
| R-05 | **Un cambio real de estado actualiza `tasks.updated_at`** ("Última edición"), como cualquier otra edición. |
| R-06 | **Ajeno, inexistente o id no numérico → `404 NOT_FOUND`**, validando el id antes que el body (mismo `validateTaskId` de STD-8). |
| R-07 | **UI:** en el detalle, un grupo de tres botones con `aria-pressed`. Se usan botones y no radios ni `<select>` porque con el teclado las flechas cambian la selección de radios y selects, y cada cambio guardaría. El estado actual se ve marcado; al pulsar otro se guarda al momento, los botones se deshabilitan mientras guarda y se anuncia "Estado actualizado" con `role="status"`. |
| R-08 | **Si falla el guardado,** se muestra el error con `role="alert"` y el pendiente conserva el estado que ya tenía (no hay actualización optimista). |
| R-09 | **RN-PEN-4 (recordatorios):** hoy no hay recordatorios. STD-15 y STD-16 leerán `task_occurrences.status` para no emitir avisos de pendientes completados. Se deja anotado aquí; no hay nada que programar ni cancelar en STD-9. |

## 4. Diseño

### 4.1 Backend: módulo `tasks`

| Archivo | Contenido |
|---|---|
| `tasks.schemas.ts` | `setTaskStatusSchema`: `z.strictObject({ status: z.enum(['pending', 'in_progress', 'completed']) })` con mensaje "Elige un estado válido." |
| `tasks.routes.ts` | `PUT /:taskId/status` con `validateTaskId` y `validateBody(setTaskStatusSchema)` |
| `tasks.controller.ts` | `setTaskStatus`: responde `200` con el `Task` |
| `tasks.service.ts` | `setStatus(userId, taskId, status)`: carga el pendiente propio (si no, `404`); si el estado es el mismo, devuelve el actual sin escribir; si no, calcula `completedAt` (R-03) y llama al repositorio |
| `tasks.repository.ts` | `updateStatus(id, status, completedAt)`: en una **transacción** actualiza la ocurrencia 0 (`status`, `completed_at`) y `tasks.updated_at` (con `clock.now()`), y devuelve el pendiente con su ocurrencia |

No hay cambios de esquema ni migración: `status` y `completed_at` ya existen en `task_occurrences` desde STD-8.

### 4.2 Frontend: feature `tasks`

| Archivo | Contenido |
|---|---|
| `tasksApi.ts` | `setTaskStatus(id, status)` → `PUT /tasks/{id}/status` |
| `useTasks.ts` | `useSetTaskStatus(id)`, que reutiliza `useSaveTask` (deja el detalle al día con `setQueryData` e invalida la lista) |
| `TaskStatusPicker.tsx` (nuevo) | Grupo `role="group"` con etiqueta visible "Estado" y tres `Button` con `aria-pressed`. Pulsar el actual no llama a la API. Deshabilitado mientras guarda. Mensajes de éxito (`role="status"`) y error (`role="alert"`) |
| `TaskDetailPage.tsx` | Muestra `TaskStatusPicker` junto a las insignias |
| `api/types.ts` | `SetTaskStatusRequest` desde `generated/std-9.ts` |
| `package.json` (`gen:api`) | Genera también `src/api/generated/std-9.ts` |

- **Accesibilidad:**
  - El estado activo se distingue por `aria-pressed`, por el texto del botón y por el estilo, no solo por el color.
  - El foco se queda en el botón pulsado y es visible.
  - Los botones caben a 360 px (se apilan si hace falta).
- **Textos:** "Estado", "Pendiente", "En progreso", "Completado", "Guardando…", "Estado actualizado" y, si falla, el `detail` del error.

## 5. Datos

Sin cambios: se usan `task_occurrences.status` y `task_occurrences.completed_at` de la ocurrencia 0, ya creados en STD-8. `sh2do-model.json` no se modifica. No hay migración.

## 6. API

El contrato está en `contracts/openapi.yaml`. Va bajo `/api/v1` y requiere sesión.

| Método y ruta | Resumen | Éxito | Errores |
|---|---|---|---|
| `PUT /tasks/{taskId}/status` | Fija el estado de un pendiente propio | `200` `Task` | 400, 401, 404, 422 |

No hay códigos de error nuevos.

## 7. Dependencias

**Ninguna nueva.**

## 8. Pruebas: qué prueba verifica cada criterio

| Criterio (Jira) | Backend | Frontend |
|---|---|---|
| CA-01 El estado nuevo queda guardado | `PUT` → `200` con el estado nuevo; un `GET` posterior lo devuelve; `updatedAt` cambia | Pulsar "Completado" envía el `PUT`, el botón queda marcado, se anuncia "Estado actualizado" y la lista se invalida |
| CA-02 Transiciones libres | Las seis transiciones entre los tres estados dan `200` (incluido `completed` → `pending` y `completed` → `in_progress`) | — |
| CA-03 Fecha de completado | Al pasar a `completed`, `completed_at` es el instante del reloj controlado; al salir, es `null` | — |
| CA-04 Mismo estado | `200` sin cambiar `updatedAt` ni `completed_at` | Pulsar el estado actual no llama a la API |
| CA-05 Error al guardar | — | Con un `500` simulado se muestra el error y sigue marcado el estado anterior |
| CA-06 Ajeno o inexistente | Ajeno → `404` y la BD sin cambios; inexistente → `404`; `abc` con body inválido → `404` (no `422`); `status` inválido o ausente, o campos extra → `422` | — (el detalle de un pendiente ajeno ya muestra "no existe" desde STD-8) |
| CA-07 Sin sesión | `401` | — (las rutas privadas ya redirigen al login desde STD-8) |

La cobertura sigue con el umbral del 80 % en los dos workspaces.

## 9. Orden de ejecución

1. **Fase 1, en paralelo:** `backend-implementer` (T-B*) y `frontend-implementer` (T-F*), contra `contracts/openapi.yaml`.
2. **Fase 2, integración:** prueba de humo a través del proxy de Vite.
3. **Fase 3:** `qa-reviewer`.
4. **Fase 4:** tus pruebas manuales. Con tu aprobación, STD-9 pasa a **Done** y se abre la **pull request** hacia `main`.

## 10. Ajustes tras la revisión de QA (21-11-2026)

Veredicto: **aprobado con observaciones** (6 menores, sin bloqueantes ni mayores).

| Hallazgo | Decisión |
|---|---|
| 1 El foco podría perderse al deshabilitar el botón pulsado mientras guarda | Aceptado sin cambios por el responsable tras sus pruebas manuales |
| 2 El estado aparece dos veces en el detalle (insignia y selector) | Aceptado sin cambios: es lo aprobado en el plan |
| 3 Una prueba compara el `textContent` con el icono decorativo | Aceptado sin cambios |
| 4 La transacción vive en el repositorio | Informativo: mismo patrón que STD-8 |
| 5 Ajustes del orquestador en pruebas inestables de STD-6 y STD-8 (carrera de la promesa diferida en `TasksPage.test.tsx`, foco con `waitFor` en `router.test.tsx` y `TaskDetailPage.test.tsx`, `asyncUtilTimeout: 3000` en `src/test/setup.ts`) | Validados por QA. Van en un commit `test` aparte |
| 6 Los finales de línea CRLF volvían en cada checkout y rompían `prettier --check` | Corregido con el visto bueno del responsable: `.gitattributes` con `* text=auto eol=lf` (CRLF solo para `*.cmd` y `*.bat`), en un commit `chore` aparte |
