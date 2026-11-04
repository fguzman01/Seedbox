# ADR-0010: Stack Exchange como fuente de público no técnico

- Estado: aceptada con condiciones (ver "Condiciones antes de activar")
- Fecha: 2026-11-04
- Relacionada con: ADR-0002 (adaptadores), ADR-0006 y ADR-0009 (Reddit, tope por feed, 24 h de
  antigüedad mínima, reparto entre fuentes), ADR-0008 (analista con Claude Code)

## Contexto

Según fuentes secundarias (ADR-0009), Reddit dejó de recibir pedidos nuevos de acceso a su API el
31-10-2026. El PO sacó a H16 de espera: ingerir preguntas de sitios no técnicos de Stack Exchange
para tener una fuente de público amplio que no dependa de Reddit. Antes de programarla hay que
decidir si los términos lo permiten, cómo se accede, qué sitios leer y cómo encaja con las reglas
de ADR-0009.

### Qué pudimos verificar en esta sesión (2026-11-04)

**Ningún dominio oficial de Stack Exchange fue accesible desde la sesión en que se escribió este
ADR.** `api.stackexchange.com` (también con `curl`), `stackoverflow.com`, `meta.stackexchange.com`
y `stackapps.com` respondieron con rechazo del proxy (403). `policies.stackoverflow.co` y
`web.archive.org` tampoco se pudieron leer. Tampoco el espejo `scriptagc.wasmer.app` ni
`devops.com`. Lo que sigue viene de buscadores y de fuentes secundarias. Lo que no está marcado
como verificado se escribió con lo que se sabía de la API hasta 2026. **Hay que confirmarlo en la
fuente oficial** (ver condiciones).

| Afirmación | Fuente | Estado |
|---|---|---|
| Los términos de stackoverflow.ai prohíben usar el contenido de los sitios para "desarrollar o entrenar" IA generativa, LLM o modelos de aprendizaje automático, y prohíben scrapers. Además dicen que la API se rige por un documento aparte, los *API Terms of Use*. | Resultado de búsqueda de <https://policies.stackoverflow.co/services/stackoverflow-ai-terms-of-use/> (no se pudo abrir) | Fragmentos citados por el buscador; no leídos completos |
| La *Acceptable Use Policy* prohíbe la recolección automatizada **para entrenar o mejorar** sistemas de IA generativa o LLM sin consentimiento previo por escrito. Tener acceso a la API no autoriza ese uso. Consultar lo mismo más de una vez por minuto se considera abuso. | Resumen de terceros (techbloat) | No verificado |
| Desde julio de 2024 los *data dumps* sólo se bajan con sesión iniciada y aceptando que no se usarán para entrenar un LLM. Críticos señalan que CC BY-SA 4.0 no admite restricciones adicionales. | heise, DevClass | Varias fuentes concuerdan; anuncio original no leído |
| Stack Overflow cobra a las empresas que entrenan LLM comerciales (OverflowAPI, acuerdos con Google y OpenAI). El CEO dijo en 2024 que sólo cobraría a quienes desarrollan grandes LLM con fines comerciales. | The Register, Yahoo/TechCrunch | Varias fuentes concuerdan |
| El contenido de los términos del sitio (no el de la API) prohíbe bajar o guardar contenido público "salvo para uso personal y no comercial"; el contenido obtenido por la API queda fuera de esa restricción. | Análisis de Zuva | Comentario de terceros; no verificado |
| La API pública es gratuita para apps comerciales y no comerciales según sus términos. | Catálogo de api-evangelist (dice que no se cotejó con la página vigente) | No verificado |
| Cuotas: sin clave, 300 consultas por día **por IP**; con clave, 10.000 por día. Máximo de unas 30 consultas por segundo por IP; si se pasa, la IP se bloquea un rato. Hay que respetar el campo `backoff` y mirar `quota_remaining`. Una clave inválida no baja a la cuota sin clave: la consulta falla. | Wrappers y guías (py-stackexchange, Rollout, FAQ de Stack Apps vía espejo) | Varias fuentes concuerdan; documentación oficial no leída |
| No hay anuncio de 2026 que cambie la clave o las cuotas de la API pública. Los cambios de 2026 (límite configurable por clave, encabezado `X-API-Key`) son de Stack Internal, el producto empresarial. | Notas de versión de Stack Internal 2026.6 | Verificado que el cambio es de Stack Internal; que la API pública no cambió es una ausencia de evidencia |
| `/2.3/questions` acepta `fromdate`, `sort=creation` y el filtro `withbody` (incluye el cuerpo). | Esquemas OpenAPI de scrapers de Apify, módulo PSStackExchange | Coincide con la documentación conocida |
| La API no devuelve preguntas borradas. Para detectarlas se vuelve a pedir por id y se toma la ausencia como "probablemente borrada". | Bot SOBotics/burnaki, respuesta de 2017 | Práctica de la comunidad; no oficial |
| **La actividad de la red cayó fuerte:** Stack Overflow pasó de unas 6.400 preguntas en julio de 2025 a unas 1.500 en julio de 2026 (−77 %). | Ground Truth, gist de hopeseekr, DEV Community | Varias fuentes concuerdan. No hay datos de los sitios no técnicos |
| Stack Overflow lanzó "Stack Overflow for Agents" (beta, 10-06-2026). Un blog afirma que los términos prohíben que agentes de IA usen la plataforma. | IT Brief, blog de goncalovelosa | Lanzamiento con varias fuentes; la prohibición no está verificada |
| Requisitos de atribución publicados por Stack Exchange (2009–2014): indicar que viene de Stack Exchange, enlazar a la pregunta, mostrar el nombre del autor y enlazar a su perfil. Un artículo de 2018 dice que se sacaron de los términos sin aviso. | Blog de Stack Overflow 2009/2014, arXiv 1802.02938 | Antiguos; estado actual no verificado |
| Los términos de consumidor de Anthropic (vigentes desde el 28-09-2025) permiten usar las sesiones de Free, Pro y Max, **incluido Claude Code**, para entrenar modelos, salvo que se desactive "Help improve Claude" en Settings → Privacy. | Anthropic, MacRumors y otros | Varias fuentes concuerdan; anuncio de 2025, revisar la pantalla actual |

