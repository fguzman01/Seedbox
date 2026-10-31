# ADR-0002: Fuentes como adaptadores y dominios de oportunidad

- Estado: aceptada
- Fecha: 2026-10-28

## Contexto

El foco inicial es **software en general**: oportunidades de cualquier vertical (pymes,
salud, educación, herramientas para desarrolladores, etc.) siempre que la solución sea un
producto de software. A futuro queremos evaluar oportunidades de otro tipo, por ejemplo
negocios físicos en una ciudad ("¿dónde conviene abrir un restaurante?"). Ese caso usa
fuentes muy distintas (reseñas geolocalizadas, datos demográficos, competencia por zona) y
otros criterios de scoring.

Además, las APIs externas cambian de condiciones con frecuencia (Reddit en 2023).

## Decisión

1. **Cada fuente es un adaptador** que implementa la interfaz `SourceAdapter`
   (`src/lib/sources/types.ts`): sabe cómo traer elementos y normalizarlos a un `RawSignal`
   común. El resto del sistema no conoce detalles de ninguna fuente.
2. **Cada adaptador declara un `domain`** (`"software"` hoy). El dominio se guarda en cada
   señal y, más adelante, en cada oportunidad.
3. **La vertical** (salud, fintech, pymes…) es una **categoría** asignada por la IA durante
   la extracción, no una restricción de la ingesta. Así el radar cubre todo el software y el
   usuario filtra por vertical en el tablero.
4. **El scoring se define por dominio.** Los ejes de `docs/VISION.md` aplican a software;
   un dominio nuevo trae su propio conjunto de ejes y pesos.

## Alternativas consideradas

- **Modelar sólo software y generalizar después:** más simple hoy, pero obligaría a migrar
  todos los datos al agregar el segundo dominio. Agregar una columna ahora cuesta casi nada.
- **Modelar ya ubicación, zonas, etc.:** prematuro; no sabemos qué necesitará ese dominio.

## Consecuencias

- Agregar una fuente = escribir un adaptador + registrarlo en `src/lib/sources/index.ts`.
- Agregar un dominio = nuevos adaptadores + un perfil de scoring, sin tocar la ingesta.
- No se construye nada específico de negocios físicos hasta que la fase 1 funcione.
