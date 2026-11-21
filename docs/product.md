# Sh2do — Producto MVP v1.0

> **Fuente:** `docs/product-backlog.md` (línea base de Product Discovery, 20-11-2026), con las decisiones de producto tomadas el 20-11-2026.
> **Rol de este documento:** es la principal fuente de la verdad sobre **qué** se construye y **para quién**. No debe modificarse sin decisión explícita del responsable de producto.
> **Numeración:** las features se identifican con su clave de Jira `STD-###` (proyecto Sht2do). El identificador del backlog (`US-###`) se conserva solo como trazabilidad.

---

## 1. Visión

Sh2do es una aplicación web para **anotar pendientes, recibir recordatorios y coordinar planes informales** con amigos, sin la complejidad de una herramienta empresarial.

- **Objetivo del MVP:** lanzamiento público, dimensionado inicialmente para **hasta 100 usuarios activos mensuales**.
- **Plataforma:** aplicación web responsive (escritorio y móvil desde el navegador).

## 2. Usuarios

| Perfil | Necesidad |
|---|---|
| **Persona organizada** | Registrar sus pendientes (puntuales o recurrentes), priorizarlos, etiquetarlos y recibir avisos a tiempo. |
| **Organizador de un plan** | Crear un plan (una salida, una reunión), compartirlo con un enlace y saber quién va. |
| **Invitado** | Abrir el enlace de un plan, ver lo básico sin cuenta y, con cuenta verificada, confirmar si va o no; recibir avisos si el plan cambia. |

## 3. Alcance del MVP

### 3.1 Incluido

- **Cuentas:** registro con correo y contraseña, verificación del correo, inicio y cierre de sesión, recuperación de contraseña.
- **Pendientes personales:** título obligatorio; fecha y hora opcionales; estados `pendiente / en progreso / completado`; prioridad `baja / media / alta`; etiquetas propias; filtros.
- **Recurrencias:** diarias, semanales o mensuales, con fecha de inicio obligatoria y fecha de fin opcional; cada ocurrencia es independiente; edición de `solo esta` o `esta y las futuras`.
- **Recordatorios:** hasta **3** por pendiente, ocurrencia o plan; anticipaciones predefinidas o personalizadas; notificación interna y correo.
- **Planes compartidos:** creación, edición y cancelación por el creador; enlace compartible y revocable; vista anónima básica; respuesta `voy / no voy`; recordatorios personales por asistente; avisos de cambios relevantes; `Mis planes` e historial.

### 3.2 Fuera del MVP

Google OAuth, app móvil nativa, notificaciones push, integración con WhatsApp u otra mensajería, chats o comentarios, votaciones, gastos compartidos, asignación de tareas a otras personas, planes recurrentes, adjuntos, sincronización de calendario, pagos y **eliminación de pendientes**.

## 4. Decisiones de producto

Resuelven los puntos abiertos de la sección 9 del backlog.

