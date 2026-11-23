# STD-10 — Crear, editar y eliminar etiquetas propias · Plan de implementación

> **Spec:** STD-10 en Jira (épica STD-2), refinada el 23-11-2026 · **Backlog:** US-017
> **Depende de:** STD-6 (sesión, usuarios). Usa la tabla `tasks` de STD-8 solo como destino de la FK de `task_tags`.
> **Estado del plan:** aprobado el 23-11-2026.

---

## 1. Objetivo

Que el usuario gestione sus etiquetas personales (crear, listar, renombrar y eliminar) sin duplicados normalizados (RN-PEN-5), y que eliminar una etiqueta la quite de los pendientes sin borrarlos. Asignar etiquetas a pendientes llega en STD-11.

## 2. Alcance

| Incluido | Fuera de alcance |
|---|---|
| Módulo backend `tags` con `GET`, `POST /tags`, `PATCH` y `DELETE /tags/{tagId}` | Asignar etiquetas a pendientes y mostrarlas en ellos (STD-11) |
| Tablas `tags` y `task_tags` (migración) | Filtrar pendientes por etiqueta (STD-11) |
| Página "Etiquetas" en el menú principal | Colores, iconos, jerarquías, límite por usuario, deshacer |

## 3. Decisiones del refinamiento

Están también en la sección "Refinamiento" de STD-10 en Jira.

| # | Decisión |
|---|---|
| R-01 | **Normalización:** `name.trim().replace(/\s+/g, ' ')`. Se guarda así, con las mayúsculas originales. Longitud 1–60 **después** de normalizar (`VARCHAR(60)` del modelo). |
| R-02 | **Duplicados: mayúsculas no, tildes sí.** La columna `tags.name` usa la intercalación **`utf8mb4_0900_as_ci`** (insensible a mayúsculas, sensible a tildes), así el índice único `uq_tags_user_name (user_id, name)` del modelo aplica la regla en la propia BD. La intercalación por defecto de MySQL 8.4 (`utf8mb4_0900_ai_ci`) trataría `Café` y `Cafe` como iguales, que va más allá de RN-PEN-5. Prisma no expresa intercalaciones, así que se añade a mano en el SQL de la migración antes de aplicarla. |
| R-03 | **Duplicado → `409 TAG_NAME_TAKEN`** con `errors: [{ field: 'name', … }]` para que el frontend lo muestre en el campo. El servicio lo detecta capturando el `P2002` de Prisma sobre `uq_tags_user_name` (sin consulta previa: la BD es la que decide y no hay carrera). |
| R-04 | **Renombrar** a un nombre que solo cambia mayúsculas de la propia etiqueta se permite (el único choca consigo misma, que es la fila que se actualiza). Si el nombre normalizado es **idéntico** al actual → `200` sin escribir. |
| R-05 | **Eliminar** borra la fila de `tags`; las filas de `task_tags` caen por `ON DELETE CASCADE` (`fk_task_tags_tag_id` del modelo). Los pendientes no se tocan. `204`. |
| R-06 | **`task_tags` se crea en esta feature** (sin endpoints) porque el criterio CA-06 "eliminar la quita de los pendientes sin borrarlos" necesita la tabla para probarse. Las filas de prueba se insertan directamente con Prisma en el test. STD-11 añade la asignación. |
| R-07 | **Lista:** `ORDER BY name, id` (la intercalación ya ordena sin distinguir mayúsculas). Paginación por cursor (constitución §6) con `limit` por defecto **100**; el cursor es el `id` de la última etiqueta (Prisma `cursor` + `skip: 1` con `orderBy [name, id]`). |
| R-08 | **Ajena, inexistente o id no numérico → `404 NOT_FOUND`** ("Esta etiqueta no existe."), validando el id antes que el body, igual que `validateTaskId` de STD-8. Se busca siempre por `{ id, userId }`. |
| R-09 | **Cuenta sin verificar:** puede gestionar etiquetas (solo `requireAuth`, sin `requireVerifiedEmail`). |
| R-10 | **Confirmación al eliminar sin diálogo modal:** al pulsar "Eliminar" la fila muestra en línea "¿Eliminar «X»? Se quitará de tus pendientes; los pendientes no se borran." con los botones **Eliminar** y **Cancelar**, y el foco pasa a "Cancelar". Así **no hace falta instalar `@radix-ui/react-alert-dialog`** (no está en el proyecto) y no se reimplementa un diálogo. |
| R-11 | **Renombrar en línea:** "Renombrar" cambia la fila a un formulario con el campo (foco en él, texto seleccionado), **Guardar** y **Cancelar**; `Escape` cancela. Al guardar o cancelar el foco vuelve al botón "Renombrar" de esa fila. |

## 4. Diseño

### 4.1 Backend: módulo nuevo `tags`