Lo último importa: el analista corre con la suscripción de Felipe (ADR-0008), no con la API de
Claude. Si la opción de mejorar los modelos está activa, lo que procesa el analista **puede terminar
en el entrenamiento de un modelo**. Eso es justo lo que Stack Exchange prohíbe.

## Decisión

**Stack Exchange queda aprobada con condiciones.** Es la opción aburrida: API pública, de sólo
lectura, sin autenticación de usuario, con clave gratuita y estable desde hace años. Encaja tal
cual en la interfaz `SourceAdapter`. Las condiciones existen porque no se pudo leer el texto oficial
de los términos y porque el volumen real de los sitios no técnicos no está medido.

### 1. Términos y uso permitido

- **Fase 1 (uso personal, no comercial).** Leemos por la API oficial, guardamos un texto por
  pregunta, Claude extrae problemas y mostramos citas cortas con enlace, sólo al autor. Con lo que
  encontramos, nada de esto es "entrenar o mejorar" un modelo. Se considera permitido si se
  cumplen estas dos cosas:
  1. Los *API Terms of Use* vigentes no prohíben procesar el contenido con un modelo de IA de
     terceros (ver condición C1).
  2. Ningún contenido de Stack Exchange llega al entrenamiento de un modelo, tampoco en Anthropic
     (condición C2).
- **Fase 3 (comercial).** Un producto pago que muestra oportunidades derivadas del contenido de
  Stack Exchange se acerca a lo que Stack Overflow cobra con OverflowAPI. **Antes de monetizar hay
  que revisar los términos vigentes y, si no son claros, consultar por escrito a Stack Overflow.**
  Mientras no haya respuesta, la fuente se apaga en la versión pública (quitar `STACKEXCHANGE_KEY`)
  y los dolores que sólo tienen evidencia de Stack Exchange no se muestran. Igual que con Reddit
  en ADR-0006.
- **Nunca:** scraping de páginas, uso de los *data dumps* o de proveedores de terceros como
  sustituto de la API.

### 2. Licencia CC BY-SA y atribución en las citas

Cada pregunta trae su licencia en `content_license` (CC BY-SA 2.5, 3.0 o 4.0, según la fecha).
Toda cita de Stack Exchange que se muestre lleva:

1. El enlace a la pregunta original (`link`). Ya lo exige la regla de evidencia trazable.
2. El nombre del autor (`owner.display_name`) con enlace a su perfil (`owner.link`). Si el usuario
   ya no existe (`owner.user_type = "does_not_exist"`), sólo el nombre.
3. El sitio de origen ("Stack Exchange · money.stackexchange.com").
4. La licencia con enlace a su texto, por ejemplo
   <https://creativecommons.org/licenses/by-sa/4.0/>.

La cita se copia sin cambios (ya lo exige la validación de citas de H2). La descripción del dolor
y el resumen de la oportunidad son texto propio, no una traducción ni una adaptación del post. En
fase 1 no se distribuye nada (el sitio es privado), así que el *share-alike* no se activa. Antes de
la fase 3 hay que revisar con alguien que sepa de licencias si algún texto mostrado cuenta como
adaptación.

### 3. Acceso a la API

- **Versión:** `https://api.stackexchange.com/2.3/` (la vigente conocida; confirmar en
  `/docs`).
- **Registro:** app en <https://stackapps.com/apps/oauth/register> (nombre, descripción, dominio
  OAuth y sitio web; para una app sin login de usuario sirven el dominio del sitio en Railway y la
  URL del repo). Se acepta ahí los *API Terms of Use*. Sólo usamos la **clave** (`key`); no
  pedimos `access_token`, no hay login de usuario y no se usa el `client_secret`. Stack Exchange
  dice que la clave no es secreta. Aun así va en una variable de entorno, como todo lo demás.
- **La clave es obligatoria para activar la fuente.** Sin clave la cuota es de 300 consultas por
  día por IP. En Railway la IP de salida se puede compartir con otros clientes, así que esa cuota
  no es confiable. Sin `STACKEXCHANGE_KEY` el adaptador lanza `SourceNotConfiguredError` y la
  ingesta muestra `[stackexchange] skipped`, igual que Reddit (H6).
- **Endpoint por sitio y corrida:**

  ```
  GET /2.3/questions?site={site}&sort=creation&order=desc
      &fromdate={since}&todate={now - 24 h}
      &pagesize=100&page={n}&filter=withbody&key={key}
  ```

  `fromdate` y `todate` son segundos Unix y se incluyen los extremos. Los duplicados ya los resuelve
  `onConflictDoNothing`.
- **Campos que se usan** (todos del filtro `withbody`, que es el filtro por defecto más `body`):
  `question_id`, `title`, `body` (HTML), `link`, `score`, `answer_count`, `view_count`, `tags`,
  `owner.display_name`, `owner.link`, `owner.user_type`, `creation_date`, `is_answered`,
  `accepted_answer_id`, `closed_date`, `closed_reason` y `content_license`. Si algún campo no
  viene con `withbody` (posible en `content_license`), se crea un filtro propio una sola vez con
  `/2.3/filters/create` y su id queda como constante en el código.
- **Paginación:** como mucho **2 páginas** por sitio y corrida (200 preguntas). Con el tope de 25
  sobra. Se corta antes si `has_more` es falso.
- **Primera corrida:** si la fuente no tiene señales guardadas, `fromdate` = ahora − 8 días (7 días
  más las 24 h de espera). Sin esto, con `has_more` la API recorrería años de historia.
- **Throttling:**
  - Las consultas van una por una, nunca en paralelo.
  - Si una respuesta trae `backoff`, se esperan esos segundos antes de la siguiente consulta.
  - Si el `backoff` es de más de 60 s, se corta la fuente en esa corrida con un error claro.
  - Si `quota_remaining` baja de 100, se corta la fuente en esa corrida.
  - Un error `throttle_violation` (HTTP 400, `error_id` 502) corta la fuente; no se reintenta en
    bucle.
  - Uso esperado: 8 sitios × 1–2 páginas más la revisión de borrados (punto 6), menos de 100
    consultas por día: el 1 % de la cuota.
- **Compresión:** la API responde siempre comprimida (gzip). El `fetch` de Node la descomprime
  solo. No hay que hacer nada, salvo **no** fijar a mano el encabezado `Accept-Encoding`.
- `User-Agent`: `seedbox/0.1 (+URL del repo)`, por cortesía.

### 4. Encaje con ADR-0009