| # | Tema | Decisión |
|---|---|---|
| D-01 | Eliminación de pendientes | **No se permite** en el MVP. Un pendiente solo cambia de estado. Las etiquetas sí se pueden eliminar. |
| D-02 | Fin de una recurrencia | Fecha de inicio **obligatoria**; fecha de fin **opcional**. Sin fecha de fin, la serie es indefinida. La fecha de fin es exclusiva: el último día que se genera es el anterior a la fecha de fin. |
| D-03 | Recurrencia semanal | Se repite cada semana **el mismo día de la semana que la fecha de inicio**. |
| D-04 | Recurrencia mensual | Se repite el mismo día del mes que la fecha de inicio. Si ese día no existe (p. ej. 31 en abril), se usa el último día del mes, y se vuelve al día original en los meses que lo tienen. |
| D-05 | Fecha y hora de un pendiente | Ambas opcionales: sin fecha, con fecha sin hora, o con fecha y hora. **Los recordatorios solo se permiten si hay fecha y hora.** |
| D-06 | Zona horaria | Cada usuario tiene una zona horaria IANA, detectada del navegador al registrarse y editable en su perfil. Los pendientes usan la zona del usuario. Un plan guarda la zona del creador al crearlo, y cada persona lo ve convertido a su propia zona. |
| D-07 | Anticipaciones de recordatorio | Opciones predefinidas: **15 min, 1 hora y 1 día** antes. Opción personalizada en minutos, horas o días, desde 0 (a la hora exacta) hasta **30 días**. No se programa un recordatorio cuyo instante ya pasó. |
| D-08 | Vista anónima de un plan | Con un enlace vigente y **sin sesión**, se ve solo lo básico: **título, fecha y hora, ubicación y estado** (activo, cancelado o finalizado). La descripción y las notas solo se ven con sesión iniciada. Nunca se exponen los datos de los asistentes. |
| D-09 | Respuesta `no voy` | Quien responde `no voy` **no obtiene acceso privilegiado**: el plan no aparece en sus `Mis planes`, no recibe avisos de cambios y no tiene recordatorios; si tenía recordatorios programados, se cancelan. Puede cambiar a `voy` mientras tenga un enlace vigente y no haya llegado la hora del plan. |
| D-10 | Creador del plan | Al crear un plan, el creador queda automáticamente como participante `voy` y puede configurar sus recordatorios. No puede responder `no voy`: para no asistir, cancela el plan. |
| D-11 | Plan después de su hora de inicio | Cuando llega la fecha y hora del plan, pasa al **historial** y queda de **solo lectura**: no admite ediciones, cancelación ni respuestas. |
| D-12 | Fallos de envío de correo | Hasta **3 reintentos** con espera exponencial. Un correo de recordatorio no se envía si han pasado más de **2 horas** desde su hora prevista (aviso obsoleto). Todo fallo se registra. La notificación interna se crea siempre, falle o no el correo. |
| D-13 | Enablers técnicos (EN-001 a EN-006) | No son features de producto. Sus criterios de cierre se trasladan a `docs/constitution.md` y se resuelven dentro de la primera feature que los necesite. |

## 5. Reglas de negocio

### 5.1 Propiedad y permisos
- **RN-PRO-1:** los pendientes, las etiquetas, los recordatorios y las notificaciones son **privados** de su dueño. Ningún otro usuario puede verlos ni modificarlos.
- **RN-PRO-2:** solo el **creador** de un plan puede editarlo, cancelarlo, y revocar o regenerar su enlace.
- **RN-PRO-3:** confirmar o rechazar asistencia requiere **sesión iniciada con correo verificado**.
- **RN-PRO-4:** la autorización siempre se valida en el servidor.

### 5.2 Pendientes
- **RN-PEN-1:** el título es obligatorio; la descripción, la fecha y la hora son opcionales.
- **RN-PEN-2:** un pendiente nuevo empieza en estado `pendiente`; puede pasar libremente entre `pendiente`, `en progreso` y `completado`.
- **RN-PEN-3:** la prioridad por defecto es `media`.
- **RN-PEN-4:** un pendiente completado no emite recordatorios futuros.
- **RN-PEN-5:** las etiquetas son por usuario y no se repiten. La comparación ignora mayúsculas y espacios sobrantes. Eliminar una etiqueta la quita de los pendientes, pero no borra los pendientes.

### 5.3 Recurrencias
- **RN-REC-1:** frecuencia diaria, semanal o mensual, según D-02, D-03 y D-04.
- **RN-REC-2:** cada ocurrencia tiene su propio estado, fecha y hora. Completar una no completa las demás.
- **RN-REC-3:** `solo esta` modifica únicamente esa ocurrencia.
- **RN-REC-4:** `esta y las futuras` aplica los cambios desde esa ocurrencia en adelante. Las ocurrencias pasadas y su historial no se alteran, y los recordatorios pendientes se recalculan.

### 5.4 Recordatorios y notificaciones
- **RN-REM-1:** máximo **3** recordatorios por pendiente simple, por serie recurrente (plantilla para todas sus ocurrencias), por ocurrencia concreta (sustituye a la plantilla) y por asistente de un plan.
- **RN-REM-2:** un recordatorio necesita un instante calculable (fecha y hora). Si la fecha o la hora cambian, se recalcula.
- **RN-REM-3:** no se emiten recordatorios obsoletos, de ocurrencias completadas, de planes cancelados o finalizados, ni de asistentes que ya no tienen `voy`.
- **RN-REM-4:** cada aviso se emite **una sola vez**, sin duplicados lógicos, aunque haya reintentos o reinicios.
- **RN-REM-5:** cada recordatorio genera una **notificación interna persistente** y, si el usuario tiene activos los correos de recordatorio, un correo.
- **RN-REM-6:** el usuario puede desactivar los **correos de recordatorio**. Esa preferencia **no** desactiva las notificaciones internas ni los correos importantes de planes (cambios y cancelación).

