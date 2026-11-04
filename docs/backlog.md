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
2. **H11** después: mientras la cola sea más grande que la capacidad diaria, el orden en que se
   reparte el trabajo decide qué ve el usuario. Mejor gastar la suscripción en lo prometedor.
3. **H12**: protege el principio central. Con 16 oportunidades casi todas de un dolor, el
   tablero no debe hacer pasar una anécdota por una tendencia.
4. **H8** (reubicada desde la fase 1): pasa a ser requisito de H13. No se puede recortar ruido
   sin medir que no se pierden dolores reales. Los 60 posts de hoy ya son buen material.
5. **H13** al final: libera la mayor parte de la capacidad, pero sólo es seguro con la línea base
   de H8.

En espera, a propósito: ingestar comentarios de HN (más evidencia por oportunidad, pero suma
volumen a una cola que ya no damos abasto) y fusionar oportunidades duplicadas (esperar a que el
catálogo crezca y ver si el agrupamiento consolida solo). Se revisan después de H13.

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

### H11. Repartir primero el trabajo más prometedor · S · ⬜ pendiente
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
- El orden de reparto queda documentado en el skill y en `docs/deploy.md`.

Notas: requiere al `architect` para definir qué métricas de actividad hay por fuente (Reddit ya
guarda puntaje y comentarios; hay que confirmar Hacker News) y el valor de N.

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

