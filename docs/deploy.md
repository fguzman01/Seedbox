# Desplegar Seedbox (Railway + Claude Code, sin costos extra de IA)

Seedbox queda repartido en dos lugares (ver [ADR-0008](adr/0008-analista-claude-code.md)):

| Dónde | Pieza | Qué hace | Costo |
|---|---|---|---|
| Railway | **web** | El sitio: tablero, detalle, favoritas y notas | Tu plan de Railway |
| Railway | **Postgres** | La base de datos | Tu plan de Railway |
| Railway | **ingest** (cron diario) | Trae los posts nuevos de Hacker News, Reddit y Stack Exchange | Tu plan de Railway |
| Claude Code | **Analista** (tarea programada diaria) | Pide al sitio el trabajo pendiente, lo analiza y devuelve los resultados | Tu suscripción de Claude |

No se usa la API de Claude ni hace falta `ANTHROPIC_API_KEY`.

## Antes de empezar: dos claves que inventas tú

Anótalas en un lugar seguro (un gestor de contraseñas). **No las pegues en el chat.**

1. **Clave del sitio** (`SEEDBOX_BASIC_AUTH`), con la forma `usuario:clave`, por ejemplo
   `felipe:una-frase-larga-que-no-uses-en-otro-lado`. Es lo que escribirás en el navegador.
2. **Token del analista** (`SEEDBOX_AGENT_TOKEN`): una cadena larga y aleatoria, al menos 32
   caracteres. Puedes generarla con `openssl rand -hex 32` o con tu gestor de contraseñas.

## 1. Código en `main`

Haz merge del pull request en GitHub para que todo el código quede en `main`.

## 2. Railway: proyecto, base de datos y sitio

1. En Railway, **New Project → Deploy from GitHub repo** → `fguzman01/Seedbox`. Ese primer
   servicio será el sitio: en **Settings** renómbralo a `web` y confirma que la rama es `main`.
   Railway lee `railway.json` del repo: compila y arranca con `scripts/railway-start.mjs`, que
   **aplica las migraciones** (crean las tablas la primera vez y no hacen nada si ya están al día)
   y luego levanta el sitio. Ese mismo archivo lo usan todos los servicios del repo; cada uno elige
   su rol con la variable `SEEDBOX_SERVICE` (sin ella, es el sitio).
2. En el proyecto, **+ Create → Database → PostgreSQL**.
3. En `web` → **Variables**:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `SEEDBOX_BASIC_AUTH` | Tu clave del sitio (`usuario:clave`) |
   | `SEEDBOX_AGENT_TOKEN` | Tu token del analista |

4. `web` → **Settings → Networking → Generate Domain**. Anota la URL, por ejemplo
   `https://seedbox-production.up.railway.app`.
5. Abre la URL: el navegador te pedirá usuario y clave. El tablero aparecerá vacío.
6. Opcional: `web` → **Settings → Deploy → Healthcheck Path** = `/api/health`, para que Railway no
   publique un despliegue que no llega a la base de datos.

## 3. Railway: recolección diaria de posts

1. **+ Create → GitHub Repo** → `fguzman01/Seedbox` otra vez. Renómbralo a `ingest`.
2. **Variables**:

   | Variable | Valor |
   |---|---|
   | `SEEDBOX_SERVICE` | `ingest` (sin esto, el servicio levantaría otra copia del sitio) |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | Opcional (ver ADR-0006); sin ellas sólo se usa Hacker News |
   | `SEEDBOX_SUBREDDITS` | Opcional |
   | `STACKEXCHANGE_KEY`, `SEEDBOX_SE_SITES` | Opcional; ver "Stack Exchange (opcional)" más abajo |

   > **Reddit requiere aprobación previa.** Crear la app en `reddit.com/prefs/apps` ya no basta:
   > Reddit tiene que aprobar el acceso antes de que funcionen las credenciales, y se informa que
   > dejó de recibir pedidos nuevos el 31-10-2026. Antes de pedirlo, revisa
   > [ADR-0009](adr/0009-acceso-a-reddit-y-reparto-entre-fuentes.md).

3. **Settings → Deploy → Cron Schedule** = `17 10 * * *`: corre todos los días a las **10:17 UTC**
   (07:17 en Chile en horario de verano), recolecta y termina.