### 5.5 Planes
- **RN-PLA-1:** el título, la fecha y la hora son obligatorios; la ubicación, la descripción y las notas son opcionales.
- **RN-PLA-2:** el plan se comparte con un **enlace con token aleatorio no predecible**. Un plan tiene un único enlace vigente a la vez.
- **RN-PLA-3:** con un enlace vigente se puede leer el plan según D-08. Con un enlace revocado, no.
- **RN-PLA-4:** cada usuario tiene **una sola respuesta vigente** (`voy` o `no voy`) por plan, y puede cambiarla antes de la hora del plan.
- **RN-PLA-5:** los asistentes con `voy` **conservan el acceso desde `Mis planes`** aunque se revoque o regenere el enlace.
- **RN-PLA-6:** un plan cancelado o finalizado no acepta respuestas.
- **RN-PLA-7:** solo los cambios reales de **fecha, hora o ubicación**, y la **cancelación**, notifican a los participantes. Los destinatarios son quienes tenían `voy` en el momento del cambio, excepto el autor del cambio. Se les avisa con una notificación interna y un correo, aunque tengan desactivados los correos de recordatorio.
- **RN-PLA-8:** el creador puede consultar quién respondió `voy` y quién respondió `no voy`.

## 6. Features del MVP

Orden recomendado de construcción. Prioridad: **Must** es esencial; **Should** está comprometido para el MVP, con menor criticidad.

### Épicas

| Jira | Épica |
|---|---|
| STD-1 | Cuentas y autenticación |
| STD-2 | Pendientes y organización |
| STD-3 | Recurrencias |
| STD-4 | Recordatorios y notificaciones |
| STD-5 | Planes compartidos |

### Incremento 1 — Pendientes personales completos

| Orden | Jira | Épica | Feature | Pri. | Criterios de aceptación esenciales | Depende de | Backlog |
|---|---|---|---|---|---|---|---|
| 01 | **STD-6** | STD-1 | Registro e inicio de sesión | Must | Registro con correo válido, contraseña y zona horaria; verificación del correo mediante enlace; inicio y cierre de sesión; las credenciales incorrectas no revelan si el correo existe; una cuenta sin verificar puede usar sus pendientes, pero no confirmar asistencia a planes. | — | US-001 |
| 02 | **STD-7** | STD-1 | Recuperar mi contraseña | Must | La solicitud siempre devuelve una respuesta genérica; enlace temporal de un solo uso; permite fijar una contraseña nueva; un enlace vencido o usado se rechaza. | STD-6 | US-016 |
| 03 | **STD-8** | STD-2 | Crear, editar y consultar un pendiente | Must | Título obligatorio; descripción, fecha y hora opcionales (D-05); estado inicial `pendiente`; solo se accede a los pendientes propios; no se pueden eliminar (D-01). | STD-6 | US-002 |
| 04 | **STD-9** | STD-2 | Cambiar el estado de mis pendientes | Must | Permite los tres estados y los persiste; al completar, se dejan de emitir los avisos futuros de esa ocurrencia. | STD-8 | US-003 |
| 05 | **STD-10** | STD-2 | Crear, editar y eliminar etiquetas propias | Should | Etiquetas por usuario; sin duplicados normalizados; eliminar una etiqueta no borra pendientes. | STD-6 | US-017 |
| 06 | **STD-11** | STD-2 | Asignar prioridades y etiquetas, y filtrar | Should | Prioridad baja, media o alta; filtros combinables por estado, prioridad y etiquetas; solo devuelve resultados propios. | STD-8, STD-9, STD-10 | US-005 |
| 07 | **STD-12** | STD-3 | Crear pendientes recurrentes | Must | Repetición diaria, semanal o mensual (D-03, D-04); inicio obligatorio, fin opcional (D-02); el día 31 se ajusta al último día del mes y vuelve al 31 cuando ese mes lo tiene. | STD-8 | US-004 |
| 08 | **STD-13** | STD-3 | Gestionar cada ocurrencia de una recurrencia | Must | Estado e historial propios por ocurrencia; completar una no completa las siguientes. | STD-9, STD-12 | US-018 |
| 09 | **STD-14** | STD-3 | Editar esta ocurrencia o esta y las futuras | Must | La edición puntual no altera otras ocurrencias; editar las futuras preserva el pasado y actualiza los avisos pendientes. | STD-12, STD-13 | US-019 |
| 10 | **STD-15** | STD-4 | Configurar mis recordatorios | Must | Máximo 3 por pendiente, serie u ocurrencia; anticipaciones según D-07; requiere fecha y hora válidas; se recalcula ante cambios. | STD-8 | US-006 |
| 11 | **STD-16** | STD-4 | Recibir avisos internos y por correo | Must | Se procesa a su hora; notificación interna persistente; correo según la preferencia; no se envían avisos obsoletos ni duplicados lógicos; reintentos según D-12. | STD-15 | US-007 |
| 12 | **STD-17** | STD-4 | Configurar correos de recordatorios | Should | Preferencia persistida y activa por defecto; desactivarla mantiene las notificaciones internas y los correos importantes de planes. | STD-6, STD-16 | US-014 |
| 13 | **STD-18** | STD-4 | Consultar y marcar notificaciones como leídas | Must | Bandeja ordenada de la más reciente a la más antigua; estados leído y no leído; conteo de no leídas; marcar una o todas como leídas; acceso solo a los avisos propios. | STD-6, STD-16 | US-015 |

