# ADR-0006: Reddit como fuente

- Estado: aceptada
- Fecha: 2026-10-28

## Contexto

Hacker News tiene una audiencia muy técnica. Reddit suma comunidades donde dueños de pymes,
freelancers y profesionales cuentan sus problemas con su propio lenguaje (r/smallbusiness,
r/freelance, r/Entrepreneur, etc.).

Desde 2023 Reddit restringió el acceso: los endpoints `.json` públicos sin autenticar tienen
límites muy bajos y bloquean con frecuencia, y el uso de los datos está regido por los Términos
de la Data API.

## Decisión

1. **API oficial con OAuth, modo "application-only"** (`grant_type=client_credentials`). Se crea
   una app de tipo *script* en <https://www.reddit.com/prefs/apps> y se configuran
   `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` y `REDDIT_USER_AGENT`. El token se pide una vez por
   corrida y se reutiliza.
2. **Subreddits configurables** con `SEEDBOX_SUBREDDITS` (separados por coma). Por defecto:
   `SaaS, smallbusiness, Entrepreneur, freelance, startups, sysadmin`.
3. **Sólo posts de texto nuevos** (`/r/{sub}/new`), paginando hasta llegar a posts ya
   ingeridos o a un máximo de páginas por subreddit. Se descartan: fijados, eliminados o
   removidos, links sin texto, contenido para adultos y posts de AutoModerator.
4. **Mismo adaptador que Hacker News** (ADR-0002): Reddit es un `SourceAdapter` más con dominio
   `software`; el resto del flujo (extracción, agrupación, puntaje) no cambia.
5. **Una fuente que falla no frena a las demás**: `npm run ingest` sigue con la siguiente fuente,
   informa el error y termina con código de error.

## Alternativas consideradas

- **Endpoints `.json` públicos:** sin credenciales, pero inestables y fuera de lo que Reddit
  permite para uso sistemático.
- **Proveedores de datos de terceros:** más caros y con la misma incertidumbre legal.

## Consecuencias y riesgos

- **Uso comercial.** Los términos de la Data API permiten el uso no comercial gratis dentro de
  los límites (aprox. 100 consultas por minuto). **Antes de monetizar Seedbox (fase 3) hay que
  revisar los términos vigentes y, si corresponde, pedir acceso comercial a Reddit.**
- **Contenido eliminado.** Los términos exigen respetar las eliminaciones de los usuarios. Hoy
  guardamos el texto del post; en fase 3 hace falta una historia para revisar periódicamente y
  borrar lo que se eliminó en Reddit.
- **Mostrar citas.** Las citas siempre enlazan al post original, en línea con la atribución que
  piden los términos.
- Al agregar un subreddit nuevo, sólo se ingieren sus posts posteriores al último post de Reddit
  ya guardado (la fecha de corte es por fuente, no por subreddit).