| Archivo | Contenido |
|---|---|
| `tags.schemas.ts` | `tagNameSchema` (string → normaliza R-01 → `min(1)` "El nombre es obligatorio." / `max(60)` "El nombre admite como máximo 60 caracteres."); `tagBodySchema = z.strictObject({ name })`; `listTagsQuerySchema` (`cursor`, `limit` 1–100, por defecto 100); `tagIdParamSchema`; `toTagDto` |
| `tags.routes.ts` | `requireAuth`; `GET /`, `POST /`, `PATCH /:tagId`, `DELETE /:tagId`, con `validateTagId` antes de `validateBody` |
| `tags.controller.ts` | `listTags` (200), `createTag` (201 + `Location`), `renameTag` (200), `deleteTag` (204) |
| `tags.service.ts` | Propiedad (`404`), no-op al renombrar igual (R-04), traducción de `P2002` a `409 TAG_NAME_TAKEN` (R-03) |
| `tags.repository.ts` | `list`, `findOwned(userId, id)`, `create`, `rename`, `delete`. Único acceso a Prisma para `tags` y `task_tags` |
| `shared/http/problem.ts` | Añadir el código `TAG_NAME_TAKEN` (409, "Etiqueta repetida") si los códigos están centralizados ahí |
| `api/app.ts` | `app.use('/api/v1/tags', tagsRoutes)` |

### 4.2 Frontend: feature nueva `tags`

| Archivo | Contenido |
|---|---|
| `tagsApi.ts` | `listTags(cursor)`, `createTag(name)`, `renameTag(id, name)`, `deleteTag(id)` por el cliente único de `src/api/` |
| `useTags.ts` | `useTags()` (`useInfiniteQuery`, como `useTasks`), `useCreateTag`, `useRenameTag`, `useDeleteTag`; las mutaciones invalidan `['tags']` |
| `TagsPage.tsx` | Título "Etiquetas", formulario "Nueva etiqueta" (campo + "Crear"), lista, estado vacío "Aún no tienes etiquetas.", carga, error y "Cargar más" |
| `TagRow.tsx` | Fila con nombre, "Renombrar" y "Eliminar"; modos edición (R-11) y confirmación (R-10) |
| `app/router.tsx` | Ruta privada `/tags` |
| `app/AppLayout.tsx` | `NavLink` "Etiquetas" junto a "Pendientes" |
| `api/types.ts` | `Tag`, `TagPage`, `TagRequest` desde `generated/std-10.ts` |
| `package.json` (`gen:api`) | Genera también `src/api/generated/std-10.ts` |

- **Errores:** `422` y `409` se muestran en el campo (`aria-invalid`, `aria-describedby`); `404` al renombrar o eliminar muestra "Esta etiqueta no existe." con `role="alert"` y refresca la lista. El texto se conserva si falla.
- **Accesibilidad:** `label` visible en cada campo (en la fila, `sr-only` "Nuevo nombre para «X»"); botones con nombre accesible que incluye la etiqueta (`aria-label="Renombrar Trabajo"`); éxito anunciado con `role="status"` ("Etiqueta creada", "Etiqueta renombrada", "Etiqueta eliminada"); tras eliminar, el foco va al título de la lista. Cabe a 360 px (las acciones se apilan).
- **Componentes:** los existentes (`Button`, `Input`, `Label`, `Card`, `Alert`). Ninguno nuevo de shadcn.

## 5. Datos

Migración `add_tags` con dos tablas del modelo, sin desviaciones de columnas, índices ni FKs:

```prisma
model Tag {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  name      String   @db.VarChar(60) // intercalación utf8mb4_0900_as_ci en la migración (R-02)
  createdAt DateTime @default(now()) @map("created_at")

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  taskTags TaskTag[]

  @@unique([userId, name], map: "uq_tags_user_name")
  @@index([userId], map: "idx_tags_owner")
  @@map("tags")
}

model TaskTag {
  id        Int      @id @default(autoincrement())
  taskId    Int      @map("task_id")
  tagId     Int      @map("tag_id")
  createdAt DateTime @default(now()) @map("created_at")

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([taskId, tagId], map: "uq_task_tag_pair")
  @@index([tagId], map: "idx_task_tags_tag")
  @@map("task_tags")
}
```

- Se añaden las relaciones inversas `tags` en `User` y `taskTags` en `Task`.
- **Única desviación respecto al modelo:** la intercalación `utf8mb4_0900_as_ci` de `tags.name` (R-02). Se documenta en el `comment` de `tags` en `sh2do-model.json`. Se genera con `prisma migrate dev --create-only`, se edita la línea de `name` a `VARCHAR(60) COLLATE utf8mb4_0900_as_ci NOT NULL` y luego se aplica.
- `idx_tags_owner` es redundante con el prefijo del único, pero se mantiene por fidelidad al modelo.

## 6. API

El contrato está en `contracts/openapi.yaml`. Va bajo `/api/v1` y requiere sesión.