### Incremento 2 — Planes compartidos completos

| Orden | Jira | Épica | Feature | Pri. | Criterios de aceptación esenciales | Depende de | Backlog |
|---|---|---|---|---|---|---|---|
| 14 | **STD-19** | STD-5 | Crear, editar y cancelar un plan | Must | Título, fecha y hora obligatorios; ubicación, descripción y notas opcionales; el plan guarda la zona horaria del creador (D-06); el creador queda como `voy` (D-10); solo el creador modifica o cancela; un plan cancelado no recibe respuestas; un plan pasado es de solo lectura (D-11). | STD-6 | US-008 |
| 15 | **STD-20** | STD-5 | Compartir un plan mediante enlace | Must | Enlace único y copiable; token no predecible; sin integración con mensajería. | STD-19 | US-009 |
| 16 | **STD-21** | STD-5 | Ver un plan desde el enlace sin cuenta | Must | Un enlace vigente muestra solo los datos básicos (D-08); no permite responder sin cuenta verificada; no expone datos de los asistentes; un enlace revocado o inexistente muestra que no está disponible. | STD-20 | US-022 |
| 17 | **STD-22** | STD-5 | Confirmar o rechazar asistencia | Must | Solo con sesión y correo verificado; `voy` o `no voy`, con una respuesta vigente; se puede cambiar antes de la hora del plan; `no voy` según D-09; el creador consulta las respuestas. | STD-6, STD-20, STD-21 | US-010 |
| 18 | **STD-23** | STD-5 | Consultar Mis planes | Must | Incluye los planes propios y aquellos con `voy`; los asistentes confirmados siguen accediendo si se revoca el enlace; autorización por usuario. | STD-19, STD-22 | US-020 |
| 19 | **STD-24** | STD-5 | Revocar y regenerar enlaces | Must | Solo el creador; el enlace anterior deja de funcionar de inmediato; el nuevo token es distinto; no se pierden las respuestas ni el acceso desde `Mis planes`. | STD-20, STD-22, STD-23 | US-013 |
| 20 | **STD-25** | STD-4 | Programar recordatorios propios para planes | Must | Hasta 3 por participante `voy`, creador incluido; independientes entre usuarios; se recalculan si cambia la fecha u hora del plan; se cancelan si el usuario pasa a `no voy` o si el plan se cancela o finaliza. | STD-15, STD-16, STD-22 | US-011 |
| 21 | **STD-26** | STD-4 | Recibir avisos de cambios o cancelación | Must | Solo cambios reales de fecha, hora o ubicación, y la cancelación; destinatarios con `voy` en el momento del evento; notificación interna y correo, aunque se hayan desactivado los correos de recordatorio. | STD-16, STD-19, STD-22 | US-012 |
| 22 | **STD-27** | STD-5 | Consultar el historial de planes | Must | Planes pasados y cancelados, consultables por el creador y por quienes tenían `voy`; no admiten confirmaciones después de la hora prevista. | STD-19, STD-22, STD-23 | US-021 |

