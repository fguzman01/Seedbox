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

### H3. Agrupar dolores en oportunidades · M · ✅ hecha
**Como** usuario **quiero** ver dolores similares agrupados **para** medir cuánta gente
comparte el mismo problema.

Criterios de aceptación:
- Dado un conjunto de dolores sin agrupar, cuando corre el agrupamiento, entonces cada dolor
  queda asignado a exactamente una oportunidad (existente o nueva).
- Cada oportunidad tiene un título y un resumen en español que describen el problema común.
- Los dolores ya agrupados no se reprocesan; los nuevos se suman a oportunidades existentes
  cuando describen el mismo problema.
- Si la IA devuelve una asignación inválida (dolor desconocido, oportunidad inexistente),
  ese dolor queda sin agrupar para el siguiente intento, sin romper el resto.
- Cada oportunidad muestra cuántos dolores, posts y autores distintos la respaldan, y su
  detalle lista todos los dolores con su cita y link a la fuente.

Notas: ver `docs/adr/0004-agrupacion-de-dolores.md`. Medir la calidad del agrupamiento queda
para una historia posterior, cuando haya datos reales.

### H4. Puntuar oportunidades · M · ✅ hecha
**Como** usuario **quiero** un puntaje por oportunidad según los ejes de la visión, con
pesos ajustables, **para** priorizar qué explorar.

Criterios de aceptación:
- Cada oportunidad tiene un puntaje 0–10 en los cinco ejes de la visión y un puntaje total
  ponderado.
- Frecuencia, intensidad y disposición a pagar se calculan de la evidencia (autores distintos y
  dolores), sin llamar a la IA.
- Competencia y ajuste al constructor los evalúa la IA con búsqueda web; cada evaluación guarda
  su justificación y los competidores encontrados con su link.
- Mientras una oportunidad no está evaluada, su total usa sólo los ejes disponibles y se marca
  como parcial.
- Los pesos se pueden ajustar en la interfaz; las oportunidades se reordenan por el total.
- El detalle de una oportunidad muestra el desglose por eje, las justificaciones y los
  competidores.

Notas: ver `docs/adr/0005-puntaje-de-oportunidades.md`. Era tamaño S; pasó a M al sumar la
evaluación con búsqueda web.

### H5. Tablero de oportunidades · M · ✅ hecha
**Como** usuario **quiero** un tablero visual con cards ordenadas por puntaje, filtros (por
vertical, entre otros) y la evidencia de cada una **para** explorar y decidir rápido.

Criterios de aceptación:
- La página inicial es el tablero: todas las oportunidades en cards, ordenadas por puntaje
  total, con "ver más" cuando hay muchas.
- Filtros combinables: vertical (varias a la vez, con la cantidad de oportunidades de cada
  una), puntaje mínimo, sólo evaluadas, sólo con señales de pago y búsqueda por texto.
- Orden alternativo: más evidencia (autores distintos) o actividad más reciente.
- Filtros, orden y pesos viven en la URL: se pueden guardar y compartir, y se mantienen al
  entrar y volver del detalle.
- Cada card muestra puntaje, ejes (con nombre al pasar el mouse), conteos de evidencia y una
  cita representativa con link a su fuente.
- Si ningún resultado cumple los filtros, se indica y se ofrece limpiarlos.
- La actividad reciente (dolores y señales) pasa a su propia página.

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
