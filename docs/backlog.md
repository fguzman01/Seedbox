# Backlog

Ordenado por prioridad. Mantenido por el agente `product-owner`.

## Fase 0: Fundaciones

- [x] Documento de visión (`docs/VISION.md`)
- [x] Metodología y agentes (`CLAUDE.md`, `.claude/agents/`)
- [x] ADR-0001: stack tecnológico (`docs/adr/0001-stack-tecnologico.md`)
- [x] ADR-0002: fuentes como adaptadores y dominios (`docs/adr/0002-fuentes-y-dominios.md`)
- [x] Esqueleto del proyecto con lint, typecheck, tests y CI.

## Fase 1: Radar personal

### H1. Ingestar posts de Hacker News · M · ✅ hecha
**Como** usuario **quiero** que el sistema recolecte periódicamente posts y comentarios de
Hacker News **para** tener materia prima donde buscar dolores.

Criterios de aceptación:
- Dado un job programado, cuando se ejecuta, entonces guarda posts nuevos sin duplicar los existentes.
- Cada registro guarda fuente, URL, autor, fecha y texto.

Notas: se usan los posts "Ask HN" vía la API de Algolia. Los comentarios quedan para una
historia futura si los posts no bastan.

### H2. Extraer dolores con IA · M · ✅ hecha
**Como** usuario **quiero** que cada post se analice para extraer dolores concretos **para**
no tener que leerlos todos.

Criterios de aceptación:
- Cada dolor extraído tiene: descripción, quién lo sufre, cita textual, link al post y
  **vertical** (pymes, salud, educación, devtools, etc.; ver ADR-0002).
- Los posts sin dolor se marcan como descartados y no se reprocesan.

Notas: ver `docs/adr/0003-extraccion-de-dolores.md`. Además de lo pedido, cada dolor guarda
intensidad y disposición a pagar (insumos para H4), y se descartan los dolores cuya cita no
aparece en el post.

### H3. Agrupar dolores en oportunidades · M · ✅ hecha
**Como** usuario **quiero** ver dolores similares agrupados **para** medir cuánta gente
comparte el mismo problema.

Criterios de aceptación:
- Dado un conjunto de dolores sin agrupar, cuando corre el agrupamiento, entonces cada dolor
  queda asignado a exactamente una oportunidad (existente o nueva).
- Cada oportunidad tiene un título y un resumen en español que describen el problema común.
- Los dolores ya agrupados no se reprocesan; los nuevos se suman a oportunidades existentes
  cuando describen el mismo problema.
- Si la IA devuelve una asignación inválida (dolor desconocido, oportunidad inexistente),
  ese dolor queda sin agrupar para el siguiente intento, sin romper el resto.
- Cada oportunidad muestra cuántos dolores, posts y autores distintos la respaldan, y su
  detalle lista todos los dolores con su cita y link a la fuente.

Notas: ver `docs/adr/0004-agrupacion-de-dolores.md`. Medir la calidad del agrupamiento queda
para una historia posterior, cuando haya datos reales.

### H4. Puntuar oportunidades · M · ✅ hecha
**Como** usuario **quiero** un puntaje por oportunidad según los ejes de la visión, con
pesos ajustables, **para** priorizar qué explorar.

Criterios de aceptación:
- Cada oportunidad tiene un puntaje 0–10 en los cinco ejes de la visión y un puntaje total
  ponderado.
- Frecuencia, intensidad y disposición a pagar se calculan de la evidencia (autores distintos y
  dolores), sin llamar a la IA.
- Competencia y ajuste al constructor los evalúa la IA con búsqueda web; cada evaluación guarda
  su justificación y los competidores encontrados con su link.
- Mientras una oportunidad no está evaluada, su total usa sólo los ejes disponibles y se marca
  como parcial.
- Los pesos se pueden ajustar en la interfaz; las oportunidades se reordenan por el total.
- El detalle de una oportunidad muestra el desglose por eje, las justificaciones y los
  competidores.

Notas: ver `docs/adr/0005-puntaje-de-oportunidades.md`. Era tamaño S; pasó a M al sumar la
evaluación con búsqueda web.

