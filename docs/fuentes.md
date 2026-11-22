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
- **Términos de uso:** leídos por Felipe el 2026-11-04: API Terms of Use (<https://stackoverflow.com/legal/api-terms-of-use>) y Acceptable Use Policy; detalle y riesgo aceptado en ADR-0010. Cláusula amplia contra herramientas de ML: Stack Exchange puede cortar la clave sin aviso.
- **Evidencia trazable:** sí, link a la pregunta, con autor y licencia.
- **Decisión / motivo:** primera fuente no técnica. Sitios medidos y no activados: expatriates, parenting, freelancing (poca actividad); `pm` sin medir.

## Descartadas

### Reddit
- **Estado:** descartada (issue #7; ADR-0006 y ADR-0009)
- **Público:** pymes, freelancers, profesionales (r/smallbusiness, r/freelance…): el público que se busca.
- **Volumen aproximado:** alto (no medido: nunca se obtuvo acceso).
- **Acceso:** Data API con aprobación previa para uso no comercial; Reddit rechazó el pedido de Felipe.
- **Términos de uso:** Términos de la Data API; el artículo oficial (<https://support.reddithelp.com/hc/es-es/articles/14945211791892>) lo leyó Felipe el 2026-11-04 (ver ADR-0009). Reportes de terceros sobre el cierre del Data API, no verificados en fuente oficial.
- **Evidencia trazable:** sí, cada post tiene permalink.
- **Decisión / motivo:** acceso rechazado. Sólo se reabre con un dato nuevo (Reddit cambia la política o ofrece otra vía de acceso).

### Reseñas de apps: Apple App Store
- **Estado:** descartada (explorador, 2026-11-22)
- **Público:** usuarios comunes de apps de todo tipo (salud, finanzas, trabajo, hogar).
- **Volumen aproximado:** no medido (no se llegó a probar el acceso).
- **Acceso:** sin API oficial de reseñas de apps ajenas; sólo feeds RSS no documentados o scraping.
- **Términos de uso:** Apple Media Services Terms (<https://www.apple.com/legal/internet-services/itunes/>, leído el 2026-11-22), sección F: prohíbe «scrape, copy, or perform measurement, analysis, or monitoring of, any portion of the Content or Services» con procesos automatizados. Los feeds RSS no se mencionan, pero el análisis automatizado cae en esa cláusula.
- **Evidencia trazable:** parcial (link estable por reseña no verificado).
- **Decisión / motivo:** los términos oficiales prohíben el análisis automatizado. Se reabre si Apple ofrece una vía oficial o Felipe acepta el riesgo.

### Reseñas de apps: Google Play
- **Estado:** descartada (explorador, 2026-11-22)
- **Público:** usuarios comunes de apps de todo tipo.
- **Volumen aproximado:** no medido.
- **Acceso:** la API oficial (Play Developer API) sólo da reseñas de las apps propias; para las ajenas sólo hay scraping.
- **Términos de uso:** Google Play Terms of Service (<https://play.google.com/about/play-terms/>, leído el 2026-11-22): contenido «for your personal, non-commercial use only», prohíbe redistribuirlo y recolectar datos personales de usuarios. La política de reseñas está en una página aparte que no se leyó.
- **Evidencia trazable:** parcial (link por reseña no verificado).
- **Decisión / motivo:** sin acceso oficial a reseñas ajenas y con términos restrictivos. Misma condición de reapertura que Apple.

### CFPB Consumer Complaint Database (quejas financieras, EE. UU.)
- **Estado:** descartada (explorador, 2026-11-22)
- **Público:** consumidores de EE. UU. con quejas de tarjetas, créditos, cobranzas, cuentas bancarias, hipotecas.
- **Volumen aproximado:** la API pública respondió sin clave el 2026-11-22; la base tiene 19,3 millones de quejas (`total_record_count`) y se actualiza a diario. No se pudo medir el volumen de las últimas semanas: los filtros de fecha devolvieron totales inconsistentes.
- **Acceso:** API pública y descarga CSV (<https://files.consumerfinance.gov/ccdb/complaints.csv.zip>), sin clave ni costo. La respuesta de la API declara licencia CC0.
- **Términos de uso:** «All complaint data we publish is freely available for anyone to use, analyze, and build on» (<https://www.consumerfinance.gov/data-research/consumer-complaints/>, leído el 2026-11-22). El contenido del CFPB es de dominio público (<https://www.consumerfinance.gov/privacy/website-privacy-policy/>, leído el 2026-11-22).
- **Evidencia trazable:** sí en la clasificación (cada queja tiene `complaint_id`), pero **sin texto libre**: la referencia oficial de campos (<https://cfpb.github.io/api/ccdb/fields.html>) no lista ningún campo de narrativa y las respuestas de la API (con `has_narrative=true`) no traen ninguno. Sólo trae producto, tipo de problema, empresa y estado.
- **Decisión / motivo:** la licencia es la mejor de todas las fuentes revisadas, pero sin la historia de la persona el radar no puede extraer dolores (sólo categorías). Se reabre si la API publica las narrativas (o si Felipe quiere usar sólo las categorías como señal de volumen).

## Candidatas

Quedan sin investigar a fondo las ideas del issue H24 que siguen (el explorador las revisa en las
próximas corridas). Última corrida: 2026-11-22.

### Bluesky (publicaciones públicas)
- **Estado:** candidata (explorador, 2026-11-22)
- **Público:** general y mixto (el grueso en inglés, también español); no hay comunidades por tema de dolor, así que la señal por post es baja.
- **Volumen aproximado:** no medido.
- **Acceso:** `app.bsky.feed.searchPosts`; no se pudo comprobar si exige cuenta (el host público respondió 403 desde esta sesión).
- **Términos de uso:** Terms of Service (<https://bsky.social/about/support/tos>, leídos el 2026-11-22): no mencionan scraping, acceso automatizado ni uso para IA; remiten a las Community Guidelines y la Privacy Policy, que no se leyeron. No verificado el resto.
- **Evidencia trazable:** sí (cada post tiene `at://` URI y link en bsky.app).
- **Decisión / motivo:** se deja sin proponer: falta saber si la búsqueda exige cuenta (decisión de Felipe) y el público no es claramente masivo para dolores. Revisar de nuevo con acceso a docs.bsky.app.


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
