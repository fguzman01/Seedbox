# ADR-0009: Acceso a Reddit con aprobación previa y reparto del trabajo entre fuentes

- Estado: aceptada
- Fecha: 2026-11-04
- Modifica: ADR-0006 (cómo se obtiene el acceso a Reddit, uso declarado, tope por subreddit) y
  el reparto de trabajo del analista de ADR-0008 (orden de extracción y evaluación, H11)

## Contexto

ADR-0006 supone que basta con crear una app *script* en <https://www.reddit.com/prefs/apps>
para tener credenciales. Eso cambió. Para H15 (Reddit con público amplio) y H11 (repartir
primero el trabajo más prometedor) hacen falta además tres decisiones técnicas: un tope de
posts nuevos por subreddit, cómo comparar la actividad entre fuentes y cuántos días puede
esperar un ítem antes de entrar al lote sí o sí.

### Qué sabemos del acceso a Reddit (2026-11-04)

No pudimos leer ninguna página oficial de Reddit: `support.reddithelp.com`, `www.reddit.com`
y `redditinc.com` no son accesibles desde la sesión en que se escribió este ADR. Todo lo que
sigue viene de fuentes secundarias y **hay que confirmarlo en la página oficial** antes de
actuar.

| Afirmación | Fuente | Estado |
|---|---|---|
| Desde el 11-11-2025 ("Responsible Builder Policy") se cerró el acceso de autoservicio: toda app nueva necesita aprobación explícita antes de leer datos. Crear la app en `prefs/apps` ya no basta. | Anuncio en r/redditdev, leído a través de un espejo, y guías de terceros | Varias fuentes concuerdan; no verificado en la fuente oficial |
| El pedido se hace por el formulario de soporte (*I'm a Developer → I want to register to use the Reddit API*), describiendo el caso de uso. | Guías de terceros | No verificado |
| El uso gratuito está limitado a usos no comerciales aprobados, con unas 100 consultas por minuto por cliente OAuth. El uso comercial requiere un contrato. | Guías de terceros; coincide con lo que ya decía ADR-0006 | No verificado |
| Plazos de respuesta de 7 días a 2–4 semanas; rechazos por falta de detalle; pedidos de uso personal rechazados de inmediato. | Comentarios en r/redditdev y guías | Anecdótico |
| **El 30-09-2026 Reddit anunció el cierre del Data API público: dejó de aceptar pedidos nuevos el 31-10-2026, empieza a cortar apps no registradas el 12-01-2027 y termina todo el acceso público en marzo de 2027**, salvo socios con acuerdo escrito. La alternativa que propone es Devvit, pensada para apps que corren dentro de las comunidades, no para leer datos desde afuera. | TechRepublic, ppc.land, Winbuzzer, How2Shout y otras (ver enlaces) | Varias fuentes concuerdan; no verificado en la fuente oficial. Wikipedia da otra fecha de cierre (noviembre de 2026) |
| Los endpoints `.json` sin autenticar responden 403 (para Apify, desde el 16-10-2026). | Changelog de Apify; dato del PO | No verificado |

### Actualización 2026-11-04: lo que dice la fuente oficial

Felipe leyó en su navegador el artículo oficial "Plataforma para desarrolladores y acceso a los
datos de Reddit" (`support.reddithelp.com/hc/es-es/articles/14945211791892`) y abrió el formulario:

- **El acceso para uso no comercial sigue abierto.** Se pide con el formulario
  `support.reddithelp.com/hc/es-es/requests/new?ticket_form_id=14868593862164` → *Data Access
  Request* → rol *Desarrollador* → "quiero crear una app de Reddit que no funcione en el
  ecosistema Devvit". El formulario permitió enviar el pedido el 2026-11-04. La página no
  menciona el cierre del 31-10-2026 ni las fechas de 2027 que daban las fuentes secundarias.
- **El formulario pide:** cuenta de Reddit, beneficio para los redditors, descripción detallada
  con ejemplos, qué le falta a Devvit, enlace al código fuente, subreddits y usuario del bot.
  Remite a la *Responsible Builder Policy* para decidir la elegibilidad.
- **Investigación:** la única vía autorizada para investigar con datos de Reddit es el programa
  *Reddit for Researchers*; usar la API para investigación académica es una infracción. Por eso
  el uso se declara como herramienta personal, no como investigación (ver punto 2).
- **Uso comercial:** cualquier uso por una empresa o como parte de un producto monetizado
  requiere permiso y contrato.
- **IA:** no se puede usar contenido de Reddit para entrenar modelos sin consentimiento. Analizar
  posts con IA no aparece prohibido.

**Pedido enviado el 2026-11-04.** H15 queda en espera de la respuesta de Reddit. Las fuentes
secundarias sobre el cierre de marzo de 2027 siguen sin confirmarse: si la respuesta llega
aprobada, se revisa de nuevo si el acceso tiene fecha de término.

Lo que sigue se escribió antes de esa lectura. Si el cierre se confirma, **el plazo para pedir acceso venció cuatro días antes de que
decidiéramos pedirlo**, y aun con un pedido aprobado el acceso terminaría en marzo de 2027.

## Decisión

### 1. Reddit: confirmar antes de invertir más

1. **Antes de llenar el formulario**, Felipe confirma en la página oficial (Data API Wiki o la
   Responsible Builder Policy en `support.reddithelp.com`, y el anuncio en r/redditdev) si
   todavía se reciben pedidos. No se programa nada de H15 hasta tener esa respuesta.
2. **Si ya no se reciben pedidos** (lo más probable): Reddit deja de ser una fuente planificada.
   El adaptador queda en el código: sin credenciales no corre y no cuesta nada (`[reddit]
   skipped`). Se elimina cuando el cierre de marzo de 2027 se confirme. **Se recomienda al PO
   sacar H16 (Stack Exchange) de espera** como reemplazo de H15: la condición que H16 fijó para
   salir de espera, que Reddit rechace el acceso, se cumple en la práctica. Queda a decisión del
   PO.
3. **Si todavía se reciben pedidos:** se pide el acceso con el uso declarado del punto 2 y H15
   sigue. Su alcance es casi todo configuración y una lista de subreddits, así que perderlo en
   marzo de 2027 cuesta poco. No se hace nada específico de Reddit fuera de su adaptador.
4. **No hay alternativas grises:** nada de scraping, endpoints `.json` sin autenticar ni
   revendedores de datos de Reddit. Van contra los términos y contra la regla de evidencia
   trazable y legítima del proyecto.

### 2. Uso declarado y datos del pedido

- **Uso:** herramienta personal, no comercial, de un solo desarrollador (fase 1 de
  `docs/VISION.md`). **No se declara como "investigación"**: según la página oficial, eso
  corresponde al programa Reddit for Researchers. Sólo lectura: no publica, no vota, no manda
  mensajes y no actúa como usuario.
- **Qué incluir en el pedido:**
  - Nombre y propósito de la app: Seedbox, radar personal que lee posts públicos de texto para
    encontrar problemas que alguien podría resolver con software.
  - Usuario de Reddit del responsable y el `User-Agent` que se usará
    (`seedbox/0.1 by <usuario>`).
  - Lista concreta de subreddits (la de H15).
  - Volumen: una corrida diaria, del orden de 50 consultas por día; muy por debajo del límite.
  - Qué se guarda: título, texto, autor, fecha, link, puntaje y número de comentarios de posts
    públicos. No se guardan comentarios, datos privados ni perfiles.
  - Cómo se muestra: sólo para el autor, detrás de usuario y clave; toda cita enlaza al post
    original.
  - Borrados: se compromete a borrar lo que el usuario elimine en Reddit (ver Consecuencias).
  - IA: los posts se analizan con Claude para extraer problemas; **no se usan para entrenar
    ni ajustar modelos**.
  - Uso comercial: ninguno; si algún día se monetiza, se pedirá antes el acceso comercial.
- **Antes de monetizar (fase 3)** hay que revisar los términos vigentes. Esto no cambia
  respecto de ADR-0006.

### 3. Tope de posts nuevos por subreddit y por corrida (H15)

- Variable `SEEDBOX_MAX_NEW_PER_FEED`, por defecto **25**: máximo de posts útiles (después de
  los filtros de ADR-0006) que se guardan **por subreddit y por corrida**. "Feed" en vez de
  "subreddit" porque el mismo tope sirve para cada sitio de Stack Exchange (H16).
- Si hay más candidatos que el tope, se guardan los de más comentarios (ver punto 4) y, a
  igualdad, los más recientes.
- **Lo que queda fuera del tope se pierde, no se posterga:** la fecha de corte es por fuente
  (ADR-0006), así que el día siguiente no vuelve a pedir esos posts. Lo aceptamos: el radar
  busca dolores repetidos, no cada post. El log de `ingest` informa, por subreddit, traídos,
  descartados por el tope e insertados.
- Por qué 25: con 10–14 subreddits son como mucho 250–350 posts por día, el mismo orden que la
  primera ingesta de Hacker News (500 posts). Sin tope, la primera corrida traería hasta 300
  posts por subreddit (3 páginas de 100). El analista procesa hoy unos 60 posts por día, así
  que el tope no busca igualar la capacidad (eso lo resuelve el reparto del punto 5), sino
  evitar avalanchas. Si el balance de H10 muestra que la cola crece, se baja el tope.
- Hacker News es un solo feed y no se le aplica el tope (conserva su `maxPages = 5`).

### 4. Métricas de actividad: dejar que maduren antes de ingerir (H11)

Revisado en el código:

- **Hacker News sí guarda actividad:** `metadata.points` y `metadata.numComments`
  (`src/lib/sources/hackernews.ts`). Reddit guarda `metadata.score` y `metadata.numComments`
  (`src/lib/sources/reddit.ts`).
- **Las dos se leen una sola vez, al ingerir, y nunca se actualizan** (`ingest` usa
  `onConflictDoNothing`). Hacker News también pide sólo lo posterior al último post guardado
  (`search_by_date` con `created_at_i > since`), así que, salvo la primera ingesta, **los posts
  de Hacker News también llegan con actividad cercana a cero**, no sólo los de Reddit.
- Hoy la extracción se reparte por antigüedad (`published_at` ascendente) sin mirar la fuente.

Decisión:

1. **Ingerir con retraso.** Cada adaptador sólo guarda posts con al menos
   `SEEDBOX_INGEST_MIN_AGE_HOURS` horas de publicados, por defecto **24**. Los más nuevos se
   dejan para la corrida siguiente; como la fecha de corte es el último post guardado, no se
   pierden. En Hacker News es un filtro más en `numericFilters`; en Reddit, saltar los posts
   demasiado nuevos del listado `/new`. Con 24 horas la actividad ya refleja casi todo el
   interés que el post va a recibir, sin consultas extra ni columnas nuevas. El radar es diario,
   así que un día de demora no cambia nada.
2. **No comparar entre fuentes.** La actividad sólo ordena dentro de una misma fuente. Entre
   fuentes manda el reparto del punto 5, así que no hace falta normalizar puntos de Hacker News
   contra puntaje de Reddit.
3. **Métrica de orden:** número de comentarios primero (indica que otros se reconocen en el
   problema y existe en todas las fuentes), luego puntos o puntaje y, a igualdad, el más
   reciente. Una fuente sin métricas se ordena sólo por fecha.

### 5. Reparto del lote de extracción entre fuentes (H11)

1. **Partes iguales.** El lote de `L` posts se divide en partes iguales entre las fuentes con
   pendientes. Si una fuente tiene menos pendientes que su parte, lo que sobra se reparte entre
   las demás. La proporción documentada en el skill y en `docs/deploy.md` es "partes iguales
   por fuente". No es por subreddit: el tope del punto 3 ya equilibra dentro de Reddit.
2. **Dentro de cada fuente**, primero los envejecidos (punto 6) y luego por la métrica del
   punto 4.

Se descartó el reparto proporcional al volumen: le daría casi todo el lote a la fuente con más
pendientes, que es justo lo que H11 quiere evitar.

### 6. Nada queda postergado: N = 14 días (H11)

- Variable `SEEDBOX_MAX_PENDING_DAYS`, por defecto **14**.
- **Posts:** un post pendiente con `fetched_at` de hace más de N días es "envejecido". Los
  envejecidos ocupan **hasta la mitad** de la parte de su fuente en cada lote, del más antiguo
  al más nuevo. La otra mitad queda para los de más señal. Así la cola de envejecidos siempre
  baja y el orden por señal sigue teniendo efecto.
- **Oportunidades:** una oportunidad sin evaluar cuyo `created_at` es de hace más de N días
  entra primero al lote de evaluación, de la más antigua a la más nueva. El resto se ordena por
  autores distintos y luego por puntaje parcial, como pide H11. Las reevaluaciones de
  oportunidades viejas (30 días, ADR-0005) van después de las nunca evaluadas.
- Por qué 14: con unos 60 posts por día, la cola actual de unos 440 se vacía en unos 8 días
  sin entrada nueva. 14 días deja margen para que el orden por señal decida casi siempre y
  acota la espera a dos semanas, que para un radar de tendencias sigue siendo reciente. Si en
  la vista de H10 la mayor parte del lote son envejecidos, la capacidad no alcanza: se resuelve
  con H13 o con más rondas, no cambiando N.

## Alternativas consideradas

- **Seguir con ADR-0006 tal cual:** ya no describe cómo se obtiene el acceso y, si el cierre se
  confirma, deja una fuente planificada que no puede existir.
- **Endpoints `.json` públicos, scraping o proveedores de terceros:** responden 403 o violan los
  términos, y los proveedores pueden perder el acceso en el mismo cierre.
- **Devvit:** sirve para apps que corren dentro de una comunidad, no para leer muchas
  comunidades desde un servicio externo.
- **Refrescar la actividad de los pendientes antes de repartirlos:** da métricas actuales, pero
  suma consultas a cada API, un job nuevo y otro punto de falla. Ingerir con retraso consigue
  casi lo mismo sin piezas nuevas.
- **Normalizar la actividad entre fuentes** (percentiles o z-score por fuente): más preciso en
  teoría, pero innecesario si las fuentes no compiten por el mismo lugar del lote, y difícil de
  explicar en el tablero.
- **Reparto proporcional al volumen de pendientes:** la fuente más grande acapara el lote.
- **Envejecidos sin límite dentro del lote:** garantiza el plazo, pero con una cola grande el
  orden vuelve a ser sólo por antigüedad y H11 deja de tener efecto.
- **Tope sólo en la primera corrida:** evita la avalancha inicial, pero no un día con mucha
  actividad. Un tope fijo es más simple de explicar.

## Consecuencias

- ADR-0006 queda modificada: el paso "crear la app y configurar las variables" ahora requiere
  aprobación previa, y la decisión de seguir con Reddit depende de confirmar si todavía se
  reciben pedidos. `docs/deploy.md` (paso 3) lo advierte.
- Si Reddit no está disponible, H15 no puede cumplirse tal como está escrita. El PO decide si
  la cancela y saca a H16 de espera; H14 sigue siendo la línea base para medir cualquier fuente
  nueva.
- Variables nuevas, todas opcionales y documentadas en `docs/deploy.md` cuando se implementen:
  `SEEDBOX_MAX_NEW_PER_FEED` (25), `SEEDBOX_INGEST_MIN_AGE_HOURS` (24) y
  `SEEDBOX_MAX_PENDING_DAYS` (14).
- Ingerir con retraso es un cambio de ingesta (H11), no del analista. Afecta también a Hacker
  News: la primera corrida después del cambio no trae los posts de las últimas 24 horas, que
  llegan al día siguiente.
- Los posts pendientes de antes del cambio (unos 440 de la primera ingesta de Hacker News)
  conservan las métricas que tenían al ingerirse, que ya habían madurado. No hace falta
  migración.
- Borrados en Reddit: si hay acceso, la historia de fase 3 para revisar y borrar lo eliminado
  en Reddit (ADR-0006) se adelanta antes de monetizar. Mientras tanto, el compromiso del pedido
  se cumple a mano: ante un aviso de Reddit o del autor, se borra el post.
- Fuentes consultadas (secundarias, 2026-11-04):
  - Anuncio de la Responsible Builder Policy (espejo de r/redditdev):
    <https://r.datuan.dev/r/redditdev/comments/1oug31u/introducing_the_responsible_builder_policy_new/noc31sg>
  - <https://www.techrepublic.com/article/news-reddit-rss-public-api-shutdown/>
  - <https://ppc.land/reddit-to-halt-public-data-api-access-in-march-2027-as-14-000-apps-register/>
  - <https://winbuzzer.com/2026/10/01/reddit-to-end-feed-reader-updates-and-public-api-access-for-apps-a002-xcxwbn/>
  - <https://www.how2shout.com/news/reddit-rss-public-api-shutdown-dates.html>
  - <https://bigideasdb.com/reddit-api-shutdown-2027>
  - <https://www.redditapis.com/blogs/reddit-data-api-2026>
  - <https://apify.com/foxlabs/reddit-subreddit-posts-scraper/changelog>
  - <https://en.wikipedia.org/wiki/Reddit_API_controversy>