### H5. Tablero de oportunidades · M · ✅ hecha
**Como** usuario **quiero** un tablero visual con cards ordenadas por puntaje, filtros (por
vertical, entre otros) y la evidencia de cada una **para** explorar y decidir rápido.

Criterios de aceptación:
- La página inicial es el tablero: todas las oportunidades en cards, ordenadas por puntaje
  total, con "ver más" cuando hay muchas.
- Filtros combinables: vertical (varias a la vez, con la cantidad de oportunidades de cada
  una), puntaje mínimo, sólo evaluadas, sólo con señales de pago y búsqueda por texto.
- Orden alternativo: más evidencia (autores distintos) o actividad más reciente.
- Filtros, orden y pesos viven en la URL: se pueden guardar y compartir, y se mantienen al
  entrar y volver del detalle.
- Cada card muestra puntaje, ejes (con nombre al pasar el mouse), conteos de evidencia y una
  cita representativa con link a su fuente.
- Si ningún resultado cumple los filtros, se indica y se ofrece limpiarlos.
- La actividad reciente (dolores y señales) pasa a su propia página.

### H6. Ingestar Reddit · M · ✅ hecha
**Como** usuario **quiero** que el sistema recolecte posts de una lista configurable de
subreddits **para** tener más gente contando sus problemas, no sólo la audiencia de Hacker News.

Criterios de aceptación:
- Usa la API oficial de Reddit con OAuth (credenciales en variables de entorno, nunca en el código).
- Dado un job programado, cuando se ejecuta, entonces guarda los posts nuevos de cada subreddit
  configurado sin duplicar los existentes, igual que H1.
- Descarta lo que no sirve como señal: posts fijados, eliminados, sólo con link, para adultos o
  del bot moderador.
- Cada señal guarda el subreddit, el puntaje y la cantidad de comentarios.
- Si Reddit no está configurado o falla, las demás fuentes se ingieren igual y el error se
  informa claramente.

Notas: ver `docs/adr/0006-fuente-reddit.md`, en especial las condiciones de uso antes de
monetizar.

### H7. Guardar y anotar oportunidades · M · ✅ hecha
**Como** usuario **quiero** marcar oportunidades como favoritas y agregar notas **para**
llevar seguimiento de las que me interesan.

Criterios de aceptación:
- Puedo marcar y desmarcar una oportunidad como favorita desde el tablero y desde su detalle;
  el cambio se ve al instante.
- El tablero tiene un filtro "Sólo favoritas" y un acceso directo en la navegación.
- En el detalle puedo agregar notas (con fecha) y borrarlas; se muestran de la más nueva a la
  más antigua. Las cards indican cuántas notas tiene cada oportunidad.
- Las notas y favoritas sobreviven a nuevas corridas de agrupamiento y evaluación.
- Nadie sin credenciales puede modificar datos en un despliegue público (ver ADR-0007).

Notas: pasó de S a M al sumar la protección de acceso, necesaria porque es la primera
funcionalidad que escribe datos desde la web.

## Fase 1b: operar sin costos extra de IA

### H9. Analista con Claude Code · M · ✅ hecha
**Como** usuario **quiero** que el análisis con IA lo haga Claude Code con mi suscripción
**para** no pagar saldo de la API además de lo que ya pago cada mes.

Criterios de aceptación:
- El sitio expone una API privada (con token) que entrega trabajo pendiente de extracción,
  agrupamiento y evaluación, y recibe los resultados.
- Los resultados pasan por exactamente la misma validación que el modo API (citas verificadas,
  referencias válidas, competidores con link); reenviar resultados no duplica datos.
- Un skill del repo describe el procedimiento diario y los formatos, usando las mismas reglas de
  análisis que el modo API.
- Railway sólo recolecta posts; el análisis no requiere `ANTHROPIC_API_KEY`.
- El modo API sigue disponible como alternativa.

Notas: ver `docs/adr/0008-analista-claude-code.md` y `docs/deploy.md`.

## Fase 1c: radar en operación diaria

