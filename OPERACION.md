# OPERACION.md — Marco de operación autónoma en Seedbox

> **El marco genérico y canónico está en `MARCO.md` de fguzman01/operador** (v1.1). Este archivo es la
> **instancia de Seedbox**: sus agentes, su horario, qué pasa solo y qué pide ✅. Si algo difiere,
> manda `MARCO.md`. Primer proyecto que entra al marco con el operador central: no copia workflows ni
> código de tarjetas; el operador las manda por este repo (`central:` en `.operador.yml`).

**Estado (2026-11-09): fase 1 en marcha** (§8). El análisis diario ya corre solo (skill
`seedbox-analyst`, 08:23); lo que todavía no avanza solo es **el desarrollo del propio radar**: hasta
ahora cada historia necesitaba una sesión de Felipe.

## 1. Qué cambia

| Antes | Ahora |
|---|---|
| Las historias pendientes viven en `docs/backlog.md`, escritas a mano | Cada tarea es un **GitHub Issue**; su estado son sus etiquetas. `docs/backlog.md` queda como historia de lo hecho (H1–H18) |
| Los agentes se invocan en una sesión | Corren como **rutinas** de Claude Code (§5) |
| Felipe revisa todo en GitHub | Decide desde el grupo de Telegram «Seedbox · Operación» con ✅ / ❌; escribe pedidos en texto libre |

La numeración de historias sigue: el título de cada issue empieza con su número (`H19 …`), así los ADRs
y el historial siguen citándose igual.

## 2. Ciclo de una tarea [marco]

```
propuesta ──✅──► aprobada ──► diseñada ──✅──► en-curso ──► en-revision ──✅──► hecha
    └──❌──► descartada         └──❌──► aprobada (rehacer)      └──❌──► (PR cerrado)
       cualquiera ──► requiere-sesion (se conversa) · en-espera (bloqueada por algo externo)
```

`en-espera` es propio de Seedbox: una fuente que espera aprobación (Reddit, H15) no es trabajo que se
pueda tomar ni algo que Felipe deba decidir. Se revisa en el PO semanal.

## 3. Roles

| Rol (marco) | Agente de Seedbox | Qué hace | Sale con |
|---|---|---|---|
| Analista / PO | `product-owner` | Junta mejoras (estado del radar, evaluaciones, comentarios, ADRs con condiciones abiertas) y abre issues `propuesta` como historias con criterios de aceptación; los domingos empieza con la auditoría de salud del radar (H21) | Issues + tarjetas ✅/❌ |
| Diseñador (+ pedidos) | `architect` | Para cada issue `aprobada`: plan corto en el issue; ADR si hay una decisión técnica nueva; responde preguntas; deriva lo delicado | `estado:diseñada` + tarjeta |
| Desarrollador | `developer` | UNA tarea `en-curso` por corrida: código + tests, PR con `Closes #N` | PR + `estado:en-revision` |
| Revisor (contexto limpio) | `qa-tester` | Lo invoca el desarrollador: verifica cada criterio de aceptación y el plan, busca casos borde. No es quien escribió | `ok` / `cambios` en el PR |
| Tester | CI (`ci.yml`) | lint, typecheck, tests con Postgres | estado del PR |
| Liberador y cronista | el **operador** | Tarjeta del PR cuando todos los checks pasan; cierre del día a las 21:00 | tarjeta / mensaje |

**Rol propio:** el **analista** (`seedbox-analyst`, ya existe) procesa los datos del radar a diario. No
toca código ni issues; su resultado se ve en el sitio (`/activity`). El PO usa su estado como fuente.

**Rol propio:** el **evaluador** (`seedbox-evaluator`, H19, ADR-0013) toma cada semana las mejores
oportunidades evaluadas y abre una ficha de viabilidad como issue `tipo:oportunidad` + `estado:propuesta`
(✅ = explorarla como proyecto aparte). No toca código; el architect, el developer y el PO ignoran esos issues.
El evaluador tiene memoria (H20): lee cuáles fichas aprobó o descartó Felipe, las resume en
`docs/preferencias.md` (por PR, con ✅), no repite lo descartado sin evidencia nueva y sólo *propone*
ajustes de pesos por issue.

**Rol propio:** el **explorador de fuentes** (`source-scout`, H24, `docs/fuentes.md`) investiga cada
semana fuentes nuevas de público masivo y no técnico, mantiene el catálogo y propone como mucho 1 fuente
como issue `estado:propuesta` (historia lista para el `architect`). No escribe adaptadores, no acepta
términos, no paga ni crea cuentas (`requiere-sesion`). Necesita el entorno con internet completo del
evaluador. El architect, el developer y el PO no tocan el catálogo.

## 4. Qué pasa solo y qué pide ✅

Railway despliega `main` directo a producción: **todo merge es un despliegue**. Por eso, por ahora,
todo PR pide ✅ (no hay auto-merge).