- **Una sola fuente, `stackexchange`, con muchos feeds.** El `id` del adaptador es
  `stackexchange` y cada sitio es un feed (`metadata.site`). En el reparto de partes iguales de
  ADR-0009 cuenta como **una** fuente, igual que Reddit con sus subreddits. `sourceLabel` muestra
  el dominio del sitio (p. ej. `money.stackexchange.com`, sacado de `link`), como `r/…` en Reddit.
- **24 h de antigüedad mínima:** se cumple con `todate = ahora − SEEDBOX_INGEST_MIN_AGE_HOURS`.
  La fecha de corte sigue siendo por fuente (la última `published_at` guardada de
  `stackexchange`). Como todos los sitios se piden con la misma ventana, ningún sitio se saltea.
  `fetchSignals` junta todos los sitios antes de devolver: si falla un sitio, la fuente entera
  falla y no se guarda nada a medias. Así la corrida siguiente vuelve a pedir la misma ventana.
- **Tope `SEEDBOX_MAX_NEW_PER_FEED` (25) por sitio y corrida**, después de los filtros del
  punto 5. El orden para elegir es primero `answer_count`, luego `score` y, a igualdad, la más
  reciente. `answer_count` hace las veces de "comentarios" en la métrica de ADR-0009: indica que
  otros se reconocen en el problema. Se guarda como `metadata.answerCount` (no como
  `numComments`, porque no son comentarios). La métrica de actividad de H11 lee
  `numComments ?? answerCount`. El log informa por sitio: traídas, descartadas por filtro,
  descartadas por tope e insertadas.
- **N = 14 y envejecidos:** no cambia nada. Se aplica por fuente como en ADR-0009.

### 5. Qué preguntas se guardan y en qué formato

- **Se descartan** las preguntas con `score < 0`: suelen ser spam o de baja calidad, y el sistema
  automático de limpieza ("Roomba") las borra pronto. Con las 24 h de espera, la mayor parte del
  spam ya no aparece.
- **No se descartan las cerradas.** Una pregunta cerrada por duplicada o "demasiado amplia" (muy
  común en Software Recommendations) sigue mostrando un dolor real, y una duplicada de otro autor
  es justo la evidencia de frecuencia que buscamos. Se guardan `metadata.closed` (`closed_reason`)
  para poder filtrarlas más adelante si meten ruido.
- **No se descartan las que tienen respuesta aceptada.** La extracción mira sólo la pregunta. Que
  alguien haya propuesto una herramienta es una pista de competencia, no un motivo para perder la
  señal. Se guarda `metadata.hasAcceptedAnswer`.
- **HTML → texto plano antes de guardar.** `body` llega en HTML (`<p>`, `<a>`, `<em>`, `<ul><li>`,
  `<blockquote>`, `<pre><code>`, `<img>`, `<h2>`, `<hr>`). Se guarda texto plano para que el
  analista copie texto y no etiquetas, y para que `quoteAppearsIn` (que compara contra
  `title + body` guardados) funcione igual que con Hacker News.
  - El `htmlToText` de `hackernews.ts` pasa a `src/lib/text.ts` y se amplía: bloques (`p`,
    `li`, `blockquote`, `h1`–`h6`, `pre`, `hr`) se convierten en saltos de línea, `li` en `- `, y
    `img` se quita.
  - Se conserva el texto de los enlaces y se quita la URL.
  - Se decodifican las entidades.
  - **El `title` también viene con entidades HTML** (`&quot;`, `&#39;`) y se decodifica con la
    misma función.
- `externalId` = `question_id` con el sitio como prefijo (`money:123456`), porque los ids se
  repiten entre sitios. `author` = `owner.display_name` (decodificado). `url` = `link`.
- `metadata`: `site`, `score`, `answerCount`, `viewCount`, `tags`, `hasAcceptedAnswer`, `closed`,
  `ownerLink`, `license`. Con eso alcanza para la atribución del punto 2 y no hace falta cambiar el
  esquema de `signals`.

### 6. Borrados

La licencia no obliga a borrar, pero respetar lo que el autor o los moderadores eliminan es lo
correcto y probablemente lo exigen los términos de la API (no verificado). En Stack Exchange es
barato hacerlo desde el principio, así que no se deja para la fase 3 como en Reddit:

- En cada corrida, después de ingerir, el adaptador **vuelve a pedir por id las preguntas de
  Stack Exchange guardadas en los últimos 30 días** (`/2.3/questions/{ids}`, hasta 100 ids
  separados por `;` por consulta y por sitio, filtro mínimo con sólo `question_id`).
- Una pregunta que no vuelve en **dos corridas seguidas** se considera borrada. Pedirlo dos veces
  evita borrar por un fallo pasajero de la API.
- **Qué se hace:** se borra la fila de `signals`, y con ella sus `pains` (`onDelete: cascade`).
  Una oportunidad que se queda sin dolores deja de mostrarse en el tablero. No se guarda ni el
  texto ni el autor de lo borrado: sólo un contador en el log de `ingest`.
- **Pasados 30 días** no se revisa más. Casi todos los borrados (spam, Roomba de preguntas cerradas
  o sin respuesta) pasan en las primeras semanas. Lo que se borre después se resuelve a mano si
  alguien lo pide, como en ADR-0009.
- Costo: unas 25 × 8 × 30 = 6.000 preguntas en la ventana, o sea unas 60 consultas por día.
- Se marca en `metadata.missingSince` la primera vez que una pregunta no vuelve. Así no hace falta
  una tabla nueva.

### 7. Sitios

No se pudo medir la actividad (la API está bloqueada desde esta sesión). La lista inicial se elige
por **densidad de problemas que se resuelven con software**. Ninguno queda activo hasta pasar la
prueba de actividad de la condición C3.

Recomendados, en este orden (`SEEDBOX_SE_SITES` por defecto):

| Parámetro `site` | Sitio | Público y por qué |
|---|---|---|
| `softwarerecs` | Software Recommendations | Gente que pide una herramienta para una tarea concreta: el "¿existe una app que…?" en su forma más pura. |
| `webapps` | Web Applications | Usuarios no técnicos de Gmail, Sheets, Trello o Notion que chocan con los límites de la herramienta que ya usan. |
| `money` | Personal Finance & Money | Personas comunes con presupuestos, impuestos, deudas e inversiones; muchas señales de disposición a pagar. |
| `workplace` | The Workplace | Empleados y jefes con procesos, comunicación y burocracia laboral. |
| `academia` | Academia | Estudiantes de posgrado, investigadores y docentes: referencias, postulaciones, evaluación, gestión de grupos. |
| `freelancing` | Freelancing | Independientes con facturación, clientes, contratos y cobros (beta; probablemente poca actividad). |
| `expatriates` | Expatriates | Migrantes con trámites, visados, impuestos y bancos en otro país; nicho cercano al foco hispanohablante. |
| `parenting` | Parenting | Padres con organización familiar, rutinas y educación; dolores cotidianos de público masivo. |

Evaluados y no incluidos por ahora:

- `pm` (Project Management): buena densidad; agregar si `freelancing` no pasa la prueba de
  actividad.
- `diy` (Home Improvement): mucho volumen, pero problemas físicos.
- `law`: consultas legales puntuales, que no se resuelven con software.
- `travel`: mucho volumen, poca densidad.
- `superuser`: técnico; vuelve a sesgar hacia desarrolladores, que es lo que H14 quiere medir.
- `startups`, `lifehacks`, `writing`: poca actividad o poca densidad (de memoria; sin medir).

## Condiciones antes de activar la fuente

El desarrollo de H16 puede empezar ya: el código y los tests no tocan la API real. **La fuente no
se activa en Railway** (no se configura `STACKEXCHANGE_KEY`) hasta cumplir:

- **C1. Términos leídos en la fuente oficial.** Felipe lee en un navegador los *API Terms of Use*
  (<https://stackoverflow.com/legal/api-terms-of-use>, o su versión en
  `policies.stackoverflow.co`) y la *Acceptable Use Policy*, y confirma tres cosas:
  1. Nada prohíbe analizar contenido de la API con un modelo de IA de terceros cuando no se
     entrena ni ajusta un modelo.
  2. Qué atribución piden. Si piden más que el punto 2, se suma.
  3. Si hay límites de guardado (tiempo máximo de caché, obligación de borrar).

  Si alguna dice que no, se aplica el plan B.
