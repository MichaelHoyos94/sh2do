# STD-8 — Crear, editar y consultar un pendiente · Plan de implementación

> **Spec:** STD-8 en Jira (épica STD-2), refinada el 21-11-2026 · **Backlog:** US-002
> **Depende de:** STD-6 (sesión, `requireAuth`, cliente HTTP y layout privado ya existen).
> **Estado del plan:** aprobado el 21-11-2026. Ajustado tras la revisión de QA (ver §10).

---

## 1. Objetivo

Que un usuario con sesión pueda **crear**, **listar**, **consultar** y **editar** sus pendientes personales. Cada pendiente tiene título y, si el usuario quiere, descripción, fecha y hora. Es la primera feature del dominio de pendientes: crea las tablas `tasks` y `task_occurrences` y el módulo `tasks`, que usarán después STD-9 a STD-15.

## 2. Alcance

| Incluido | Fuera de alcance |
|---|---|
| Crear un pendiente (título, descripción, fecha y hora opcionales) | Eliminar pendientes (D-01) |
| Lista de mis pendientes, paginada | Cambiar el estado (STD-9) |
| Detalle de un pendiente | Cambiar la prioridad, etiquetas y filtros (STD-10, STD-11) |
| Editar título, descripción, fecha y hora | Recurrencias (STD-12) |
| Estado y prioridad visibles (solo lectura) | Recordatorios y notificaciones (STD-15, STD-16) |
| `/` lleva a la lista de pendientes; enlace "Pendientes" en la cabecera | Editar la zona horaria del perfil |

## 3. Decisiones del refinamiento

Están también en la sección "Refinamiento" de STD-8 en Jira.

| # | Decisión |
|---|---|
| R-01 | **Conflicto de alcance:** la spec de Jira pedía también cambiar el estado. `product.md` lo separa en STD-9, y `product.md` gana. En STD-8 el estado solo se muestra. La mención a recordatorios en la historia de usuario se cubre en STD-15 y STD-16. |
| R-02 | **Título:** obligatorio, entre 1 y 200 caracteres tras recortar. **Descripción:** opcional, hasta 5000 caracteres; si queda vacía tras recortar, se guarda `null`. |
| R-03 | **Fecha y hora (D-05):** ambas opcionales. Se permite sin fecha, con fecha sin hora, o con fecha y hora. **Una hora sin fecha responde `422`** en `scheduledTime`. Quitar la fecha quita también la hora. La fecha debe ser de calendario válida (2026-02-30 → `422`). Se admiten fechas pasadas. |
| R-04 | **Zona horaria (D-06):** la fecha y la hora se interpretan en la zona del usuario. Se guarda esa zona en la ocurrencia al crear y cada vez que cambian la fecha o la hora. |
| R-05 | **Estado y prioridad iniciales:** `pending` y `medium` (RN-PEN-2, RN-PEN-3). La API los devuelve, pero no los acepta en la entrada. |
| R-06 | **Lista:** solo los pendientes propios, **del más reciente al más antiguo** (por creación), 20 por página con "Cargar más" (cursor, límite máximo 100). El orden por fecha y los filtros llegan con STD-11. |
| R-07 | **Pendiente ajeno o inexistente → `404 NOT_FOUND`** ("Este pendiente no existe"). Un id que no es entero positivo también responde `404`. |
| R-08 | **Edición parcial (`PATCH`):** solo cambian los campos enviados; `null` borra un campo opcional. Un body vacío responde `200` sin cambios. |
| R-09 | **Correo sin verificar:** puede usar sus pendientes (STD-6 R-06). No se aplica `requireVerifiedEmail`. |
| R-10 | **Rutas del frontend:** `/tasks` (lista), `/tasks/new` (crear), `/tasks/:taskId` (detalle) y `/tasks/:taskId/edit` (editar), todas privadas. `/` redirige a `/tasks`. Se elimina el `HomePage` provisional de STD-6. Tras crear o editar se navega al detalle. |

## 4. Diseño

### 4.1 Backend: módulo nuevo `tasks`

| Archivo | Contenido |
|---|---|
| `modules/tasks/tasks.routes.ts` | `GET /`, `POST /`, `GET /:taskId`, `PATCH /:taskId`, todas con `requireAuth` y `validateBody`. Montado en `/api/v1/tasks` en `api/app.ts` |
| `modules/tasks/tasks.schemas.ts` | Zod: `createTaskSchema` y `updateTaskSchema` (`.strict()`, como el resto), `listTasksQuerySchema` y `toTaskDto` |
| `modules/tasks/tasks.controller.ts` | Lee la request validada y responde `200` o `201`. El `201` lleva `Location` |
| `modules/tasks/tasks.service.ts` | `create`, `list`, `getOwned` y `update`. Aplica R-02 a R-08 y la autorización por dueño |
| `modules/tasks/tasks.repository.ts` | El único acceso a Prisma para `tasks` y `task_occurrences` |
| `shared/time.ts` (nuevo) | `toUtcInstant(date, time, zone)` con **Luxon**, más los ayudantes para leer y escribir las columnas `DATE` y `TIME` |
| `shared/http/validate.ts` | Añade `validateQuery`, igual que `validateBody`, para `cursor` y `limit` |