Objetivo: que el radar funcione solo todos los días y que lo que muestra sea confiable. Sale de
la primera corrida real del analista (2026-11-04):

- La corrida fue manual. Procesó 60 de 500 posts pendientes (lotes de 30, 2 rondas); quedan 440,
  unas 8 corridas si no entrara nada nuevo. Como `ingest` suma posts cada día, la cola podría no
  vaciarse nunca.
- De 60 posts de Hacker News sólo 17 tenían dolores (18 dolores); 43 eran ruido (anuncios,
  opiniones, preguntas generales). Cerca del 70 % del análisis se gasta en descartar.
- Con el catálogo vacío, 18 dolores generaron 16 oportunidades, casi todas con un solo dolor:
  evidencia débil.
- La evaluación hace 5 oportunidades por corrida; quedan 11 sin evaluar.
- La validación funcionó (0 citas descartadas) y salió una oportunidad prometedora (cobros
  desbocados por API keys de IA filtradas; competencia 5, construibilidad 7).

Orden y por qué:

1. **H10** primero: sin corrida automática nada más avanza, y sin el balance entrada/salida no
   sabemos si la cola se vacía alguna vez.
2. **H14**: la primera corrida mostró 11 de 18 dolores en devtools y 60 de 60 posts de Hacker
   News. Antes de sumar fuentes para ampliar el público, medimos el sesgo por fuente; si no, no
   sabremos si el cambio sirvió.
3. **H11**: mientras la cola sea más grande que la capacidad diaria, el orden en que se reparte
   el trabajo decide qué ve el usuario. Además, sin reparto entre fuentes, los posts de Reddit
   esperarían detrás de los ~440 de Hacker News.
4. **H15**: responde al pedido de ver dolores de un público más amplio que los desarrolladores.
   Va después de H11 porque suma volumen; la aprobación de Reddit tarda semanas, así que el
   pedido se hace ya y el desarrollo llega a tiempo.
5. **H12**: protege el principio central. Con 16 oportunidades casi todas de un dolor, el
   tablero no debe hacer pasar una anécdota por una tendencia.
6. **H8** (reubicada desde la fase 1): pasa a ser requisito de H13. No se puede recortar ruido
   sin medir que no se pierden dolores reales. Conviene que el dataset ya incluya posts de Reddit.
7. **H13** al final: libera la mayor parte de la capacidad, pero sólo es seguro con la línea base
   de H8.

Actualización 2026-11-04: según fuentes secundarias, Reddit dejó de recibir pedidos de acceso
nuevos el 31-10-2026 (ver ADR-0009); Felipe lo confirma en la página oficial. Por eso **H16**
(Stack Exchange) sale de espera y va justo después de H11, en paralelo a H15: no necesita
aprobación previa. Si Reddit confirma el cierre, H15 se descarta y H16 la reemplaza. El
`architect` revisa primero los términos de la API de Stack Exchange y deja un ADR.

En espera, a propósito: ingestar comentarios de HN (más evidencia por oportunidad, pero suma
volumen a una cola que ya no damos abasto) y fusionar oportunidades duplicadas (esperar a que el
catálogo crezca y ver si el agrupamiento consolida solo). Las reseñas de tiendas de apps quedan para la fase 2: el `architect` debe confirmar antes
que el link a la ficha de la app cumple la regla de evidencia trazable. Se revisan después de H13.

### H10. Analista diario automático y su estado a la vista · S · ✅ hecha
**Como** usuario **quiero** que el analista corra solo cada día y que el sitio me muestre cómo
va la cola **para** no tener que acordarme de dispararlo y saber si el radar da abasto.

Criterios de aceptación:
- Dada la tarea programada de Claude Code configurada según `docs/deploy.md`, cuando pasan dos
  días sin que nadie intervenga, entonces hay dos corridas registradas con resultados en el sitio.
- El sitio muestra, por tipo de trabajo (extraer, agrupar, evaluar): cuántos ítems hay
  pendientes y la fecha de la última entrega del analista.
