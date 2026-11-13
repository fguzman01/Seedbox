# Catálogo de fuentes

Lo mantiene el explorador de fuentes (`.claude/agents/source-scout.md`, H24). Cada fuente es una
entrada con los mismos campos. Los estados son:

- **candidata**: encontrada, todavía sin investigar a fondo o con datos por verificar.
- **recomendada**: investigada, cumple las reglas; el explorador propone implementarla (máximo 1 por semana).
- **descartada**: no se usa, con el motivo. No se vuelve a proponer sin un dato nuevo.
- **activa**: ya se ingiere (ADR de la fuente).

Reglas que se miran en cada entrada: público masivo y no técnico primero; evidencia trazable (link a
cada post, `CLAUDE.md`); términos leídos **sólo en la fuente oficial** y con link (si no se pudo leer,
«no verificado»). El explorador no acepta términos, no paga ni crea cuentas: eso es de Felipe.

## Plantilla

```
### <Fuente>
- **Estado:** candidata | recomendada | descartada | activa
- **Público:** quién habla y de qué
- **Volumen aproximado:** posts por semana o mes, y cómo se midió
- **Acceso:** API oficial / datos abiertos / otro; costo; aprobación previa
- **Términos de uso:** resumen, link oficial y fecha de lectura (o «no verificado»)
- **Evidencia trazable:** sí/no (link a cada post)
- **Decisión / motivo:** …
```

## Activas

### Hacker News
- **Estado:** activa (ADR-0002)
- **Público:** técnico (desarrolladores, fundadores de startups).
- **Volumen aproximado:** ver «De dónde viene el radar» en `/activity` (H14).
- **Acceso:** API pública de Algolia / Firebase, sin clave ni costo.
- **Términos de uso:** no revisados por el explorador todavía.
- **Evidencia trazable:** sí, cada ítem tiene su link en news.ycombinator.com.
- **Decisión / motivo:** fuente inicial. Aporta sólo público técnico: es el sesgo que H24 busca compensar.

### Stack Exchange (softwarerecs, webapps, money, workplace, academia)
- **Estado:** activa (ADR-0010, activada el 2026-11-04)
- **Público:** mixto: finanzas personales, trabajo y vida académica, además de software.
- **Volumen aproximado:** ~115 preguntas al mes en los 5 sitios activos (medido el 2026-11-04; mínimo de 10 preguntas en 30 días por sitio).
- **Acceso:** API pública con clave gratuita registrada (10.000 consultas por día con clave).
- **Términos de uso:** leídos por Felipe el 2026-11-04 (API Terms of Use y Acceptable Use Policy); detalle y riesgo aceptado en ADR-0010. Cláusula amplia contra herramientas de ML: Stack Exchange puede cortar la clave sin aviso.
- **Evidencia trazable:** sí, link a la pregunta, con autor y licencia.
- **Decisión / motivo:** primera fuente no técnica. Sitios medidos y no activados: expatriates, parenting, freelancing (poca actividad); `pm` sin medir.

## Descartadas

### Reddit
- **Estado:** descartada (issue #7; ADR-0006 y ADR-0009)
- **Público:** pymes, freelancers, profesionales (r/smallbusiness, r/freelance…): el público que se busca.
- **Volumen aproximado:** alto (no medido: nunca se obtuvo acceso).
- **Acceso:** Data API con aprobación previa para uso no comercial; Reddit rechazó el pedido de Felipe.
- **Términos de uso:** Términos de la Data API; el artículo oficial lo leyó Felipe el 2026-11-04 (ver ADR-0009). Reportes de terceros sobre el cierre del Data API, no verificados en fuente oficial.
- **Evidencia trazable:** sí, cada post tiene permalink.
- **Decisión / motivo:** acceso rechazado. Sólo se reabre con un dato nuevo (Reddit cambia la política o ofrece otra vía de acceso).

## Candidatas

Primera tanda, **sin investigar**: son ideas del issue H24 que el explorador debe verificar en su
primera corrida. Ningún campo de términos ni volumen está leído todavía.

### Reseñas de apps (tiendas de aplicaciones)
- **Estado:** candidata
- **Público:** usuarios comunes de apps de todo tipo (salud, finanzas, trabajo, hogar).
- **Volumen aproximado:** por medir.
- **Acceso:** por investigar (las tiendas suelen exigir cuenta o aprobación; eso lo decide Felipe).
- **Términos de uso:** no verificado.
- **Evidencia trazable:** por verificar (¿link estable a cada reseña?).
- **Decisión / motivo:** una queja de una app es un dolor concreto de gente no técnica.

### Otros sitios de Stack Exchange no técnicos
- **Estado:** candidata
- **Público:** cocina, hogar, bricolaje, salud, derecho, trabajo u otros (por elegir).
- **Volumen aproximado:** por medir con `filter=total`, como en ADR-0010 (mínimo de 10 preguntas en 30 días).
- **Acceso:** la misma API y clave que ya están activas.
- **Términos de uso:** ya leídos para Stack Exchange (ADR-0010).
- **Evidencia trazable:** sí.
- **Decisión / motivo:** costo mínimo de implementación si hay sitios con volumen. Es ampliar una fuente activa, no una fuente nueva.

### Comunidades y foros en español, de oficios y de trabajo
- **Estado:** candidata
- **Público:** trabajadores, oficios, pymes de habla hispana.
- **Volumen aproximado:** por medir.
- **Acceso:** por investigar.
- **Términos de uso:** no verificado.
- **Evidencia trazable:** por verificar.
- **Decisión / motivo:** el radar hoy está casi todo en inglés.

### APIs públicas y datos abiertos (reclamos, consultas ciudadanas)
- **Estado:** candidata
- **Público:** ciudadanos y consumidores (reclamos, trámites).
- **Volumen aproximado:** por medir.
- **Acceso:** datos abiertos (suele ser gratuito y sin aprobación); por confirmar.
- **Términos de uso:** no verificado (licencia de cada portal).
- **Evidencia trazable:** por verificar.
- **Decisión / motivo:** las licencias abiertas resuelven la duda de términos que pesó en ADR-0010.

## Rutina semanal del explorador (la crea Felipe)

La rutina no es un archivo del repo: la crea Felipe en Claude Code, con el repo `fguzman01/Seedbox`
y el **entorno con internet completo** del evaluador (H19), porque necesita leer los términos y las
páginas de cada fuente.

- **Horario:** domingo ~02:00 (hora de Chile), en la ventana libre de la madrugada (`OPERACION.md` §5). Su propuesta es un issue `estado:propuesta`: Felipe la aprueba con ✅ y el `architect` (01:13 diario) la diseña desde entonces.
- **Modelo:** sonnet.
- **Prompt:**

  > Eres el explorador de fuentes de Seedbox en el repositorio fguzman01/Seedbox. Entra a su carpeta y
  > parte de origin/main. Sigue al pie de la letra `.claude/agents/source-scout.md` (puedes invocarlo
  > como el agente «source-scout»). Investiga fuentes nuevas de público masivo, actualiza
  > `docs/fuentes.md` y abre un PR hacia main con título «[explorador] fuentes <fecha>». Propón como
  > mucho 1 fuente como issue `estado:propuesta`. No aceptes términos, no pagues ni crees cuentas.
  > Termina con 3 líneas.
