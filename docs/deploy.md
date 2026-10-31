# Desplegar Seedbox (Railway + Claude Code, sin costos extra de IA)

Seedbox queda repartido en dos lugares (ver [ADR-0008](adr/0008-analista-claude-code.md)):

| Dónde | Pieza | Qué hace | Costo |
|---|---|---|---|
| Railway | **web** | El sitio: tablero, detalle, favoritas y notas | Tu plan de Railway |
| Railway | **Postgres** | La base de datos | Tu plan de Railway |
| Railway | **ingest** (cron diario) | Trae los posts nuevos de Hacker News y Reddit | Tu plan de Railway |
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
   Railway lee `railway.json` del repo: compila, **corre las migraciones antes de cada
   despliegue**, arranca el sitio y usa `/api/health` como health check.
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

## 3. Railway: recolección diaria de posts

1. **+ Create → GitHub Repo** → `fguzman01/Seedbox` otra vez. Renómbralo a `ingest`.
2. En **Settings**, en la opción del archivo de configuración (*Config as code / Railway config
   file*), indica `/railway.cron.json`. Con eso el servicio corre `npm run ingest` todos los días a
   las **10:17 UTC** (07:17 en Chile en horario de verano) y termina.
3. **Variables**:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | Opcional (ver ADR-0006); sin ellas sólo se usa Hacker News |
   | `SEEDBOX_SUBREDDITS` | Opcional |

4. Ejecútalo una vez a mano desde el panel y revisa los logs: deberías ver
   `[hackernews] fetched=… inserted=…`. Si no configuraste Reddit, verás un aviso de que falta;
   es normal.

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

## Checklist

- [ ] `GET https://<tu-sitio>/api/health` responde `{"status":"ok"}`.
- [ ] El sitio pide usuario y clave; con ellos puedes marcar favoritas y escribir notas.
- [ ] La primera ejecución de `ingest` muestra posts insertados.
- [ ] Una sesión de Claude Code puede correr `npm run agent -- status` y ve trabajo pendiente.
- [ ] Después de la primera corrida del analista aparecen oportunidades en el tablero, con
      "Evaluado … con claude-code".

## Uso de la suscripción

Cada corrida procesa por defecto hasta 2 lotes de 30 posts, agrupa los dolores nuevos y evalúa 5
oportunidades con búsqueda web. Si notas que consume demasiado de tu plan, pide al analista lotes
más chicos (por ejemplo `--limit 15`) o córrelo día por medio.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| El despliegue de `web` falla en el pre-deploy | `DATABASE_URL` no está definida o no apunta a la base del proyecto |
| El health check falla (503) | El sitio no llega a la base de datos |
| No puedo marcar favoritas ni escribir notas | Falta `SEEDBOX_BASIC_AUTH` en `web` |
| El analista recibe `404` | Falta `SEEDBOX_AGENT_TOKEN` en `web` |
| El analista recibe `401` | El token del entorno de Claude Code no coincide con el de `web` |
| El analista no llega al sitio (error de red) | El dominio no está en *Allowed domains* del entorno, o falta `SEEDBOX_URL` |
| `[reddit] failed: Reddit is not configured` | Faltan las variables `REDDIT_*` en `ingest` (Hacker News sigue funcionando) |

## Alternativa: análisis con la API de Claude (pago por uso)

Si algún día prefieres no depender de la suscripción, el pipeline completo con la API sigue
disponible: cambia el `startCommand` de `railway.cron.json` a `npm run pipeline` y agrega
`ANTHROPIC_API_KEY` al servicio. Costos y detalles en ADR-0003, ADR-0004 y ADR-0005.
