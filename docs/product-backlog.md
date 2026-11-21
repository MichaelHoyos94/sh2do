# sh2do — Product Backlog MVP v1.0

> **Estado:** línea base de Product Discovery (20-11-2026).  
> **Objetivo:** MVP público, inicialmente dimensionado para hasta 100 usuarios activos mensuales.  
> **Stack previsto:** React + TypeScript · Node.js + TypeScript · MySQL + Prisma · Redis/BullMQ · Docker.  
> **Enfoque:** anotar pendientes, recibir recordatorios y coordinar planes informales sin complejidad empresarial.

## 1. Alcance del MVP

- **Cuentas:** registro con correo/contraseña, verificación del correo, sesión y recuperación de contraseña.
- **Pendientes personales:** título obligatorio; fecha opcional; estados `pendiente / en progreso / completado`; etiquetas propias, prioridad `baja / media / alta` y filtros.
- **Recurrencias:** diarias, semanales o mensuales, con fecha de inicio; ocurrencias independientes y edición de `solo esta` o `esta y futuras`.
- **Recordatorios:** hasta **3** por actividad u ocurrencia, anticipaciones predefinidas o personalizadas; notificaciones internas y correo. El usuario puede desactivar **correos de recordatorios**, no los avisos importantes de planes.
- **Planes compartidos:** título, fecha y hora; ubicación, descripción y notas opcionales. El creador edita/cancela y comparte un enlace revocable. Visita sin cuenta; respuesta `voy / no voy` solo con sesión y correo verificado. Cada asistente personaliza sus recordatorios.
- **Planes e historial:** `Mis planes` conserva acceso de asistentes confirmados aun si se revoca el enlace; tras la fecha programada el plan queda en historial y no acepta nuevas respuestas. Se avisa a quienes hayan confirmado `voy` ante cambio de fecha/hora/ubicación o cancelación.

**Fuera del MVP:** Google OAuth, app móvil nativa, push, integración WhatsApp, chats/comentarios, votaciones, gastos compartidos, asignación de tareas, planes recurrentes, adjuntos, sincronización de calendario y pagos.

## 2. Épicas y prioridades

- **EP-01:** Cuentas y autenticación.
- **EP-02:** Pendientes y organización.
- **EP-03:** Recurrencias.
- **EP-04:** Recordatorios y notificaciones.
- **EP-05:** Planes compartidos.

`Must` = esencial para el MVP; `Should` = comprometido para el MVP, con menor criticidad de implementación. **22 historias: 19 Must y 3 Should.** Las prioridades y criterios son la línea base; los detalles marcados como supuestos deben validarse en SDD.

## 3. Backlog priorizado (orden recomendado de construcción)

> **Lectura:** cada fila incluye historia, criterio(s) de aceptación mínimo(s), dependencias y trazabilidad. Los identificadores `RF`, `RN` y `RNF` se refieren al catálogo de Discovery; se mantienen para facilitar SDD.

### Incremento 0 — Fundamentos

| ID | Enabler técnico (Must) | Criterio de cierre |
|---|---|---|
| EN-001 | Monorepo, React/API/worker, TS, Prisma, MySQL, Docker | Servicios arrancan localmente; migraciones reproducibles; secretos fuera del repositorio. |
| EN-002 | Redis/BullMQ y programación de trabajos | Jobs programados, reintentos, validación de vigencia e idempotencia lógica. |
| EN-003 | Proveedor de correo y plantillas | Correos transaccionales; registrar resultados y probar con proveedor simulado. |
| EN-004 | Seguridad transversal | Validación de entrada, autorización por recurso, hashing y límites de intentos. |
| EN-005 | Observabilidad y respaldo | Logs de fallos, reconciliación de trabajos y restauración de MySQL probada. |
| EN-006 | CI, pruebas y despliegue | Pruebas críticas, HTTPS, gestión de secretos, revisión responsive/accesibilidad. |

### Incremento 1 — Pendientes personales completos

