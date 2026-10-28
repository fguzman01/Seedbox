# Seedbox

Radar de oportunidades de software impulsado por IA: detecta dolores reales del mercado,
los agrupa, los puntúa y los muestra como ideas accionables con evidencia trazable.

- Visión y roadmap: [`docs/VISION.md`](docs/VISION.md)
- Backlog: [`docs/backlog.md`](docs/backlog.md)
- Decisiones técnicas: [`docs/adr/`](docs/adr/)
- Metodología y agentes (PO, arquitecto, desarrollador, QA): [`CLAUDE.md`](CLAUDE.md)

Estado: **fase 1 en curso**. H1 (ingesta de Hacker News) y H2 (extracción de dolores con IA) listas.

## Desarrollo local

Requisitos: Node 22 y PostgreSQL 16.

```bash
npm install
cp .env.example .env          # ajusta DATABASE_URL y TEST_DATABASE_URL
npm run db:migrate            # crea las tablas
npm run ingest                # recolecta señales de todas las fuentes
npm run ingest -- hackernews  # o de una fuente específica
npm run extract               # extrae dolores de las señales pendientes (requiere ANTHROPIC_API_KEY)
npm run extract -- --limit 10 # procesa solo 10
npm run dev                   # http://localhost:3000
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera los tipos de rutas y corre `tsc` |
| `npm test` | Vitest (los tests de base de datos usan `TEST_DATABASE_URL`; se omiten si no está) |
| `npm run db:generate` | Genera una migración SQL a partir de `src/lib/db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones pendientes |

## Estructura

```
src/
  app/                 # interfaz web (Next.js App Router)
  lib/
    db/                # esquema Drizzle y conexión
    sources/           # adaptadores de fuentes (uno por fuente, ver ADR-0002)
    ingest.ts          # guarda señales nuevas sin duplicar
    pains.ts           # esquema de un dolor (verticales, intensidad, disposición a pagar)
    extraction.ts      # extracción de dolores con Claude (ADR-0003)
    process.ts         # procesa las señales pendientes
scripts/               # CLIs de ingesta y extracción, pensados para correr por cron
drizzle/               # migraciones SQL versionadas
```