**Representación.** Un pendiente simple es una fila en `tasks` más **una** ocurrencia en `task_occurrences` con `sequence_no = 0`. Ahí viven el estado, la fecha, la hora, la zona y `scheduled_at_utc` (`sh2do-model.json`). La API no expone la ocurrencia en esta feature: el DTO `Task` aplana la ocurrencia 0 (ver el contrato).

**Flujos**

1. **Crear** (`POST /tasks`):
   1. El servicio obtiene la zona del usuario a través de `usersService.findById`, sin tocar el repositorio de `users`.
   2. Si hay fecha y hora, calcula `scheduled_at_utc` con Luxon.
   3. Crea `tasks` y su ocurrencia 0 en **una sola operación** (create anidado de Prisma, atómico): `status = pending`, `priority = medium`.
   4. Responde `201` con `Location: /api/v1/tasks/{id}`.
2. **Listar** (`GET /tasks?cursor&limit`):
   1. Filtra `tasks.user_id = usuario` e incluye la ocurrencia 0.
   2. Ordena por `id` descendente y pide `limit + 1` filas para saber si hay otra página.
   3. `nextCursor` es el `id` del último elemento como string; `null` si no hay más. Un cursor que no es entero positivo responde `422`.
3. **Consultar** (`GET /tasks/:taskId`): busca por `id` **y** `user_id` a la vez, de modo que un pendiente ajeno es indistinguible de uno inexistente (`404`).
4. **Editar** (`PATCH /tasks/:taskId`):
   1. Carga el pendiente propio (si no, `404`).
   2. Mezcla los cambios con los valores actuales, aplica "quitar la fecha quita la hora" y valida "no hay hora sin fecha" sobre el **resultado** (`422` en `scheduledTime`).
   3. Si cambiaron la fecha o la hora, recalcula `scheduled_at_utc` y guarda la zona actual del usuario.
   4. En una **transacción** actualiza `tasks` (incluido `updated_at`, aunque solo cambie la ocurrencia) y la ocurrencia 0. Responde `200`.

**Cálculo de `scheduled_at_utc`.** Usa `DateTime.fromISO('YYYY-MM-DDTHH:mm', { zone })` de Luxon. Con fecha sin hora, o sin fecha, queda `null`. Si la hora cae en el **salto del cambio de horario** (una hora que no existe en esa zona), Luxon la adelanta a la primera hora válida. Se documenta y se prueba, porque STD-15 calculará los recordatorios desde este instante.

**Errores.** Se reutilizan `NOT_FOUND`, `VALIDATION_ERROR` y `UNAUTHENTICATED`. No hay códigos nuevos. Todos los mensajes van en español ("El título es obligatorio.", "Pon una fecha para poder elegir la hora.", "Este pendiente no existe.").

### 4.2 Frontend: feature nueva `tasks`

| Archivo | Contenido |
|---|---|
| `features/tasks/tasksApi.ts` | `listTasks`, `getTask`, `createTask` y `updateTask` sobre el cliente único `api/client.ts` |
| `features/tasks/useTasks.ts` | `useInfiniteQuery` para la lista (`['tasks']`), `useQuery` para el detalle (`['tasks', id]`), y `useMutation` para crear y editar, que invalidan `['tasks']` |
| `features/tasks/TasksPage.tsx` | Lista: título, fecha y hora, estado y prioridad. Estados de carga, vacío ("Aún no tienes pendientes") y error. Botones "Nuevo pendiente" y "Cargar más" |
| `features/tasks/TaskForm.tsx` | Formulario compartido: Título, Descripción, Fecha (`<input type="date">`) y Hora (`<input type="time">`). La hora está deshabilitada sin fecha, con una indicación, y se vacía al quitar la fecha. Errores `422` por campo y `ErrorSummary` (los de `features/auth`) |
| `features/tasks/NewTaskPage.tsx`, `EditTaskPage.tsx` | Usan `TaskForm`. Al guardar navegan al detalle |
| `features/tasks/TaskDetailPage.tsx` | Todos los datos, incluida la descripción, y el botón "Editar". Con `404` muestra "Este pendiente no existe" y un enlace a la lista. **No hay ningún botón de eliminar** |
| `features/tasks/format.ts` | Etiquetas en español del estado y de la prioridad, y el formato de la fecha y la hora con `Intl.DateTimeFormat('es')`. Por ejemplo "vie, 28 nov 2026 · 18:30" o "Sin fecha" |
| `components/ui/textarea.tsx`, `components/ui/badge.tsx` | Componentes base al estilo shadcn, copiados a mano (sin dependencias nuevas; `badge` usa `class-variance-authority`, que ya está instalado) |
| `app/router.tsx` | Las rutas de R-10; el índice es `<Navigate to="/tasks" replace />` |
| `app/AppLayout.tsx` | Enlace "Pendientes" en la cabecera |
| `features/home/HomePage.tsx` | Se elimina (R-10) |
| `package.json` (`gen:api`) | Genera también `src/api/generated/std-8.ts` |