| Método y ruta | Resumen | Éxito | Errores |
|---|---|---|---|
| `GET /tags` | Listar mis etiquetas (alfabético, cursor) | `200` `TagPage` | 401, 422 |
| `POST /tags` | Crear | `201` `Tag` | 400, 401, 409, 422 |
| `PATCH /tags/{tagId}` | Renombrar | `200` `Tag` | 400, 401, 404, 409, 422 |
| `DELETE /tags/{tagId}` | Eliminar | `204` | 401, 404 |

Código de error nuevo: **`TAG_NAME_TAKEN`** (409).

## 7. Dependencias

**Ninguna nueva** (ver R-10).

## 8. Pruebas: qué prueba verifica cada criterio

| Criterio (Jira) | Backend (`test/tags.test.ts`) | Frontend (`TagsPage.test.tsx`, `TagRow.test.tsx`) |
|---|---|---|
| CA-01 Crear | `POST` → `201`, `Location`, nombre normalizado (`"  Casa   y  jardín "` → `"Casa y jardín"`) | Crear añade la etiqueta a la lista y anuncia "Etiqueta creada" |
| CA-02 Nombre inválido | Vacío, solo espacios, 61 caracteres tras normalizar, sin `name`, campos extra → `422` en `name` | Un `422` simulado se muestra en el campo |
| CA-03 Duplicado | `trabajo`, `TRABAJO` y `" Trabajo "` contra `Trabajo` → `409 TAG_NAME_TAKEN`; `Cafe` con `Café` existente → `201` | Un `409` simulado se muestra en el campo |
| CA-04 Otro usuario | Mismo nombre en dos usuarios → `201` | — |
| CA-05 Renombrar | `200` con el nombre nuevo; solo mayúsculas propias → `200`; idéntico → `200` sin cambios; chocar con otra propia → `409` y la BD sin cambios | Renombrar en línea guarda y vuelve el foco; `Escape` cancela; un `409` se muestra en el campo |
| CA-06 Eliminar | Con filas en `task_tags` (insertadas en el test): `204`, la etiqueta y sus `task_tags` desaparecen, los `tasks` y `task_occurrences` siguen iguales | Pedir eliminar muestra la confirmación; "Cancelar" no llama a la API; "Eliminar" llama al `DELETE` y la quita de la lista |
| CA-07 Solo las mías, alfabético | Lista solo las propias, orden alfabético sin distinguir mayúsculas; paginación con `limit` y `nextCursor` | Estado vacío, carga y error |
| CA-08 Ajena o inexistente | `PATCH` y `DELETE` sobre ajena → `404` y la BD sin cambios; inexistente → `404`; `abc` con body inválido → `404` (no `422`) | Un `404` simulado muestra "Esta etiqueta no existe." |
| CA-09 Sin sesión | Las cuatro rutas → `401` | — (las rutas privadas ya redirigen al login) |

La cobertura sigue con el umbral del 80 % en los dos workspaces.

## 9. Orden de ejecución

1. **Fase 0 (orquestador):** nada que preparar; la migración la crea el backend.
2. **Fase 1, en paralelo:** `backend-implementer` (T-B*) y `frontend-implementer` (T-F*), contra `contracts/openapi.yaml`.
3. **Fase 2, integración:** prueba de humo a través del proxy de Vite.
4. **Fase 3:** `qa-reviewer`.
5. **Fase 4:** tus pruebas manuales. Con tu aprobación, STD-10 pasa a **Done** y se abre la **pull request** hacia `main`.

## 10. Ajustes tras la revisión de QA (23-11-2026)

Veredicto inicial: **rechazado** por un bloqueante (B-01); el resto, 9 menores.

| Hallazgo | Decisión |
|---|---|
| B-01 El `cursor` de Prisma leía la fila del cursor sin filtrar por dueño y permitía deducir nombres de etiquetas ajenas | **Corregido por el orquestador.** El servicio exige que el cursor sea una etiqueta propia (si no, `422` en `cursor`, "El cursor no es válido.") y el repositorio pagina con keyset explícito (`name > x OR (name = x AND id > y)`) dentro de `userId`. Prueba nueva en `tags.test.ts`. Contrato: descripción del parámetro `cursor` actualizada |
| m-01 Carrera `P2025` → 500 | **Corregido:** renombrar traduce `P2025` a `404`; eliminar usa `deleteMany({ id, userId })` y responde `404` si `count = 0` |
| m-04 El aviso repetido no se vuelve a anunciar | **Corregido:** la página vacía el aviso (`role="status"`) al empezar cada acción de una fila (`onStart`). Prueba nueva |
| m-05 Foco perdido tras un 404 al renombrar o eliminar | **Corregido:** el foco va al título "Mis etiquetas". Prueba ampliada |
| m-02, m-03, m-06, m-07, m-08, m-09 | Aceptados sin cambios por el responsable |