| Orden / ID | Historia (como usuario...) | Pri. | Criterios de aceptación esenciales | Dep. | Trazabilidad |
|---|---|---|---|---|---|
| 01 · **US-001** | Registrarme, verificar correo e iniciar/cerrar sesión. | Must | Registro con correo válido; verificación mediante enlace; credenciales incorrectas no revelan datos; cuenta sin verificar no confirma asistencia. | EN-001, EN-003, EN-004 | RF-001,015 · RN-026 · RNF-001,002 |
| 02 · **US-016** | Recuperar mi contraseña. | Must | Solicitud con respuesta genérica; enlace temporal de un uso; contraseña actualizable; enlace vencido rechazado. | US-001 | RF-022 · RNF-001,002 |
| 03 · **US-002** | Crear, consultar y editar un pendiente. | Must | Título obligatorio; fecha opcional; estado inicial `pendiente`; solo se accede a pendientes propios. | US-001 | RF-002 · RN-001,002,021 · RNF-002,004 |
| 04 · **US-003** | Cambiar el estado de mis pendientes. | Must | Permite los tres estados y los persiste; al completar deja de emitir avisos futuros de esa ocurrencia. | US-002 | RF-003 · RN-002,018,021 · RNF-002 |
| 05 · **US-017** | Crear, editar y eliminar etiquetas propias. | Should | Etiquetas por usuario; sin duplicados normalizados; eliminar etiqueta no borra pendientes. | US-001 | RF-018 · RN-012,021 · RNF-002 |
| 06 · **US-005** | Asignar prioridades/etiquetas y filtrar. | Should | Prioridades baja/media/alta; filtra por estado, prioridad y etiquetas combinables; resultados autorizados. | US-002,003,017 | RF-004,005 · RN-012,013,021 · RNF-002,004,009 |
| 07 · **US-004** | Crear pendientes recurrentes. | Must | Repetición diaria/semanal/mensual; inicio obligatorio; el día 31 se ajusta al último día del mes y vuelve al 31 cuando existe. | US-002 | RF-016 · RN-010,022,023 · RNF-007,010 |
| 08 · **US-018** | Gestionar cada ocurrencia de una recurrencia. | Must | Estados e historial por ocurrencia; completar una no completa las siguientes. | US-003,004 | RF-021 · RN-011,025 · RNF-007,010 |
| 09 · **US-019** | Editar esta ocurrencia o esta y las futuras. | Must | La edición puntual no altera otras; editar futuras preserva el pasado y actualiza avisos pendientes. | US-004,018 | RF-024,016,021 · RN-024,025,020 · RNF-005,007 |
| 10 · **US-006** | Configurar mis recordatorios. | Must | Máximo 3 por actividad/ocurrencia; anticipaciones predefinidas o libres; requiere fecha/hora válida; recalcula ante cambios. | US-002, EN-002 | RF-010,017 · RN-008,009,018,020 · RNF-005,007 |
| 11 · **US-007** | Recibir avisos internos y por correo. | Must | Se procesa a su hora; notificación interna persistente; correo según preferencia; no se envían avisos obsoletos ni se duplican lógicamente. | US-006, EN-002,003 | RF-011,012 · RN-008,018,020 · RNF-005,006,011 |
| 12 · **US-014** | Configurar correos de recordatorios. | Should | Preferencia persistida; desactivar correo mantiene avisos internos y correos importantes de planes. | US-001,007 | RF-019 · RN-016 · RNF-002,005 |
| 13 · **US-015** | Consultar y marcar notificaciones como leídas. | Must | Bandeja ordenada, estados leído/no leído y conteo; acceso exclusivo a avisos propios. | US-001,007 | RF-011,023 · RN-021 · RNF-002,004,009 |

### Incremento 2 — Planes compartidos completos