- **C2. Sin entrenamiento en Anthropic.** En la cuenta de Claude con la que corre el analista,
  **Settings → Privacy → "Help improve Claude" queda desactivado**. Si se usa la alternativa con la
  API de Claude (`docs/deploy.md`), no hace falta: el uso por API no entra al entrenamiento.
- **C3. Actividad mínima por sitio.** Antes de incluir un sitio, se cuentan sus preguntas de los
  últimos 30 días (una consulta por sitio):

  ```
  curl -s --compressed "https://api.stackexchange.com/2.3/questions?site=money&fromdate=$(date -d '30 days ago' +%s)&filter=total&key=$STACKEXCHANGE_KEY"
  ```

  Entra el sitio con **al menos 20 preguntas** en 30 días. Con menos, el costo de tenerlo en la
  lista es nulo, pero no aporta y ensucia H14. Si en total quedan menos de 3 sitios, se revisa el
  valor de H16 con el PO antes de seguir.

### Actualización 2026-11-04: términos leídos y decisión de activar (C1)

Felipe leyó en su navegador los **API Terms of Use** y la **Acceptable Use Policy** vigentes:

- **Atribución (API Terms of Use):** la app debe indicar visualmente que el contenido viene de la
  red Stack Exchange; las reglas del Terms of Service se exigen a las apps que indexan los
  buscadores. Lo cubre la atribución de H16 (sitio, link, autor y licencia), y el sitio es privado.
- **Guardado y borrados:** el texto leído no impone límites de guardado ni obligación de borrar.
  La revisión diaria de borrados de H16 se mantiene como buena práctica.
- **Content Scraping/Bot Policy (AUP):** prohíbe recolectar contenido con sistemas automatizados
  para (1) construir un producto similar o competidor, (2) "developing, building, training,
  testing, indexing, benchmarking, or improving any generative AI, chatbot, large language, or
  machine learning tool, model, or platform, or any similar technology", o (3) con un volumen
  que afecte la red. Se puede pedir una excepción por escrito a legal@stackoverflow.com.

**Decisión de Felipe:** activar la fuente sin pedir la excepción por escrito, con esta lectura:
Seedbox no compite con Stack Exchange (1), no entrena, ajusta, prueba ni mejora ningún modelo,
sólo usa un modelo existente para resumir preguntas (2), y hace unas 100 consultas diarias por
la API oficial con clave registrada (3). La cláusula (2) es amplia y admite otra lectura (que
Seedbox sea una "herramienta de machine learning"), así que el riesgo aceptado es que Stack
Exchange corte el acceso a la clave sin aviso. Para mantener esa lectura:

- "Help improve Claude" debe seguir apagado en la cuenta del analista (C2).
- El contenido de Stack Exchange no se usa para evaluar ni comparar prompts o modelos: queda
  fuera del dataset de H8.
- **Antes de la fase 3 (comercial)**, o si Stack Exchange objeta el uso, se pide la excepción por
  escrito a legal@stackoverflow.com (hay un borrador del correo en el historial de la sesión
  del 2026-11-04) o se apaga la fuente quitando `STACKEXCHANGE_KEY`.

### Actualización 2026-11-04: actividad medida (C3) y sitios activados

Preguntas de los últimos 30 días (`filter=total`, desde el 2026-10-05), medidas por Felipe:
academia 52, webapps 20, workplace 16, softwarerecs 14, money 13, expatriates 5, parenting 1,
freelancing 0. Sólo dos sitios pasaban el mínimo de 20. Se bajó el mínimo a **10**: un sitio con
poca actividad cuesta un par de consultas diarias, y softwarerecs, el más afín al radar, quedaba
fuera por poco. Activados en `ingest` (`SEEDBOX_SE_SITES`):
`softwarerecs,webapps,money,workplace,academia`. Quedan fuera expatriates, parenting y
freelancing (`pm` no se midió). Volumen esperado: ~115 preguntas al mes; se revisa con H14
según la regla de ~10 dolores por semana. `STACKEXCHANGE_KEY` configurada el 2026-11-04.

## Alternativas consideradas

- **Rechazar Stack Exchange hasta leer los términos oficiales.** Frena una historia que no depende
  de aprobación de nadie, por un riesgo que se controla con no configurar la clave. El código se
  puede escribir y probar con fixtures mientras tanto.
- **Sin clave (300/día por IP).** Funciona en local, pero en Railway la IP puede ser compartida y
  la cuota quedar agotada por otros. La clave es gratis.
