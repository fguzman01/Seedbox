# ADR-0008: Análisis con Claude Code en vez de la API de Claude

- Estado: aceptada
- Fecha: 2026-10-31
- Modifica: ADR-0003, ADR-0004 y ADR-0005 (quién ejecuta el análisis, no cómo se valida)

## Contexto

Extraer dolores, agrupar y evaluar oportunidades usa la API de Claude, que se paga por uso y
aparte de la suscripción de Claude. El autor quiere no sumar gastos de IA a lo que ya paga
mensualmente: una suscripción de Claude y un plan de Railway.

Claude Code, incluido en la suscripción, puede hacer el mismo análisis, y sus tareas
programadas pueden correrlo a diario sin que nadie lo dispare.

## Decisión

1. **Railway hace lo que no usa IA:** el sitio, la base de datos y la recolección diaria de
   posts (`npm run ingest`, servicio cron). Desde Railway se llega a Hacker News y Reddit.
2. **Claude Code hace el análisis** con la suscripción, en una tarea programada diaria que sigue
   el skill `.claude/skills/seedbox-analyst`.
3. **El analista no toca la base de datos.** Pide trabajo y entrega resultados a una API del
   sitio:
   - `GET /api/agent/work?kind=status|extract|cluster|assess&limit=N`
   - `POST /api/agent/results` con `{ kind, model?, results | output }`

   El comando `npm run agent` envuelve esas llamadas.
4. **Misma validación que el modo API.** El sitio aplica el mismo código que el pipeline de la
   API: verificación de citas (`keepVerifiedPains`), referencias de agrupamiento
   (`resolveClustering`) y competidores con link (`normalizeAssessment`). Las reglas de análisis
   que recibe el analista son las mismas constantes que usa la API (`EXTRACTION_RULES`, etc.).
5. **Token propio.** La API exige `SEEDBOX_AGENT_TOKEN` (como `Authorization: Bearer` o
   `X-Seedbox-Agent-Token`, comparado en tiempo constante) y queda fuera de la autenticación
   básica del sitio. Sin la variable, la API responde 404.
6. **Lotes chicos.** 30 posts, 20 dolores y 5 oportunidades por pedido como valores por
   defecto, para no gastar de golpe los límites de uso de la suscripción.
7. **El modo API se mantiene** (`npm run pipeline`) para quien prefiera pagar por uso a cambio
   de una ejecución más automática.

## Alternativas consideradas

- **Que Claude Code se conecte directo a Postgres:** obliga a exponer la base de datos a
  internet y duplica la validación fuera del sitio.
- **Un plan gratuito de otro proveedor (Gemini) o un modelo local:** gratis, pero con menor
  calidad en español, límites diarios estrictos y, en el caso local, depende de un computador
  encendido.

## Consecuencias

- El análisis consume los límites de uso de la suscripción; los lotes se ajustan con `--limit`.
- El análisis es tan confiable como la tarea programada: si una corrida falla, el trabajo queda
  pendiente y la siguiente lo retoma (nada se marca como hecho sin resultados válidos).
- El entorno de Claude Code necesita acceso de red a la URL del sitio y el token como secreto
  (ver `docs/deploy.md`).
- Cada resultado guarda `model = "claude-code"`, así se distingue del modo API en el sitio y en
  la evaluación (H8).
