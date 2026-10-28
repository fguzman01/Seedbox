# ADR-0005: Puntaje de oportunidades

- Estado: aceptada
- Fecha: 2026-10-28

## Contexto

La visión define cinco ejes de 0 a 10 con pesos ajustables: frecuencia (25 %), intensidad (20 %),
disposición a pagar (25 %), competencia (15 %, inverso) y ajuste al constructor (15 %). Tres de
ellos se pueden derivar de los dolores que ya tenemos; los otros dos requieren mirar fuera de la
evidencia (qué productos existen, cuánto cuesta construir algo).

## Decisión

### Ejes de evidencia: calculados al consultar

Sin IA y sin costo, para que nunca queden desactualizados (igual que en ADR-0004):

| Eje | Cálculo |
|---|---|
| Frecuencia | Autores distintos en escala logarítmica: 1 → 2,9 · 3 → 5,8 · 5 → 7,5 · 10 o más → 10. Cada persona nueva suma menos que la anterior. |
| Intensidad | Promedio de los dolores con leve = 3, moderado = 6, fuerte = 10. |
| Disposición a pagar | Promedio de los dolores con ninguna = 0, implícita = 6, explícita = 10. |

### Ejes de mercado: evaluados por Claude con búsqueda web

`npm run assess` evalúa cada oportunidad con Claude (`claude-opus-5-5`, esfuerzo `medium`,
configurable con `SEEDBOX_ASSESSMENT_MODEL`) y la herramienta de búsqueda web del servidor
(`web_search_20260209`, hasta 5 búsquedas por oportunidad):

- **Competencia** (10 = nadie lo resuelve bien, 0 = mercado saturado), con la lista de
  competidores encontrados (nombre, link, nota) y una justificación.
- **Ajuste al constructor** (10 = un desarrollador con IA lo construye en pocas semanas), con
  justificación.

Los competidores sin un link `http(s)` válido se descartan: evidencia antes que opinión.
El resultado se guarda en la oportunidad con la fecha y el modelo. Se evalúan primero las
oportunidades nunca evaluadas y luego las de más de 30 días.

### Total

Promedio ponderado de los ejes disponibles. Si los ejes de mercado aún no están evaluados, los
pesos se reparten entre los ejes de evidencia y el total se marca como **parcial**.

### Pesos

Se ajustan en la interfaz y viajan en la URL (`?w=25,20,25,15,15`): no requieren base de datos,
se pueden compartir y cada usuario puede tener su perfil. Si más adelante hay cuentas, se guardan
por usuario.

## Alternativas consideradas

- **Evaluar competencia sin búsqueda web** (sólo conocimiento del modelo): más barato, pero el
  conocimiento del modelo tiene fecha de corte y no deja links verificables.
- **Que la IA puntúe los cinco ejes:** más simple, pero los tres ejes de evidencia ya se pueden
  medir; pedirlos a la IA los volvería opinión.
- **Guardar el total en la base:** obligaría a recalcular cada vez que cambian los pesos o llegan
  dolores nuevos.

## Consecuencias

- El flujo diario queda `ingest` → `extract` → `cluster` → `assess`.
- La búsqueda web tiene costo propio (USD 10 por cada 1.000 búsquedas, más los tokens de los
  resultados) y debe estar habilitada en la organización de la Console de Anthropic. Con
  `--no-web-search` la evaluación usa sólo el conocimiento del modelo y no lista competidores.
- Las fórmulas de los ejes de evidencia son una primera versión; se ajustan cuando haya datos
  reales (`src/lib/scoring.ts`).