- **`body_markdown` en vez de `body` HTML.** Es más parecido al texto, pero la sintaxis Markdown
  (`[texto](url)`, `**`) haría que el modelo la limpie al citar y que la verificación falle.
  Convertir HTML ya está resuelto para Hacker News.
- **Una fuente por sitio** (`stackexchange-money`, …). Encajaría con la fecha de corte por fuente,
  pero cada sitio se llevaría una parte igual del lote de ADR-0009 y Stack Exchange acapararía el
  analista. Una sola fuente es coherente con Reddit.
- **Excluir cerradas y con respuesta aceptada.** Se pierde evidencia de frecuencia y de dolor por
  razones de moderación del sitio, no por relevancia. Se guarda la marca y se decide con datos.
- **Data dumps o Stack Exchange Data Explorer.** Los dumps prohíben expresamente el uso con LLM
  (aunque sea en otro sentido) y se publican cada tanto; SEDE no es una API para automatizar. La API
  es el canal previsto.
- **Borrar recién en fase 3, como en Reddit.** Con unas 60 consultas por día se puede hacer desde
  el principio, y así no queda deuda con una fuente cuyos términos no pudimos leer.

## Consecuencias

- Fuente nueva `stackexchange` en `src/lib/sources/stackexchange.ts`, registrada en `index.ts`.
  No cambia el esquema de `signals`. `htmlToText` pasa a `src/lib/text.ts` y lo comparten Hacker
  News y Stack Exchange.
- `ingest` gana un paso posterior a la ingesta, sólo para esta fuente: la revisión de borrados.
  Puede ser un método opcional del adaptador (`reconcile?(stored)`). Así la interfaz común no
  obliga a las demás fuentes.
- Variables nuevas, opcionales: `STACKEXCHANGE_KEY` (activa la fuente) y `SEEDBOX_SE_SITES`.
  Reutiliza `SEEDBOX_MAX_NEW_PER_FEED` y `SEEDBOX_INGEST_MIN_AGE_HOURS` de ADR-0009.
- El tablero y el detalle muestran la atribución del punto 2 en las citas de Stack Exchange.
- **Riesgos:**
  - *Términos no leídos.* Mitigado por C1: nada se activa sin leerlos.
  - *Volumen bajo.* La red viene cayendo fuerte (Stack Overflow −77 % interanual) y los sitios no
    técnicos eran chicos ya antes. Puede que entren pocos posts por día. H14 lo dirá a los 7 días.
    Si Stack Exchange aporta menos de unos 10 dolores por semana, no vale la pena mantenerla y se
    apaga.
  - *Cambios de política.* Stack Overflow ya restringió los dumps en 2024 y cobra a las empresas
    de IA. Puede restringir la API. El adaptador está aislado (ADR-0002); apagarlo es quitar la
    clave.
  - *Fase 3.* El uso comercial no está resuelto (punto 1). Es una tarea pendiente antes de
    monetizar.
- **Plan B si los términos lo prohíben** (sin verificar, a evaluar en su propio ADR si hace
  falta):
  1. Foros Discourse públicos de productos usados por público no técnico, que exponen JSON por
     foro (con los términos de cada foro).
  2. Lemmy, federado con API abierta pero poco volumen.
  3. Adelantar las reseñas de tiendas de apps de la fase 2.
  4. Mientras tanto, Hacker News sigue siendo la única fuente y H14 lo muestra.

## Borrador para `docs/deploy.md` (no aplicado)

Para sumar al paso 3 ("Railway: recolección diaria de posts") cuando se implemente H16:

