# Preferencias de Felipe sobre las fichas de oportunidad

Lo mantiene el evaluador (`seedbox-evaluator`, H20, ADR-0013) a partir de los issues `tipo:oportunidad`:
✅ = quiere explorarla (cerrado `completed` o `estado:hecha`, o en la cola con `estado:aprobada`); ❌ = descartada
(cerrado `not_planned` o `estado:descartada`). Se actualiza sólo cuando hay decisiones nuevas, por PR (pide ✅ de
Felipe). Cada ficha cita la versión usada. Si no dejó motivo se anota «sin motivo»; no se inventa.

## Decisiones

| Oportunidad #id | Título | Decisión | Motivo | Fecha |
|---|---|---|---|---|
| Oportunidad #8 | Difícil comparar el valor de las suscripciones de IA para programar | ❌ descartada (issue #18; antes ✅ aprobada) | sin quién pague: comparadores y trackers existentes son gratis y el ingreso mínimo no cierra; evitar herramientas para desarrolladores donde la alternativa gratuita ya resuelve el problema | 2026-11-17 |
| Oportunidad #2 | Pérdida de contexto y visibilidad al trabajar con varios agentes de código | ✅ aprobada (`estado:aprobada`, issue #20) | sin motivo | 2026-11-11 |
| Oportunidad #13 | Fundadores tempranos sin estrategia de distribución | ❌ descartada (issue #21; antes ✅ aprobada) | dolor difuso y sin precio verificado; el resultado depende de la ejecución del fundador y el mercado de consejos está saturado | 2026-11-17 |
| Oportunidad #19 | Límites de uso y soporte deficiente en suscripciones de IA | ❌ descartada (issue #19) | sin motivo | 2026-11-11 |
| Oportunidad #36 | Cuentas de GitHub suspendidas sin vía de apelación | ❌ descartada (issue #22) | sin motivo | 2026-11-11 |
| Oportunidad #42 | Desconfianza en la verificación de agentes de código más allá del camino feliz | ✅ aprobada (`estado:aprobada`, issue #28) | sin motivo | 2026-11-11 |
| Oportunidad #4 | Riesgo de seguridad por el acceso amplio de los agentes de código | ❌ descartada (issue #29) | nicho técnico ya cubierto gratis (sandboxes open source y Docker) | 2026-11-17 |
| Oportunidad #76 | Herramientas de desarrollo que envían datos a terceros sin consentimiento | ❌ descartada (issue #30) | nicho técnico y sin quién pague (voluntad de pago baja, alternativas gratuitas) | 2026-11-17 |
| Oportunidad #67 | Incertidumbre sobre brechas de datos tras nuevas vulnerabilidades | ✅ aprobada (`estado:aprobada`, issue #37) | sin motivo | 2026-11-15 |
| Oportunidad #41 | Medir de dónde llega la audiencia de un blog técnico | ❌ descartada (issue #38) | nicho técnico y baja viabilidad (mercado chico y cubierto) | 2026-11-17 |
| Oportunidad #1 | Procesos de equipo obsoletos con código generado por IA | ❌ descartada (issue #39) | nicho técnico | 2026-11-17 |
| Oportunidad #23 | Fatiga mental por supervisar el trabajo de la IA | ❌ descartada (issue #40) | sin quién pague | 2026-11-17 |

## Patrones

- «Sin quién pague» y «nicho técnico» son los motivos dominantes (6 de 9 descartes: #8, #4, #76, #41, #1, #23): descarta cuando la alternativa gratuita ya resuelve el problema o el público es de desarrolladores sin presupuesto.
- Revirtió #8 y #13 de ✅ a ❌ tras verlas con más datos: una aprobación para explorar no es compromiso, y el precio real verificado pesa más que la afinidad con el tema.
- Sigue explorando sólo tres: #2 (visibilidad de varios agentes), #42 (integridad de pruebas de agentes) y #67 (brechas/CVE para pymes); las tres con precios reales de referencia (US$19–30/mes).
- Descarta quejas sobre el servicio de una plataforma (#19, #36) que ninguna herramienta propia puede arreglar.
- Los patrones son hipótesis (12 decisiones, casi todas sin motivo explícito) y no cambian pesos.