- **Fechas en pantalla:** la fecha y la hora ya son locales del usuario, así que el frontend no convierte zonas. Formatea la fecha como fecha de calendario, sin pasar por la zona del navegador (`Date.UTC` + `timeZone: 'UTC'`), para que no se corra un día. **Luxon no se instala en el frontend.**
- **Accesibilidad:**
  - Cada campo tiene su `<Label>`, con `aria-describedby` para las indicaciones y los errores.
  - El error de envío se anuncia con `aria-live`.
  - La lista es un `<ul>` y cada pendiente un enlace al detalle.
  - El estado y la prioridad se muestran con texto, no solo con color.
  - Diseño responsive desde 360 px.

## 5. Datos

Las dos tablas se añaden a `schema.prisma` **tal cual** están en `sh2do-model.json`, con nombres `snake_case` mediante `@map`/`@@map`:

- **`tasks`:** `id`, `user_id`, `title` (VARCHAR 200), `description` (TEXT), `priority` (enum `low|medium|high`, por defecto `medium`), `created_at` y `updated_at`. Índice `idx_tasks_owner (user_id)`.
- **`task_occurrences`:** `id`, `task_id`, `recurrence_rule_id`, `sequence_no`, `original_date` (DATE), `scheduled_date` (DATE), `scheduled_time` (TIME), `timezone` (VARCHAR 64), `scheduled_at_utc`, `status` (enum `pending|in_progress|completed`, por defecto `pending`), `title_override`, `description_override`, `priority_override`, `reminders_overridden` (por defecto `false`), `completed_at`, `created_at` y `updated_at`.
  - Índices `idx_occ_user_calendar`, `idx_occ_rule` e `idx_occ_due`, y la restricción única `uq_task_occ_sequence (task_id, sequence_no)`.
  - En STD-8 las columnas de recurrencia y de override (`recurrence_rule_id`, `original_date` y los `*_override`) quedan en `null` o con su valor por defecto. Se crean ya para no tener que alterar la tabla en STD-12.
- **Enums de Prisma:** `TaskPriority` y `OccurrenceStatus`.
- **Migración nueva:** `add_tasks`.

**Desviaciones del modelo, documentadas:**

| Desviación | Motivo |
|---|---|
| `task_occurrences.recurrence_rule_id` **sin FK** por ahora | La tabla `recurrence_rules` no existe todavía. STD-12 añade la FK (`ON DELETE SET NULL`, como indica el modelo). Mismo criterio que `email_deliveries.notification_id` en STD-6 |
| `tasks.user_id` con `ON DELETE RESTRICT`, no `Cascade` | Mismo criterio que todas las FK hacia `users` desde STD-6 (STD-7 plan §5, QA M1): se mantiene `RESTRICT` hasta que exista el borrado de cuenta |

`task_occurrences.task_id` usa `Cascade`, como indica el modelo. Ninguna de las dos desviaciones cambia el modelo de referencia, así que `sh2do-model.json` **no se modifica**.

## 6. API

El contrato completo está en `contracts/openapi.yaml`. Todas las rutas van bajo `/api/v1` y requieren sesión.

| Método y ruta | Resumen | Éxito | Errores |
|---|---|---|---|
| `GET /tasks?cursor&limit` | Lista mis pendientes | `200` `TaskPage` | 401, 422 |
| `POST /tasks` | Crea un pendiente | `201` `Task` + `Location` | 400, 401, 422 |
| `GET /tasks/{taskId}` | Consulta un pendiente | `200` `Task` | 401, 404 |
| `PATCH /tasks/{taskId}` | Edita un pendiente | `200` `Task` | 400, 401, 404, 422 |

No existe `DELETE /tasks/{taskId}`: la ruta no se declara y responde `404` como cualquier ruta inexistente.

## 7. Dependencias

| Paquete | Workspace | Motivo |
|---|---|---|
| `luxon` | backend (runtime) | **Obligatorio por la constitución** (§2, Fechas) para calcular `scheduled_at_utc` desde la fecha y hora locales y la zona IANA, con el cambio de horario bien resuelto. Lo seguirán usando STD-12 (recurrencias) y STD-15 (recordatorios) |
| `@types/luxon` | backend (desarrollo) | Tipos de TypeScript para Luxon |