- El sitio muestra el balance de los últimos 7 días: posts ingresados contra posts procesados,
  y si a ese ritmo la cola crece o baja.
- Dado que pasaron más de 36 horas desde la última entrega del analista, cuando abro el sitio,
  entonces veo un aviso claro de que el análisis está detenido.
- La vista no expone el token del analista ni datos que no sean conteos y fechas.

Notas: crear la rutina es configuración (paso 5 de `docs/deploy.md`); el desarrollo es sólo la
vista de estado. Con el balance a la vista, el usuario decide si sube las rondas del skill o la
frecuencia; esa decisión depende de los límites de la suscripción y no la toma el sistema.

Implementación: cada entrega a `POST /api/agent/results` queda registrada (tipo, hora y conteos)
en la tabla `agent_deliveries`. El estado se ve en `/activity` ("Estado del analista") y el aviso
de análisis detenido también aparece en el tablero. "Procesado" = post con la extracción
terminada (con dolores o descartado) dentro de los últimos 7 días. El criterio de las dos
corridas se verifica en operación, después de desplegar la migración `0005_agent_deliveries`.

### H14. Ver de qué fuente y de qué público viene el radar · S · ✅ hecha
**Como** usuario **quiero** ver, por fuente (y por subreddit en Reddit), cuántos posts entran,
cuántos tienen dolores y en qué verticales caen **para** saber si el radar está sesgado hacia
desarrolladores y comprobar si una fuente nueva lo corrige.

Criterios de aceptación:
- Dada la vista de estado de H10, cuando la abro, entonces veo por fuente: posts ingresados,
  procesados, descartados y dolores extraídos en los últimos 30 días.
- Para cada fuente veo la distribución de dolores por vertical, con el porcentaje de
  "Herramientas para devs" destacado.
- En Reddit, los mismos conteos se pueden ver por subreddit.
- Dado un `ingest` en el que una fuente se omitió por falta de configuración, cuando veo la
  vista, entonces la fuente aparece como "no configurada" (no como "sin posts").
- La vista sólo muestra conteos y porcentajes; cada número lleva a la lista de posts o dolores
  correspondientes con su link a la fuente.

Notas: es la línea base para H15 y H16. Con la primera corrida debería mostrar 100 % Hacker
News y ~61 % devtools.

Implementación: `/activity` → "De dónde viene el radar" muestra, por fuente y en ventana móvil de
30 días, posts ingresados (por `fetched_at`), procesados (extracción terminada, con dolores o
descartados, por `processed_at`, igual que H10), descartados (sin dolores) y dolores extraídos
(por fecha de creación del dolor), más su reparto por vertical con el % de "Herramientas para
devs" destacado. En Reddit se agrega una tabla por subreddit (`metadata.subreddit`). Cada
`ingest` registra una fila por fuente en la tabla `ingest_runs` (estado `ok`/`skipped`/`error`,
conteos y fecha; migración `0006_ingest_runs`); si la última corrida omitió la fuente, se ve
"no configurada". Sin registro, la fuente se muestra neutra ("Sin ingestas registradas"). Cada
número abre la lista filtrada en `/activity?ver=posts|dolores&source=…&sub=…&vertical=…&estado=…&days=30`
(hasta 200 ítems, cada uno con su link a la fuente). Captura: `docs/screenshot-h14.png`.

### H11. Repartir primero el trabajo más prometedor · S · ✅ hecha
**Como** usuario **quiero** que el analista reciba primero los posts y oportunidades con más
señal **para** que la capacidad diaria, que es limitada, se gaste en lo que más probablemente
termine en una oportunidad útil.

Criterios de aceptación:
- Dados posts pendientes con distinta actividad, cuando el analista pide trabajo de extracción,
  entonces recibe primero los de más actividad (comentarios y puntos en la fuente) y, a igualdad,
  los más recientes.
- Dadas oportunidades sin evaluar, cuando el analista pide trabajo de evaluación, entonces
  recibe primero las de más autores distintos y, a igualdad, las de mayor puntaje parcial.
