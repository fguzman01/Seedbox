# ADR-0001: Stack tecnológico

- Estado: aceptada
- Fecha: 2026-10-28

## Contexto

Seedbox lo construye y mantiene una sola persona con ayuda de agentes de IA. Necesitamos un
stack conocido, con buen soporte de tipos, que permita tener interfaz web, jobs de ingesta y
llamadas a modelos de IA en un mismo repositorio, y que se pueda desplegar en Railway (donde
ya viven otros proyectos del autor).

## Decisión

| Capa | Elección |
|---|---|
| Lenguaje | TypeScript |
| Web | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 |
| Base de datos | PostgreSQL, con `pgvector` cuando lleguemos a la agrupación (H3) |
| Acceso a datos | Drizzle ORM + drizzle-kit (migraciones SQL versionadas) |
| Validación | Zod (respuestas de APIs externas y salidas de la IA) |
| IA | API de Claude (`@anthropic-ai/sdk`) |
| Tests | Vitest |
| Jobs | Scripts `tsx` (`npm run ingest`) disparados por cron en Railway |
| Despliegue | Railway (servicio web + Postgres + cron) |

## Alternativas consideradas

- **Prisma** en vez de Drizzle: más popular, pero el tipo `vector` de pgvector sólo se
  soporta como `Unsupported`. Drizzle lo soporta nativamente y genera SQL legible.
- **Python (FastAPI) para la ingesta + Next.js para la web:** mejor ecosistema de datos,
  pero obliga a mantener dos lenguajes y dos despliegues. Se reevalúa si la parte de datos crece.
- **Una base vectorial dedicada** (Pinecone, Qdrant): innecesaria para el volumen esperado;
  pgvector evita otro servicio.

## Consecuencias

- Un solo repositorio, un solo lenguaje, un solo despliegue.
- Los jobs de ingesta se pueden correr localmente con `npm run ingest -- <fuente>`.
- Si el volumen de datos crece mucho, la ingesta podría moverse a un worker separado sin
  cambiar el modelo de datos.