| Orden / ID | Historia (como usuario...) | Pri. | Criterios de aceptación esenciales | Dep. | Trazabilidad |
|---|---|---|---|---|---|
| 14 · **US-008** | Crear, editar y cancelar un plan. | Must | Título, fecha y hora obligatorios; datos adicionales opcionales; solo creador modifica/cancela; cancelado no recibe respuestas. | US-001 | RF-006,014 · RN-003,017 · RNF-002,007 |
| 15 · **US-009** | Compartir un plan mediante enlace. | Must | Enlace único y copiable, token no predecible, sin integración de mensajería. | US-008 | RF-007 · RN-014 · RNF-003 |
| 16 · **US-022** | Ver un plan desde el enlace sin cuenta. | Must | Enlace vigente abre detalles compartibles; no permite responder sin cuenta verificada ni expone datos privados de asistentes. | US-009 | RF-008 · RN-004,014,015 · RNF-002,003 |
| 17 · **US-010** | Confirmar o rechazar asistencia. | Must | Solo sesión con correo verificado; `voy/no voy`, una respuesta vigente; puede actualizar antes de la hora del plan; creador consulta respuestas. | US-001,009,022 | RF-009,026 · RN-004,005,019,026,027 · RNF-001,002 |
| 18 · **US-020** | Consultar Mis planes. | Must | Incluye planes propios y con asistencia `voy`; asistentes confirmados siguen accediendo si el enlace se revoca; autorización por usuario. | US-008,010 | RF-025 · RN-003,028 · RNF-002,004 |
| 19 · **US-013** | Revocar y regenerar enlaces. | Must | Solo creador; enlace anterior inválido de inmediato; nuevo token distinto; no se pierde asistencia ni acceso autorizado desde Mis planes. | US-009,010,020 | RF-020 · RN-003,015,028 · RNF-002,003 |
| 20 · **US-011** | Programar recordatorios propios para planes. | Must | Hasta 3 por asistente `voy`; independientes entre usuarios; se recalculan si cambia el plan y se cancelan si no asiste o finaliza. | US-006,007,010 | RF-010,017 · RN-006,009,020 · RNF-005,007 |
| 21 · **US-012** | Recibir avisos de cambios o cancelación. | Must | Solo cambios reales de fecha/hora/ubicación y cancelación; destinatarios `voy` al momento del evento; aviso interno y correo aun con recordatorios por correo desactivados. | US-007,008,010 | RF-013,019 · RN-007,016,017 · RNF-005,006,011 |
| 22 · **US-021** | Consultar el historial de planes. | Must | Planes pasados y cancelados consultables por usuarios autorizados; sin nuevas confirmaciones tras la hora prevista. | US-008,010,020 | RF-025,026 · RN-027,028 · RNF-002,007 |

### Incremento 3 — Preparación de lanzamiento

- Ejecutar pruebas unitarias, integración y E2E de flujos críticos; controles de autorización y acceso anónimo.
- Validar recuperación de fallos de worker/Redis y respaldo/restauración MySQL.
- Revisar accesibilidad de flujos principales, responsive y objetivos de rendimiento.
- Publicar con HTTPS, observabilidad y configuración segura de correo/secretos.

## 4. Reglas de negocio críticas (resumen)

1. **Propiedad y permisos:** pendientes y etiquetas son privados; únicamente el creador modifica/cancela planes. La confirmación requiere cuenta con correo verificado.
2. **Pendientes:** fecha opcional; estados `pendiente`, `en progreso`, `completado`.
3. **Recurrencias:** fecha de inicio obligatoria; repetición diaria/semanal/mensual; cada ocurrencia tiene estado propio; completar una no afecta futuras; edición `esta` o `esta y futuras`; fin de mes ajustado al último día existente.
4. **Recordatorios:** máximo tres por actividad/ocurrencia, con instante calculable; personales para cada asistente; no emitir avisos obsoletos o de ocurrencias completadas.
5. **Planes:** el enlace vigente permite lectura anónima; el enlace revocado no; `voy/no voy` y una respuesta vigente por usuario; invitados con `voy` mantienen acceso desde `Mis planes` tras revocación.
6. **Cambios relevantes:** fecha, hora, ubicación y cancelación notifican a quienes tenían `voy`; correos importantes no se desactivan desde la preferencia de recordatorios.
7. **Historial:** una vez alcanzada la fecha/hora del plan, pasa al historial y se bloquean nuevas respuestas.