4. Despliega y revisa el log: deberías ver `[seedbox] starting as "ingest"`, `Migrations applied` y
   `[hackernews] fetched=… inserted=…`. Si no configuraste Reddit verás
   `[reddit] skipped: Reddit is not configured`; es normal. Lo mismo con
   `[stackexchange] skipped: Stack Exchange is not configured` mientras no la actives.

### Stack Exchange (opcional)

Lee preguntas de sitios no técnicos (Software Recommendations, Personal Finance & Money, etc.).
No necesita aprobación previa, sólo una clave gratuita.

1. Antes de activarla, cumple las condiciones de
   [ADR-0010](adr/0010-fuente-stack-exchange.md): términos leídos y "Help improve Claude"
   desactivado en la cuenta del analista.
2. Entra con tu cuenta de Stack Exchange a <https://stackapps.com/apps/oauth/register> y
   registra una app: nombre `Seedbox`, descripción "Radar personal de sólo lectura", dominio
   OAuth = el dominio de tu sitio en Railway, sitio web = la URL del repo. Copia la **Key** (no
   hace falta el *client secret*).
3. En `ingest` → **Variables**:

   | Variable | Valor |
   |---|---|
   | `STACKEXCHANGE_KEY` | La *Key* de tu app en Stack Apps. Sin ella, Stack Exchange no se usa |
   | `SEEDBOX_SE_SITES` | Opcional. Sitios separados por coma, con el nombre que usa la API (`softwarerecs,webapps,money,workplace,academia,freelancing,expatriates,parenting` por defecto) |

4. En el próximo log de `ingest` deberías ver, por sitio,
   `[stackexchange] money fetched=… filtered=… capped=… inserted=…` y, al final,
   `[stackexchange] deletion check: checked=… missing=… deleted=…`: cuántas preguntas se
   quitaron por haber sido borradas en Stack Exchange (`missing` son las que faltaron por
   primera vez; se borran si vuelven a faltar en la corrida siguiente).

Reglas que aplica (ADR-0009 y ADR-0010): sólo preguntas con al menos
`SEEDBOX_INGEST_MIN_AGE_HOURS` horas (24 por defecto), como mucho `SEEDBOX_MAX_NEW_PER_FEED`
por sitio y corrida (25 por defecto, las de más respuestas primero), la primera corrida trae
como máximo 8 días y se descartan las preguntas con puntaje negativo. Las citas de Stack
Exchange muestran autor, pregunta, sitio y licencia CC BY-SA, como pide la licencia.

## 4. Claude Code: permitir el acceso al sitio

El analista corre en un entorno de Claude Code en la nube, que por defecto no puede llegar a tu
sitio. En claude.ai/code, abre el menú del entorno en la barra de título de la sesión → **Edit**:

1. **Network access**: en *Allowed domains*, agrega el dominio de tu sitio (sólo el dominio, por
   ejemplo `seedbox-production.up.railway.app`). Deja marcada la opción de los administradores de
   paquetes.
2. **El token**, de una de estas dos formas:
   - **Network secrets** (recomendado, si tu app lo muestra): un secreto para ese dominio que
     inyecte el encabezado `X-Seedbox-Agent-Token` con tu token. El token nunca queda visible para
     la sesión.
   - O una **variable de entorno** `SEEDBOX_AGENT_TOKEN` con tu token.
3. **Variable de entorno** `SEEDBOX_URL` con la URL completa de tu sitio, por ejemplo
   `https://seedbox-production.up.railway.app`.

Los cambios se aplican en las sesiones nuevas. Documentación de Claude Code sobre esto:
<https://code.claude.com/docs/en/cloud-environments#network-access>.

## 5. Claude Code: la tarea programada del analista

Con lo anterior listo, pídele a Claude (en una sesión de este repositorio) que cree la tarea
diaria, o créala tú desde la sección de rutinas de claude.ai/code con este repositorio y este
mensaje:

> Ejecuta el skill seedbox-analyst: procesa el trabajo pendiente de Seedbox (extraer, agrupar y
> evaluar) y termina con un resumen.

Horario sugerido: una hora después de la recolección, por ejemplo **11:23 UTC** (08:23 en Chile).

Para probarlo antes de programarlo, abre una sesión nueva en el entorno y pide lo mismo. El
resumen final dice cuántos posts procesó, cuántos dolores se descartaron por validación y cuántas
oportunidades se crearon y evaluaron.

### Dónde ver si el analista está corriendo

