# Proyecto: Sh2do

## Objetivo general
Construir una aplicación SaaS de organización personal o planes compartidos, para personas o grupos de amigos que quieran crear recordatorios o planes

## Reglas
- Antes de cualquier tarea, lee `constitution.md`. Contiene las reglas innegociables, de cumplimiento obligatorio
- La aplicación se levanta y opera en **docker** mediante los scripts de powershell `/scripts/up.ps1` y `/scripts/down.ps1`
- Cada implementación de feature no debe salirse del alcance, a menos que sea necesario. Indicarlo primero
- No instales dependencias sin avisarme primero
- Los agentes backend y frontend usan la skill `ponytail`

## Documentación
- `/docs/product.md`: **Qué construimos** y para quien. Es la principal fuente de la verdad y **no debe modificarse**
- `/docs/constitution.md`: Reglas innegociables para agentes y desarrolladores
- `/docs/sh2do-model.json`: Modelo de datos en formato JSON
- `/docs/product-backlog.md`: Product backlog original. Se usa solo como punto de partida para construir `product.md`. Los `###` de Jira deben coincidir con los de `product.md`, no con los de `product-backlog.md`
- `/features/STD-###-[nombre-feature]/plan.md`: Plan de implementación construido a partir de una task `STD-###` que contiene la spec. `###` es el número del issue de Jira
- `/features/STD-###-[nombre-feature]/task.md`: Lista de tareas derivadas del plan
- `/features/STD-###-[nombre-feature]/contracts/openapi.yaml`: Acuerdo entre el servicio y quien lo consume

## Jerarquia de conflicto
1. `/docs/product.md`: **qué** construimos.
2. `/docs/constitution.md`: reglas técnicas innegociables.
3. `STD-###`: especificación detallada de la feature en Jira. **Qué** construimos, enfocado en la feature.
4. `/features/STD-###-[nombre-feature]/plan.md`: **cómo** lo construimos. 

## Jira
- Sitio `michael-hoyos-94.atlassian.net`, proyecto **Sht2do**. Épicas con issues de tipo "Feature" como funcionalidad.
- Estados: **`To do`** → **`Working`** → **`Done`** o **`Returned`**.

## Flujo de trabajo (Spec driven development)
1. Lee la tarea `STD-###` en Jira. Esta es la spec de la feature: el qué construimos. Si no existe, créala; si es necesario, refínala para reducir ambigüedad o cabos sueltos. Mueve `STD-###` a **Working**.
2. Crea el plan de implementación `/features/STD-###-[nombre-feature]/plan.md`, las tareas `/features/STD-###-[nombre-feature]/task.md` y el contrato OpenAPI `/features/STD-###-[nombre-feature]/contracts/openapi.yaml`.
3. Aguarda mi revisión y aprobación del plan de implementación.
4. Delega el trabajo en paralelo a los agentes de implementación `backend-implementer` y `frontend-implementer` (`.claude/agents/`).
5. Lanza el agente `qa-reviewer` para la revisión.
6. Espera mi validación de las pruebas manuales.
7. Con mi aprobación, mueve la tarea `STD-###` a **Done** en Jira si todo está bien, o a **Returned**.
8. Crea una pull request con los cambios para integrarlos a la rama `main`.

## Formato de salida
- Describe brevemente lo que hiciste
- Lista los archivos modificados
- ¿Como puedo probar tu trabajo?