# Desplegar Seedbox en Railway

Seedbox usa **tres servicios** en un mismo proyecto de Railway:

| Servicio | Qué es | Configuración |
|---|---|---|
| **Postgres** | Base de datos | Plantilla de Railway |
| **web** | El sitio (Next.js) | `railway.json` |
| **pipeline** | Job diario: `ingest → extract → cluster → assess` | `railway.cron.json` |

`web` y `pipeline` salen del mismo repositorio; sólo cambia el archivo de configuración.

## 1. Proyecto y base de datos

1. En Railway, **New Project → Deploy from GitHub repo** y elige `fguzman01/Seedbox`.
   Ese primer servicio será `web`. Si te pide rama, usa `main` (después de hacer merge del PR).
2. En el proyecto, **+ Create → Database → PostgreSQL**.

## 2. Servicio `web`

En el servicio que creó el repo:

1. **Settings**: renómbralo a `web` y confirma que la rama es `main`.
   Railway lee `railway.json` del repo: compila con `npm run build`, **corre las migraciones antes de
   cada despliegue** (`npm run db:migrate:deploy`), arranca con `npm run start` y usa
   `/api/health` como health check.
2. **Variables**:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia a la base del proyecto) |
   | `SEEDBOX_BASIC_AUTH` | `tu_usuario:una_clave_larga` — **obligatoria** para poder editar; protege todo el sitio |

   El sitio no necesita `ANTHROPIC_API_KEY` ni las credenciales de Reddit: eso sólo lo usa el pipeline.
3. **Settings → Networking → Generate Domain** para tener una URL pública (con HTTPS).
4. Despliega. Al abrir la URL, el navegador pedirá el usuario y la clave de `SEEDBOX_BASIC_AUTH`.

## 3. Servicio `pipeline` (cron)

1. **+ Create → GitHub Repo** y elige otra vez `fguzman01/Seedbox`. Renómbralo a `pipeline`.
2. En **Settings**, en la opción de archivo de configuración (*Config as code / Railway config file*),
   indica `/railway.cron.json`. Con eso el servicio:
   - no levanta un sitio: corre `npm run pipeline` y termina;
   - se ejecuta todos los días a las **10:17 UTC** (07:17 en Chile en horario de verano). Para
     cambiar la hora, edita `cronSchedule` en `railway.cron.json` (siempre en UTC).
3. **Variables**:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `ANTHROPIC_API_KEY` | Tu API key de Anthropic |
   | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | Ver ADR-0006 (opcional: sin ellas sólo se usa Hacker News) |
   | `SEEDBOX_SUBREDDITS` | Opcional |
   | `PIPELINE_EXTRACT_LIMIT` | Opcional: posts analizados por corrida (por defecto 100) |
   | `PIPELINE_ASSESS_LIMIT` | Opcional: oportunidades evaluadas por corrida (por defecto 10) |

4. Para probarlo sin esperar al horario, ejecútalo manualmente desde el panel del servicio y revisa
   los logs. Cada paso escribe una línea (`[ingest] …`, `[extract] …`, etc.). Si algo falla, el
   resto igual corre y la ejecución queda marcada como fallida.

## 4. Checklist

- [ ] La búsqueda web está habilitada en la organización de la Console de Anthropic (la usa `assess`).
      Si no, agrega `--no-web-search` al `startCommand` de `railway.cron.json`.
- [ ] `SEEDBOX_BASIC_AUTH` definido en `web`; sin él el sitio queda en sólo lectura.
- [ ] `GET /api/health` responde `{"status":"ok"}` (es la única ruta pública).
- [ ] La primera ejecución del pipeline muestra señales, dolores y oportunidades en el tablero.

## Costos aproximados

- **Railway:** web + Postgres + un cron diario entran en el plan de uso básico.
- **Claude:** depende del volumen. Para orientarte, con `npm run eval` (H8) ves el costo por post de
  la extracción. La evaluación con búsqueda web suma USD 10 por cada 1.000 búsquedas (hasta 5 por
  oportunidad) más los tokens de los resultados. Bajar `PIPELINE_ASSESS_LIMIT` o usar
  `SEEDBOX_*_MODEL=claude-haiku-5-5` reduce el costo.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| El despliegue de `web` falla en el pre-deploy | `DATABASE_URL` no está definida o no apunta a la base del proyecto |
| El health check falla (503) | El sitio no llega a la base de datos |
| No puedo marcar favoritas ni escribir notas | Falta `SEEDBOX_BASIC_AUTH` en `web` |
| `[ingest reddit] failed: Reddit is not configured` | Faltan las variables `REDDIT_*` en `pipeline` (Hacker News sigue funcionando) |
| `[assess] … web search` con error | Búsqueda web no habilitada en la Console de Anthropic |
