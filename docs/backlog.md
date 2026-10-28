# Backlog

Ordenado por prioridad. Mantenido por el agente `product-owner`.

## Fase 0: Fundaciones

- [x] Documento de visión (`docs/VISION.md`)
- [x] Metodología y agentes (`CLAUDE.md`, `.claude/agents/`)
- [ ] **ADR-0001: stack tecnológico.** Propuesta inicial: Next.js + TypeScript + Tailwind,
      Postgres (con `pgvector` para agrupar dolores similares), API de Claude para
      extracción y síntesis, despliegue en Railway. Pendiente de confirmar.
- [ ] Esqueleto del proyecto con lint, tests y CI.

## Fase 1: Radar personal

### H1. Ingestar posts de Hacker News · M
**Como** usuario **quiero** que el sistema recolecte periódicamente posts y comentarios de
Hacker News **para** tener materia prima donde buscar dolores.

Criterios de aceptación:
- Dado un job programado, cuando se ejecuta, entonces guarda posts nuevos sin duplicar los existentes.
- Cada registro guarda fuente, URL, autor, fecha y texto.

### H2. Extraer dolores con IA · M
**Como** usuario **quiero** que cada post se analice para extraer dolores concretos **para**
no tener que leerlos todos.

Criterios de aceptación:
- Cada dolor extraído tiene: descripción, quién lo sufre, cita textual y link al post.
- Los posts sin dolor se marcan como descartados y no se reprocesan.

### H3. Agrupar dolores en oportunidades · M
**Como** usuario **quiero** ver dolores similares agrupados **para** medir cuánta gente
comparte el mismo problema.

### H4. Puntuar oportunidades · S
**Como** usuario **quiero** un puntaje por oportunidad según los ejes de la visión, con
pesos ajustables, **para** priorizar qué explorar.

### H5. Tablero de oportunidades · M
**Como** usuario **quiero** un tablero visual con cards ordenadas por puntaje, filtros y la
evidencia de cada una **para** explorar y decidir rápido.

### H6. Ingestar Reddit · M
Igual que H1, para una lista configurable de subreddits.

### H7. Guardar y anotar oportunidades · S
**Como** usuario **quiero** marcar oportunidades como favoritas y agregar notas **para**
llevar seguimiento de las que me interesan.
