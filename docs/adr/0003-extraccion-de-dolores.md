# ADR-0003: Extracción de dolores con Claude

- Estado: aceptada
- Fecha: 2026-10-28

## Contexto

La historia H2 convierte cada señal (un post) en cero o más **dolores** estructurados. Es el
primer uso de IA del proyecto y fija tres cosas: cómo pedimos la respuesta, qué modelo usamos y
cómo cumplimos el principio de evidencia antes que opinión.

## Decisión

1. **Salida estructurada.** Usamos `client.beta.messages.parse` con un esquema Zod
   (`src/lib/pains.ts`). La respuesta llega validada; si no se puede parsear, la señal queda
   `pending` y se reintenta en la siguiente corrida.
2. **Modelo configurable.** Por defecto `claude-opus-5-5` con `effort: "low"`: es una tarea de
   extracción, no de razonamiento profundo. Se cambia con la variable `SEEDBOX_EXTRACTION_MODEL`
   (por ejemplo `claude-haiku-5-5`, mucho más barato) sin tocar código. Cada dolor guarda el
   modelo que lo extrajo, para comparar calidad entre modelos.
3. **Citas verificadas.** Cada dolor trae una cita textual del post. Antes de guardarlo,
   comprobamos que la cita realmente aparece en el post (sin distinguir mayúsculas, espacios
   ni tipo de comillas). Si no aparece, el dolor se descarta: preferimos perder un dolor a
   mostrar uno inventado.
4. **Idioma.** Descripción y persona en español; la cita, en el idioma original.
5. **Contenido no confiable.** El post se envía delimitado como datos y el prompt de sistema
   indica ignorar instrucciones dentro de él.
6. **Rechazos.** Se activa el *fallback* del servidor (`fallbacks: "default"`). Si aun así el
   modelo rechaza el post, se trata como una señal sin dolores (`discarded`).

## Alternativas consideradas

- **Herramienta (tool use) en vez de salida estructurada:** más código para el mismo resultado.
- **Haiku como valor por defecto:** más barato, pero la calidad de la extracción define todo lo
  que viene después (agrupación, scoring). Arrancamos con Opus en esfuerzo bajo y medimos;
  cambiar es una variable de entorno.
- **Batch API (50 % más barato):** conviene cuando el volumen crezca; hoy el volumen diario de
  "Ask HN" es bajo y la latencia del batch complica la iteración.

## Consecuencias

- `npm run extract` procesa las señales pendientes (por defecto 50, con 4 en paralelo).
- Las señales `processed` o `discarded` nunca se reprocesan. Para reprocesar tras cambiar el
  prompt, hay que volver a marcarlas `pending`.
- Falta un conjunto de evaluación para medir la calidad de la extracción; queda como historia
  pendiente cuando haya datos reales.