- Ningún ítem queda postergado para siempre: un post o una oportunidad que lleva más de N días
  pendiente entra al lote aunque tenga poca señal (N definido por el arquitecto).
- Dados posts pendientes de más de una fuente, cuando el analista pide trabajo de extracción,
  entonces el lote incluye posts de cada fuente con pendientes (ninguna fuente acapara el lote
  por tener más volumen o posts más antiguos), con la proporción documentada.
- El orden de reparto queda documentado en el skill y en `docs/deploy.md`.

Notas: requiere al `architect` para definir qué métricas de actividad hay por fuente (Reddit ya
guarda puntaje y comentarios; hay que confirmar Hacker News) y el valor de N. Las métricas de
actividad no son comparables entre fuentes (puntos de HN contra puntaje de Reddit) y, como Reddit
se lee de `/new`, al ingerir casi todo vale cero; el `architect` decide cómo normalizar o
refrescar.

Implementación (ADR-0009): `getPendingSignals` (analista y pipeline con la API) reparte el lote en
partes iguales entre las fuentes con pendientes, redistribuye lo que una fuente no usa e intercala
las fuentes; dentro de cada una, los posts con más de `SEEDBOX_MAX_PENDING_DAYS` (14) días desde
`fetched_at` ocupan hasta la mitad de su parte (redondeada hacia arriba) y el resto va por
comentarios (`numComments` o `answerCount`), puntos (`points` o `score`) y fecha. La evaluación
(`getDueOpportunities`) pone primero las nunca evaluadas con más de N días, luego autores
distintos y puntaje parcial (pesos por defecto), y al final las reevaluaciones. La ingesta sólo
guarda posts con `SEEDBOX_INGEST_MIN_AGE_HOURS` (24) horas de publicados y Reddit guarda hasta
`SEEDBOX_MAX_NEW_PER_FEED` (25) posts por subreddit y corrida, los de más comentarios. Sin
migración. Orden documentado en el skill y en `docs/deploy.md`.

### H15. Reddit activo con comunidades de público amplio · S · ⏸ en espera (Felipe revisa el acceso a Reddit)
**Como** usuario **quiero** que el radar lea a diario subreddits donde escriben dueños de pymes,
profesionales y personas comunes **para** encontrar dolores de un público más amplio que los
desarrolladores.

Criterios de aceptación:
- Dado el acceso a la Data API de Reddit aprobado y las variables `REDDIT_*` y
  `SEEDBOX_SUBREDDITS` configuradas en `ingest`, cuando corre la recolección diaria, entonces el
  log muestra, por subreddit, posts traídos e insertados, y no aparece `[reddit] skipped`.
- La lista de subreddits recomendada en `docs/deploy.md` excluye las comunidades de fundadores
  de software y de TI (SaaS, startups, sysadmin) y cubre al menos cinco verticales distintas de
  devtools; cada subreddit tiene una línea que dice qué público aporta.
- Hay un tope de posts nuevos por subreddit y por corrida, configurable y documentado, para que
  la primera ingesta no sume miles de posts a la cola.
- `docs/deploy.md` explica cómo pedir el acceso a Reddit (qué uso declarar, qué datos incluir) y
  qué hacer si lo rechazan.
- Dados 7 días con Reddit activo, cuando miro H14, entonces Reddit aporta posts procesados con
  dolores y el porcentaje de devtools sobre el total de dolores de esos días baja respecto de la
  línea base.

Notas: Felipe pide el acceso a Reddit en paralelo (decidido el 2026-11-04), porque tarda semanas:
según fuentes de terceros, desde noviembre de 2025 Reddit aprueba a mano cada app nueva. Antes,
confirmar en la página oficial que siguen recibiendo pedidos. Requiere al `architect`: ADR-0006
debe reflejar la aprobación previa y el uso declarado, y hay que definir el tope por subreddit.
Depende de H11 (reparto entre fuentes). La lista final de subreddits la elige Felipe; candidatos
a verificar (actividad y reglas de cada comunidad): smallbusiness, freelance, Entrepreneur,
SomebodyMakeThis, software, Bookkeeping, Accounting, propertymanagement, Teachers, nursing,
Parenting, personalfinance, Etsy, y alguna comunidad en español para el foco de la fase 2.