**Requieren tu visto bueno** (constitución §1.7). Ninguna otra dependencia nueva; el frontend no instala nada.

## 8. Pruebas: qué prueba verifica cada criterio

| Criterio (Jira) | Backend | Frontend |
|---|---|---|
| CA-01 Crear con datos correctos | `201`; `status = pending`, `priority = medium`, `timezone` del usuario, `Location`; una ocurrencia con `sequence_no = 0` | Rellenar y guardar navega al detalle; la lista se invalida |
| CA-02 Sin título o título largo | `422` con error en `title` (vacío, solo espacios o más de 200); nada creado | Error en el campo sin llamar a la API; también muestra el `422` del servidor por campo |
| CA-03 Fecha y hora opcionales | Los tres casos válidos se guardan; hora sin fecha → `422 scheduledTime`; 2026-02-30 → `422`; `scheduled_at_utc` correcto (prueba unitaria de `toUtcInstant`, incluidos un salto de cambio de horario y una zona con offset negativo) | La hora está deshabilitada sin fecha y se vacía al quitar la fecha |
| CA-04 Lista propia y paginada | Solo los propios (con datos de otro usuario sembrados); orden descendente; con 21 pendientes, `limit` 20 da `nextCursor` y la segunda página trae 1; cursor o `limit` inválidos → `422` | Estados de carga, vacío y error; "Cargar más" pide la página siguiente |
| CA-05 Detalle | `200` con todos los campos | Muestra la descripción y el resto de datos |
| CA-06 Editar | `PATCH` parcial; `null` borra; quitar la fecha borra la hora; recalcula `scheduled_at_utc`; actualiza `updatedAt`; mismas validaciones que al crear | El formulario llega precargado y al guardar navega al detalle con los datos nuevos |
| CA-07 Ajeno o inexistente | `GET` y `PATCH` de un pendiente ajeno → `404` y sin cambios en la BD; id inexistente o no numérico → `404` | El detalle y la edición muestran "Este pendiente no existe" |
| CA-08 Sin eliminación | `DELETE /tasks/:id` → `404` y el pendiente sigue existiendo | El detalle no tiene ningún botón de eliminar |
| CA-09 Sin sesión | Las 4 rutas → `401` | `/tasks` sin sesión redirige a `/login?redirect=/tasks` (prueba del router) |

La cobertura sigue con el umbral del 80 % en los dos workspaces.

## 9. Orden de ejecución

1. **Fase 0, orquestador:** con tu visto bueno, instalar `luxon` y `@types/luxon` en `backend`.
2. **Fase 1, en paralelo:** `backend-implementer` (T-B*) y `frontend-implementer` (T-F*), contra `contracts/openapi.yaml`.
3. **Fase 2, integración:** prueba de humo a través del proxy de Vite.
4. **Fase 3:** `qa-reviewer`.
5. **Fase 4:** tus pruebas manuales. Con tu aprobación, STD-8 pasa a **Done** y se abre la **pull request** hacia `main`.

## 10. Ajustes tras la revisión de QA (21-11-2026)

Veredicto: **aprobado con observaciones** (1 mayor y 13 menores).

| Hallazgo | Decisión |
|---|---|
| M1 Una fecha incompleta o inválida se guardaba como "sin fecha" sin aviso (CA-03) | Corregido: `TaskForm` comprueba `validity.badInput` del campo Fecha al enviar y muestra "Escribe una fecha válida o déjala vacía.". Con prueba |
| m2 `PATCH /tasks/abc` con body inválido respondía `422` en vez de `404` | Corregido: el id se valida en `tasks.routes.ts` (`validateTaskId`) antes que el body. Resuelve también m1 (Zod fuera del controller). Con prueba |
| m4 `tasks` recibía la fila completa del usuario, con el hash | Corregido: `usersService.getTimezone(id)` devuelve solo la zona |
| m6 "Creado" y "Última edición" usaban la zona del navegador | Corregido: se formatean en la zona del perfil (constitución §8). Con prueba |
| m12 Título de prueba desactualizado en `LoginPage.test.tsx` | Corregido |
| m3, m5, m7, m8, m9, m10, m11 y m13 | Aceptados sin cambios por el responsable. m11 (hora ambigua al retrasar el reloj) conviene fijarlo en STD-15 |

**Incidente durante QA:** el agente lanzó `npx vitest` desde la raíz, sin la configuración del workspace, y las pruebas corrieron contra la BD de desarrollo: se borraron sesiones, entregas de correo y tokens de verificación, y se creó el usuario `ana@example.com` con 23 pendientes. El responsable decidió dejar la BD así. Se añadió a `.claude/agents/qa-reviewer.md` la regla de ejecutar las pruebas solo con los scripts del proyecto.
