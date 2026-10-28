# Backlog

Ordenado por prioridad. Mantenido por el agente `product-owner`.

## Fase 0: Fundaciones

- [x] Documento de visión (`docs/VISION.md`)
- [x] Metodología y agentes (`CLAUDE.md`, `.claude/agents/`)
- [x] ADR-0001: stack tecnológico (`docs/adr/0001-stack-tecnologico.md`)
- [x] ADR-0002: fuentes como adaptadores y dominios (`docs/adr/0002-fuentes-y-dominios.md`)
- [x] Esqueleto del proyecto con lint, typecheck, tests y CI.

## Fase 1: Radar personal

### H1. Ingestar posts de Hacker News · M · ✅ hecha
**Como** usuario **quiero** que el sistema recolecte periódicamente posts y comentarios de
Hacker News **para** tener materia prima donde buscar dolores.

Criterios de aceptación:
- Dado un job programado, cuando se ejecuta, entonces guarda posts nuevos sin duplicar los existentes.
- Cada registro guarda fuente, URL, autor, fecha y texto.

Notas: se usan los posts "Ask HN" vía la API de Algolia. Los comentarios quedan para una
historia futura si los posts no bastan.

### H2. Extraer dolores con IA · M · ✅ hecha
**Como** usuario **quiero** que cada post se analice para extraer dolores concretos **para**
no tener que leerlos todos.

Criterios de aceptación:
- Cada dolor extraído tiene: descripción, quién lo sufre, cita textual, link al post y
  **vertical** (pymes, salud, educación, devtools, etc.; ver ADR-0002).
- Los posts sin dolor se marcan como descartados y no se reprocesan.

Notas: ver `docs/adr/0003-extraccion-de-dolores.md`. Además de lo pedido, cada dolor guarda
intensidad y disposición a pagar (insumos para H4), y se descartan los dolores cuya cita no
aparece en el post.

### H3. Agrupar dolores en oportunidades · M
**Como** usuario **quiero** ver dolores similares agrupados **para** medir cuánta gente
comparte el mismo problema.

### H4. Puntuar oportunidades · S
**Como** usuario **quiero** un puntaje por oportunidad según los ejes de la visión, con
pesos ajustables, **para** priorizar qué explorar.

### H5. Tablero de oportunidades · M
**Como** usuario **quiero** un tablero visual con cards ordenadas por puntaje, filtros (por
vertical, entre otros) y la evidencia de cada una **para** explorar y decidir rápido.

### H6. Ingestar Reddit · M
Igual que H1, para una lista configurable de subreddits.

### H8. Evaluar la calidad de la extracción · S · 🟡 herramienta lista, falta etiquetar
**Como** usuario **quiero** un conjunto de posts reales con los dolores esperados **para**
medir si un cambio de prompt o de modelo mejora o empeora la extracción.

Criterios de aceptación:
- Al menos 30 posts reales etiquetados a mano (con y sin dolores).
- Un comando que corre la extracción sobre ellos y reporta aciertos, falsos positivos y costo.

Notas: ver `evals/extraction/README.md`. Listo: formato del dataset, `npm run eval:sample`,
página `/labeling` (solo en desarrollo) y `npm run eval` con precisión, recall, vertical y
costo. Pendiente: etiquetar 30+ posts reales y registrar la primera línea base.

### H7. Guardar y anotar oportunidades · S
**Como** usuario **quiero** marcar oportunidades como favoritas y agregar notas **para**
llevar seguimiento de las que me interesan.