| Pasa solo | Pide ✅ de Felipe | Nunca por este canal (`requiere-sesion`) |
|---|---|---|
| Abrir issues `propuesta`, escribir planes, responder preguntas, el análisis diario | Todo PR: código, docs, ADRs, migraciones (`drizzle/`), reglas de análisis (`EXTRACTION_RULES`, clustering, scoring), workflows | Gastar dinero (APIs de pago, planes nuevos); aceptar términos de una fuente (Reddit, Stack Exchange, tiendas de apps); borrar o reescribir datos de producción; secretos y variables de Railway |

## 5. Horario y presupuesto [cuenta completa]

Las rutinas de los tres proyectos comparten el mismo plan de Claude: ventanas de 5 horas que abre la
primera sesión, más un tope semanal. Ocupación al 2026-11-09 (hora de Chile; detalle en el
`OPERACION.md` de la factory, §7):

| Ventana (aprox.) | Qué corre | Carga |
|---|---|---|
| 20:00–01:00 | btc-signal-web: QA 20:00, informe 22:00, desarrollador 00:00; factory: diseñador 19:45 | alta |
| **01:00–03:30** | — | **libre** |
| 03:37–08:37 | factory: investigador, diseñador 04:45, desarrollador 05:15; **Seedbox: analista 08:23** | media |
| 09:00–14:00 | btc-signal-web: desarrollador 09:00; sesiones de Felipe | media |

**Confirmado por Felipe (2026-11-09):** el ciclo de Seedbox en la ventana libre de la madrugada, en
sonnet y con lotes chicos. Las tarjetas lo esperan en la mañana; el desarrollador implementa lo que
Felipe aprobó el día anterior.

| Hora (Chile) | Rol | Corre sólo si |
|---|---|---|
| 01:13 diario | Diseñador + pedidos (`architect`) | hay un issue `aprobada` sin plan |
| 01:47 lun–vie | Desarrollador + revisor (`developer`, `qa-tester`) | hay un issue `en-curso` y nada en `en-revision` |
| 01:13 domingo | PO (`product-owner`), antes del diseñador; empieza con la auditoría semanal del radar (H21) | — |
| 03:00 domingo | Evaluador (`seedbox-evaluator`, sonnet, búsqueda web) | hay oportunidades evaluadas sin ficha |
| 02:00 domingo | Explorador de fuentes (`source-scout`, sonnet, búsqueda web; entorno del evaluador) | — |
| 08:23 diario | Analista (ya existe) | — |
| 21:00 | Cierre (el operador, sin tokens) | hubo movimiento o hay decisiones pendientes |

- **Una tarea de desarrollo por día**, como en la factory.
- La sesión de las 01:13 abre una ventana hasta las 06:13 que comparte con la factory: a revisar después
  de una semana en la página de uso de Claude. Si aprieta, el diseñador corre día por medio.

## 6. Reglas de los agentes en el marco

- **Las tareas son GitHub Issues** con las etiquetas de `.operador.yml`. Ningún agente pone
  `estado:aprobada` ni `hecha`, ni cierra un issue que no resolvió: eso es de Felipe o del PR.
- **Una tarea a la vez, sólo S o M.** Lo L se parte en issues S/M.
- **Mensajes a Felipe:** un comentario que empieza con `<!-- telegram -->` le llega al grupo. Se usa
  para respuestas y para lo que necesita su decisión; no para avisos de rutina.
- Lo del §4 que «nunca» va por el canal se marca `estado:requiere-sesion` con un comentario
  `<!-- telegram -->` que explique por qué.
- Siguen valiendo las reglas de `CLAUDE.md`: idioma, ADRs, evidencia trazable, sin secretos.

## 7. Prueba de punta a punta (hecho cuando)

Un pedido por el grupo → issue `tipo:pedido` → plan del diseñador → ✅ → PR del desarrollador con la
revisión de QA → CI verde → tarjeta → ✅ → `estado:hecha`, sin abrir una sesión.

## 8. Plan de implementación

| Fase | Qué | Hecho cuando |
|---|---|---|
| 1 | `.operador.yml`, este archivo, agentes adaptados a issues, `CLAUDE.md` al día | Fusionado en `main` |
| 2 | Puesta en marcha (Felipe): rama por defecto `main`; grupo «Seedbox · Operación» con el bot; `REPOS` += `fguzman01/Seedbox` y el token del operador con acceso; `POST /etiquetas`; `telegram.grupo`; webhook de GitHub hacia el operador | `/salud` del operador lista Seedbox en `tarjetas` y `cierre` |
| 3 | Migrar lo pendiente a issues: H18 (`aprobada`), H15 (`en-espera`), activación de Stack Exchange (C1–C3 de ADR-0010) | Los pendientes de `docs/backlog.md` son issues |
| 4 | Rutinas del §5 creadas, con el repo en su entorno | La prueba del §7 pasa |

## 9. Decisiones

- **2026-11-09:** Seedbox es el primer proyecto con el operador central (decisión de Felipe):
  lo común (tarjetas, cierre, etiquetas) lo hace el operador, no workflows copiados.