En el sitio, **Actividad** (`/activity`) → **Estado del analista** muestra, por tipo de trabajo
(extraer, agrupar, evaluar), cuántos ítems quedan pendientes y cuándo llegó la última entrega,
más el balance de los últimos 7 días: posts ingresados contra posts procesados y si a ese ritmo
la cola crece o baja. Si pasan más de 36 horas sin entregas, el tablero y esa página muestran
el aviso **"El análisis está detenido"**: revisa la tarea programada. La vista sólo muestra
conteos y fechas.

Más abajo, **De dónde viene el radar** muestra por fuente (y por subreddit en Reddit o por sitio en
Stack Exchange) los posts
ingresados, procesados y descartados y los dolores de los últimos 30 días, con su reparto por
vertical. Cada `ingest` deja registrada su corrida por fuente: una fuente que el último `ingest`
omitió por falta de variables aparece como **"no configurada"**.

## Checklist

- [ ] `GET https://<tu-sitio>/api/health` responde `{"status":"ok"}`.
- [ ] El sitio pide usuario y clave; con ellos puedes marcar favoritas y escribir notas.
- [ ] La primera ejecución de `ingest` muestra posts insertados.
- [ ] Una sesión de Claude Code puede correr `npm run agent -- status` y ve trabajo pendiente.
- [ ] Después de la primera corrida del analista aparecen oportunidades en el tablero, con
      "Evaluado … con claude-code".
- [ ] En `/activity`, "Estado del analista" muestra la fecha de la última entrega de cada tipo.

## Uso de la suscripción

Cada corrida procesa por defecto hasta 2 lotes de 30 posts, agrupa los dolores nuevos y evalúa 5
oportunidades con búsqueda web. Si notas que consume demasiado de tu plan, pide al analista lotes
más chicos (por ejemplo `--limit 15`) o córrelo día por medio. El balance de 7 días en `/activity`
dice si con ese ritmo la cola crece o baja. Si lo corres día por medio, verás el aviso de
análisis detenido entre corridas (umbral de 36 horas).

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| El sitio no arranca y el log dice `DATABASE_URL is not set` o `Migration failed` | `DATABASE_URL` no está definida o no apunta a la base del proyecto |
| El health check falla (503) | El sitio no llega a la base de datos o las tablas no existen |
| La página dice "This page couldn't load" y el log `relation … does not exist` | Las migraciones no corrieron: revisa que el despliegue use el `railway.json` actual |
| No puedo marcar favoritas ni escribir notas | Falta `SEEDBOX_BASIC_AUTH` en `web` |
| El analista recibe `404` | Falta `SEEDBOX_AGENT_TOKEN` en `web` |
| El analista recibe `401` | El token del entorno de Claude Code no coincide con el de `web` |
| El analista no llega al sitio (error de red) | El dominio no está en *Allowed domains* del entorno, o falta `SEEDBOX_URL` |
| Aviso "El análisis está detenido" | La tarea programada no corrió o falló en las últimas 36 horas: revisa sus ejecuciones en claude.ai/code |
| `[reddit] skipped: Reddit is not configured` (en `/activity`, Reddit "no configurada") | Faltan las variables `REDDIT_*` en `ingest` (Hacker News sigue funcionando) |
| `[stackexchange] skipped: Stack Exchange is not configured` | Falta `STACKEXCHANGE_KEY` en `ingest` (las demás fuentes siguen) |
| `no site found for name …` | Un nombre de `SEEDBOX_SE_SITES` no existe; usa el parámetro `site` de la API (p. ej. `money`, no `personalfinance`) |
| `throttle_violation` o `backoff too long` | Stack Exchange pidió frenar; la corrida de mañana sigue sola. Si se repite, revisa que no haya otra app usando la misma clave |
| `key is not valid` | La clave está mal copiada o la app se borró en Stack Apps |
| El log de `ingest` dice `next start` o `Ready in …` | Falta `SEEDBOX_SERVICE=ingest` en ese servicio: está levantando otra copia del sitio |

## Alternativa: análisis con la API de Claude (pago por uso)

Si algún día prefieres no depender de la suscripción, el pipeline completo con la API sigue
disponible: en el servicio `ingest` cambia `SEEDBOX_SERVICE` a `pipeline` y agrega
`ANTHROPIC_API_KEY`. Costos y detalles en ADR-0003, ADR-0004 y ADR-0005.