### Incremento 3 — Preparación del lanzamiento

No es una feature de producto. Es una condición para salir a producción:
- Pruebas unitarias y de integración de los flujos críticos, incluidos los controles de autorización y el acceso anónimo. Sin pruebas E2E automatizadas: los flujos completos se validan con pruebas manuales.
- Recuperación ante fallos del worker o de la cola, y respaldo y restauración de la base de datos probados.
- Revisión de accesibilidad, diseño responsive y objetivos de rendimiento.
- Publicación con HTTPS, observabilidad y configuración segura del correo y de los secretos.

## 7. Requisitos no funcionales

| Área | Objetivo |
|---|---|
| Seguridad | Contraseñas con hash robusto (Argon2id); autorización en el servidor; tokens aleatorios guardados como hash; límite de intentos ante abuso (inicio de sesión, recuperación de contraseña, registro). |
| Rendimiento | **p95 < 500 ms** en las operaciones habituales de la API, bajo una prueba de carga definida y sin contar la latencia de terceros. |
| Puntualidad | **95 % de los recordatorios procesados en ≤ 60 s** desde su hora programada, en operación normal. |
| Confiabilidad | Reintentos, idempotencia lógica, reconciliación de trabajos tras fallos y registro de errores. |
| Fechas | Instantes guardados en UTC junto con su zona horaria IANA; pruebas de fin de mes y de cambio de horario. |
| UX y accesibilidad | Web responsive; navegación por teclado; objetivo WCAG 2.2 AA en los flujos principales. Interfaz en español. |
| Operación | Logs, backups y restauración de la base de datos probada; despliegue con HTTPS; pruebas automatizadas de las rutas críticas. |

*Las métricas son objetivos de aceptación técnica, no SLA comprometidos.*

## 8. Pruebas de producto imprescindibles

- Pendiente sin fecha; filtros y autorización por propietario.
- Recurrencia mensual desde el **31/01**, y vuelta al día 31 en los meses posteriores que lo tienen.
- Recurrencia con fecha de fin: no se genera ninguna ocurrencia en la fecha de fin ni después.
- Completar solo una ocurrencia; editar `esta` frente a `esta y las futuras` sin modificar el historial.
- Cambiar la fecha u hora con recordatorios programados; bloquear los avisos obsoletos y los duplicados lógicos.
- Rechazar la confirmación sin correo verificado o después del inicio del plan.
- Vista anónima: solo título, fecha y hora, ubicación y estado.
- Revocar el enlace: la lectura anónima se deniega y el asistente con `voy` conserva el acceso en `Mis planes`.
- `no voy`: el plan no aparece en `Mis planes`, no llegan avisos y se cancelan los recordatorios previos.
- Notificar solo los cambios relevantes a los participantes `voy`, aunque hayan desactivado los correos de recordatorio.
- Recuperar los trabajos tras reinicios y comprobar la restauración desde un respaldo.

## 9. Definition of Ready / Done

- **Ready:** la feature tiene valor claro, criterios verificables, dependencias y reglas identificadas, y sus supuestos críticos están resueltos en su issue `STD-###`.
- **Done:** se cumplen los criterios, hay pruebas automatizadas pertinentes, la autorización está revisada, los errores están tratados, la accesibilidad básica está verificada y la documentación y las migraciones están actualizadas.

## 10. Glosario

| Término | Significado |
|---|---|
| Pendiente | Algo que el usuario quiere hacer o recordar. Puede ser simple o recurrente. |
| Ocurrencia | Cada instancia concreta de un pendiente. Un pendiente simple tiene una; uno recurrente, una por repetición. |
| Serie | Conjunto de ocurrencias generadas por una regla de recurrencia. |
| Recordatorio | Aviso programado con cierta anticipación respecto a la fecha y hora de una ocurrencia o de un plan. |
| Notificación | Aviso persistente en la bandeja interna del usuario (recordatorio, cambio o cancelación de un plan). |
| Plan | Evento informal con fecha y hora, creado por un usuario y compartido mediante un enlace. |
| Participante | Usuario con una respuesta `voy` o `no voy` a un plan. El creador es participante `voy` automáticamente. |
| Mis planes | Lista de planes propios y de planes con respuesta `voy`. |
| Historial | Planes cuya hora ya pasó o que fueron cancelados. |