### H12. Distinguir la evidencia débil en el tablero · S · ⬜ pendiente
**Como** usuario **quiero** ver de inmediato qué oportunidades se apoyan en una sola persona
**para** no confundir una anécdota con un dolor compartido.

Criterios de aceptación:
- Dada una oportunidad respaldada por un solo autor, cuando la veo en el tablero o en su
  detalle, entonces aparece marcada como "evidencia débil", con una explicación al pasar el mouse.
- El tablero tiene un filtro "mínimo de autores distintos" (1, 2, 3 o más) que se combina con
  los demás y vive en la URL, igual que los filtros de H5.
- Cuando una oportunidad suma un segundo autor en una corrida de agrupamiento posterior,
  entonces deja de marcarse como débil sin intervención manual.
- El puntaje no cambia por esta historia: la marca y el filtro sólo hacen visible lo que la
  frecuencia ya mide.

### H8. Evaluar la calidad de la extracción · S · 🟡 herramienta lista, falta etiquetar
**Como** usuario **quiero** un conjunto de posts reales con los dolores esperados **para**
medir si un cambio de prompt o de modelo mejora o empeora la extracción.

Criterios de aceptación:
- Al menos 30 posts reales etiquetados a mano (con y sin dolores).
- Un comando que corre la extracción sobre ellos y reporta aciertos, falsos positivos y costo.

Notas: ver `evals/extraction/README.md`. Listo: formato del dataset, `npm run eval:sample`,
página `/labeling` (solo en desarrollo) y `npm run eval` con precisión, recall, vertical y
costo. Pendiente: etiquetar 30+ posts reales y registrar la primera línea base. Reubicada desde
la fase 1 porque ahora bloquea a H13. Conviene que el dataset incluya posts de los tipos que hoy
se descartan (anuncios, opiniones, preguntas generales) para medir el prefiltro. La línea base
debe correrse también con `model = "claude-code"` (ADR-0008), que es el modo en producción.

### H13. Descartar el ruido evidente antes del análisis · S · ⬜ pendiente
**Como** usuario **quiero** que los posts que claramente no cuentan un problema se descarten
sin gastar análisis de IA **para** que la capacidad diaria alcance para los posts que sí tienen
dolores.