> **Stack Exchange (opcional).** Lee preguntas de sitios no técnicos (Software Recommendations,
> Personal Finance & Money, etc.). No necesita aprobación previa, sólo una clave gratuita.
>
> 1. Antes de activarla, cumple las condiciones de
>    [ADR-0010](adr/0010-fuente-stack-exchange.md): términos leídos y "Help improve Claude"
>    desactivado en la cuenta del analista.
> 2. Entra con tu cuenta de Stack Exchange a <https://stackapps.com/apps/oauth/register> y
>    registra una app: nombre `Seedbox`, descripción "Radar personal de sólo lectura", dominio
>    OAuth = el dominio de tu sitio en Railway, sitio web = la URL del repo. Copia la **Key** (no
>    hace falta el *client secret*).
> 3. En `ingest` → **Variables**:
>
>    | Variable | Valor |
>    |---|---|
>    | `STACKEXCHANGE_KEY` | La *Key* de tu app en Stack Apps. Sin ella, Stack Exchange no se usa |
>    | `SEEDBOX_SE_SITES` | Opcional. Sitios separados por coma, con el nombre que usa la API (`softwarerecs,webapps,money,workplace,academia,freelancing,expatriates,parenting` por defecto) |
>
> 4. En el próximo log de `ingest` deberías ver, por sitio,
>    `[stackexchange] money fetched=… capped=… inserted=…` y, al final, cuántas preguntas se
>    quitaron por haber sido borradas en Stack Exchange.
>
> Problemas comunes:
>
> | Síntoma | Causa probable |
> |---|---|
> | `[stackexchange] skipped: Stack Exchange is not configured` | Falta `STACKEXCHANGE_KEY` en `ingest` (las demás fuentes siguen) |
> | `no site found for name …` | Un nombre de `SEEDBOX_SE_SITES` no existe; usa el parámetro `site` de la API (p. ej. `money`, no `personalfinance`) |
> | `throttle_violation` o `backoff too long` | Stack Exchange pidió frenar; la corrida de mañana sigue sola. Si se repite, revisa que no haya otra app usando la misma clave |
> | `key is not valid` | La clave está mal copiada o la app se borró en Stack Apps |

## Fuentes consultadas (2026-11-04)

- <https://policies.stackoverflow.co/services/stackoverflow-ai-terms-of-use/> (sólo fragmentos del
  buscador; el dominio no fue accesible)
- <https://zuva.ai/blog/llm-breach-of-terms-of-use/>
- <https://www.techbloat.com/?p=1950639>
- <https://www.heise.de/en/news/Stack-Exchange-restricts-data-access-for-generative-AI-and-the-rest-of-the-world-9823083.html>
- <https://devclass.com/2024/07/30/stack-exchange-restricts-access-to-dump-of-user-contributed-data-as-critics-complain-license-permits-reuse-for-any-purpose/>
- <https://forums.theregister.com/forum/all/2024/03/01/stack_overflow_launches_api_to/>
- <https://www.yahoo.com/entertainment/stack-overflow-signs-deal-openai-145546781.html>
- <https://raw.githubusercontent.com/api-evangelist/stackexchange/refs/heads/main/plans/stackexchange-plans-pricing.yml>
- <https://github.com/dalanmiller/py-stackexchange>
- <https://rollout.com/integration-guides/stack-exchange/api-essentials>
- <https://scriptagc.wasmer.app/http_stackapps_com/questions/67/how-api-keys-work-faq> (sólo
  fragmento del buscador)
- <https://stackoverflow.blog/2026/09/03/security-control-and-accessibility-si-2026-6>
- <https://api.apify.com/v2/acts/P00FADP2d5N4sZLXs/builds/qsvT4JxzE9NR3VvDx/openapi.json>
- <https://powershellgallery.com/packages/PSStackExchange/1.0.2/Content/Public/Get-SEQuestion.ps1>
- <https://github.com/SOBotics/burnaki>
- <https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/44952606/error-retrieving-multiple-ids-using-the-stack-exchange-api>
- <https://groundtruth.day/news/stack-overflow-took-1490-questions-in-july.html>
- <https://gist.github.com/hopeseekr/f522e380e35745bd5bdc3269a9f0b132>
- <https://dev.to/frankchu/stack-overflow-now-gets-fewer-than-1000-questions-a-month-i-counted-via-the-api-4ep1>
- <https://itbrief.co.uk/story/stack-overflow-launches-beta-product-for-ai-coding-agents>
- <https://goncalovelosa.github.io/blog/stack-overflow-for-agents/>
- <https://stackoverflow.blog/2009/06/25/attribution-required/>
- <https://stackoverflow.blog/2014/01/23/stack-exchange-cc-data-now-hosted-by-the-internet-archive/>
- <https://ar5iv.arxiv.org/html/1802.02938>
- <https://www.anthropic.com/news/updates-to-our-consumer-terms>
- <https://www.macrumors.com/2025/08/28/anthropic-claude-chat-training>