## 5. RNF: calidad mínima de salida

| Área | Objetivo / control inicial |
|---|---|
| Seguridad | Hash de contraseña apropiado (p. ej., Argon2id); autorización en backend; tokens aleatorios; protección ante abuso. |
| Rendimiento | Propuesta: **p95 < 500 ms** en API habitual, bajo prueba de carga definida (sin latencia de terceros). |
| Puntualidad | Propuesta: **95 % de recordatorios procesados en ≤ 60 s** de su programación en operación normal. |
| Confiabilidad | Reintentos, idempotencia lógica, reconciliación de jobs, registro de fallos y recuperación ante interrupciones. |
| Fechas | Instantes UTC y zona horaria conservada para recurrencia/visualización; pruebas de fin de mes y cambio horario. |
| UX/accesibilidad | Web responsive; navegación por teclado; objetivo WCAG 2.2 AA para flujos principales. |
| Operación | Logs, backups y restauración MySQL probada; despliegue HTTPS; pruebas automatizadas de rutas críticas. |

*Las métricas son propuestas de aceptación técnica, no mediciones verificadas ni SLA aprobados.*

## 6. Arquitectura propuesta (sin MER)

- **Enfoque:** monolito modular para API Node.js; **worker** separado para tareas asíncronas.
- **Frontend:** React/TypeScript; API REST HTTPS.
- **Persistencia:** MySQL/Prisma como fuente de verdad de pendientes, recurrencias, planes, notificaciones y estado de ejecución.
- **Colas:** Redis/BullMQ programa y procesa trabajos; el worker valida en MySQL su vigencia antes de emitir avisos. Prever reconciliación después de fallos.
- **Módulos lógicos:** Auth/Users, Tasks/Tags, Recurrence, Plans/Participation/ShareLinks, Reminders/Notifications, Jobs.
- **Orden de trabajo:** fundamentos → pendientes personales completos → planes compartidos completos → estabilización/lanzamiento.

## 7. Pruebas transversales imprescindibles

- Pendiente sin fecha; filtros y autorización por propietario.
- Recurrencia mensual desde el **31/01** y restablecimiento del día 31 en meses posteriores compatibles.
- Completar solo una ocurrencia; editar `esta` vs. `esta y futuras` sin modificar el historial.
- Cambiar fecha/hora con recordatorios programados; bloquear avisos obsoletos y duplicados lógicos.
- Rechazar confirmación sin correo verificado o después del inicio del plan.
- Revocar enlace: lectura anónima denegada y acceso del asistente con `voy` conservado en `Mis planes`.
- Notificar solo cambios relevantes a participantes `voy`, incluso si desactivaron correos de recordatorios.
- Recuperar trabajos tras reinicios y comprobar restauración desde respaldo.

## 8. Definition of Ready / Done

- **Ready:** historia con valor claro, criterios verificables, dependencias y reglas identificadas; supuestos críticos resueltos antes de implementarla.
- **Done:** criterios cumplidos, pruebas automatizadas pertinentes, autorización revisada, errores tratados, accesibilidad básica verificada y documentación/migraciones actualizadas.

## 9. Pendientes de especificación (no ampliar alcance sin decisión)

- **No aprobado todavía:** eliminación de pendientes; definir explícitamente si se permite y cómo afecta historial/recurrencias.
- Detallar fecha de fin o indefinición de recurrencia y semántica de excepciones futuras al editar una serie.
- Definir zona horaria por usuario/plan, comportamiento de anticipaciones personalizadas y vencimiento/reintento de correos.
- Precisar lectura pública de campos del plan, comportamiento de participantes con `no voy` y estados de cancelación.
- Establecer datasets, concurrencia y entorno de medición para RNF de rendimiento/puntualidad.

**Siguiente entregable:** modelo de dominio y MER detallado; después, especificaciones SDD por historia. Este documento es la línea base del MVP, no el diseño de tablas ni contratos API.