Criterios de aceptación:
- Dado un post que cumple una regla de ruido (por ejemplo, hilos recurrentes tipo "What are you
  working on?", ofertas de trabajo, anuncios o posts sin texto propio), cuando se reparte el
  trabajo de extracción, entonces no se entrega al analista y queda descartado con el motivo
  "prefiltro: <regla>".
- Las reglas son explícitas, están documentadas y no usan IA.
- Los posts descartados por prefiltro se pueden revisar en la página de actividad, con su
  motivo y link a la fuente.
- Dado el dataset de H8, cuando se aplica el prefiltro, entonces no descarta ningún post
  etiquetado con dolores; el informe muestra cuántos posts sin dolor se ahorra.
- El balance de H10 muestra cuántos posts descartó el prefiltro en los últimos 7 días.

Notas: depende de H8. Requiere al `architect` para decidir dónde vive el filtro (al ingerir o
al repartir trabajo) y si conviene un ADR. Si una regla resulta discutible, se queda fuera:
preferimos analizar ruido a perder evidencia.


### H16. Ingestar preguntas de sitios no técnicos de Stack Exchange · M · ✅ hecha (activación pendiente de C1–C3 de ADR-0010)
**Como** usuario **quiero** que el radar lea preguntas de comunidades no técnicas de Stack
Exchange, en especial las de quienes buscan software para una tarea concreta **para** tener una
fuente de público amplio que no dependa de la aprobación de Reddit.

Criterios de aceptación:
- Precondición para activarla en producción (el desarrollo puede empezar antes): las condiciones
  C1–C3 de ADR-0010 están cumplidas (términos oficiales leídos por Felipe, "Help improve Claude"
  apagado, actividad mínima por sitio medida).
- La fuente se activa con `STACKEXCHANGE_KEY`; sin ella `ingest` registra
  `[stackexchange] skipped` y H14 la muestra como "no configurada", igual que Reddit.
  `SEEDBOX_SE_SITES` es opcional y trae por defecto la lista de ADR-0010 (softwarerecs, webapps,
  money, workplace, academia, freelancing, expatriates, parenting).
- Dado un job programado, cuando se ejecuta, entonces guarda las preguntas nuevas de cada sitio
  sin duplicar las existentes (`externalId` = `sitio:question_id`), igual que H1.
- Cada señal guarda el sitio, el link a la pregunta, el puntaje, la cantidad de respuestas, las
  tags, el autor con link a su perfil, la licencia y las marcas de cerrada y de respuesta aceptada.
- Cada cita mostrada lleva atribución verificable: autor con link a su perfil, link a la pregunta,
  sitio de origen y licencia CC BY-SA con link.
- Se aplican las reglas de ADR-0009: sólo preguntas con al menos 24 h, tope de 25 por sitio y
  corrida, y log por sitio con traídas, descartadas por tope e insertadas. La primera corrida trae
  como máximo 8 días.
- El título y el cuerpo se guardan como texto plano sin entidades HTML, y una cita copiada de una
  pregunta con formato (listas, enlaces, código) pasa la verificación de citas textuales.
- Se excluyen las preguntas con puntaje negativo; las cerradas y las respondidas se guardan.
- Una pregunta guardada hace menos de 30 días que falta en dos revisiones seguidas se borra junto
  con sus dolores, y el log lo informa.
- Se respetan `backoff` y `quota_remaining`; un throttle corta sólo esta fuente y las demás siguen.
- Dados 7 días activa, cuando miro H14, entonces aparece como fuente propia con sus conteos y
  verticales, desglosados por sitio. Si aporta menos de ~10 dolores por semana, el PO reconsidera
  mantenerla.

Notas: salió de espera el 2026-11-04 por el posible cierre del acceso nuevo a Reddit (ADR-0009).
Decisión técnica en ADR-0010 (aprobada con condiciones), que incluye el borrador de la sección
para `docs/deploy.md`. El desglose por sitio requiere generalizar `subredditOf` en
`src/lib/source-mix.ts` (hoy lee `metadata.subreddit`). Antes de la fase 3 (comercial), revisar
los términos o consultar por escrito a Stack Overflow; plan B en ADR-0010.

Implementación: adaptador `src/lib/sources/stackexchange.ts` (fuente `stackexchange`, un feed por
sitio en `metadata.site`), registrado junto a Hacker News y Reddit. Sin `STACKEXCHANGE_KEY` lanza
`SourceNotConfiguredError` (`[stackexchange] skipped`, "no configurada" en H14). Dentro del
adaptador aplica `todate = ahora − SEEDBOX_INGEST_MIN_AGE_HOURS`, la primera corrida de 8 días, el
descarte de puntaje negativo y el tope `SEEDBOX_MAX_NEW_PER_FEED` por sitio (más respuestas, más
puntaje, más reciente); guarda `metadata.answerCount` para la métrica de H11. `htmlToText` pasó a
`src/lib/text.ts` (listas, bloques, enlaces sin URL, código, entidades). La revisión de borrados es
el método opcional `reconcile` del adaptador: la primera ausencia marca `metadata.missingSince`, la
segunda seguida borra la señal con sus dolores (sin migración). El log de `ingest` informa por sitio
traídas, filtradas, recortadas por tope e insertadas, y el resultado de la revisión. Las citas de
Stack Exchange en tablero, detalle y `/activity` muestran sitio, link a la pregunta, autor con link
a su perfil y licencia con link. H14 desglosa por sitio (`feedOf`: `subreddit` o `site`). No se
probó contra la API real (bloqueada desde la sesión): tests con respuestas simuladas. Falta, en
operación: C1–C3, el criterio de 7 días activa y, si hace falta, el filtro propio mínimo para la
revisión de borrados (hoy usa el filtro `default`).
