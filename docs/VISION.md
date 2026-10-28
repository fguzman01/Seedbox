# Seedbox: visión del producto

> Un radar de oportunidades de software: detecta dolores reales del mercado, los agrupa,
> los puntúa y los convierte en ideas accionables respaldadas por evidencia.

## 1. Problema

Las personas que saben construir software no suelen tener el problema de *cómo* construir,
sino *qué* construir. Las ideas que salen "de la cabeza" casi nunca están validadas. En
cambio, la gente se queja todos los días en público (foros, reseñas, redes, ofertas de
trabajo) de problemas que nadie resuelve bien. Esa señal existe, pero está dispersa y
cuesta procesarla a mano.

## 2. Propuesta

Seedbox recolecta esas señales, usa IA para extraer **dolores concretos**, los agrupa en
**oportunidades** y las puntúa según criterios explícitos. Cada oportunidad muestra la
evidencia de origen (links, citas), así que siempre se puede verificar de dónde viene.

**Principio central: evidencia antes que opinión.** La IA no "inventa ideas": resume y
ordena lo que el mercado ya está diciendo.

## 3. Usuarios

1. **Usuario 0 (fase 1):** el propio autor. Desarrollador que busca un proyecto de software
   rentable. Seedbox se construye primero para usarlo nosotros mismos (*dogfooding*).
2. **Fase 2:** indie hackers, desarrolladores freelance y equipos pequeños, con foco
   inicial en el mercado hispanohablante (poco atendido por las herramientas existentes,
   que están casi todas en inglés).

## 4. Flujo del MVP

```
Fuentes  ──►  Ingesta  ──►  Extracción IA  ──►  Agrupación  ──►  Scoring  ──►  Tablero
(Reddit,     (jobs        (dolor, quién lo    (clusters de     (fórmula      (cards con
 HN, reseñas  periódicos)  sufre, cita,        dolores          transparente) evidencia,
 de apps…)                 disposición a pagar) similares)                    filtros, notas)
```

### Fuentes candidatas (por orden de prioridad)

| Fuente | Por qué | Acceso |
|---|---|---|
| Hacker News ("Ask HN", "Who wants to be hired") | Señal técnica de calidad | API pública gratuita |
| Reddit (r/SaaS, r/smallbusiness, r/Entrepreneur, subreddits de nicho) | Quejas explícitas, "¿existe una app que…?" | API oficial (con límites) |
| Reseñas de 1–3 estrellas de apps (Google Play / App Store / G2 / Capterra) | Lo que los usuarios odian de productos que ya pagan | Scraping / proveedores |
| Product Hunt | Qué se está lanzando, saturación de nichos | API |
| Ofertas de trabajo y freelance | Tareas que las empresas pagan por hacer a mano | Varias |
| Google Trends | Tendencia de demanda | No oficial |

El MVP arranca con **una o dos fuentes** (HN + Reddit) y crece desde ahí.

### Scoring (v0, ajustable)

Cada oportunidad recibe 0–10 en cada eje y un puntaje ponderado:

| Eje | Pregunta | Peso |
|---|---|---|
| Frecuencia | ¿Cuánta gente distinta menciona este dolor? | 25 % |
| Intensidad | ¿Qué tan fuerte es la queja? ¿Hay urgencia? | 20 % |
| Disposición a pagar | ¿Hay señales de dinero (ya pagan algo, "pagaría por…")? | 25 % |
| Competencia | ¿Qué tan cubierto está por soluciones existentes? (inverso) | 15 % |
| Ajuste al constructor | ¿Lo puede construir 1 dev + IA en semanas? | 15 % |

Los pesos se exponen en la interfaz para que el usuario los ajuste a su perfil.

## 5. Fuera de alcance del MVP

- Cuentas multiusuario, pagos, planes.
- Negocios que no son de software (se evalúa en fase 3).
- Generación automática de código del producto sugerido.

## 6. Roadmap

| Fase | Objetivo | Resultado |
|---|---|---|
| 0. Fundaciones | Repo, metodología, agentes, stack | Este documento + esqueleto del proyecto |
| 1. Radar personal | Ingesta HN + Reddit, extracción, clustering, scoring, tablero | Herramienta usable por el autor |
| 2. Profundizar | Más fuentes, "deep dive" por oportunidad (competidores, tamaño, MVP sugerido), alertas semanales | Reporte semanal útil |
| 3. Producto público | Auth, planes, landing, nichos en español | Primeros usuarios pagos |
| 4. Expansión | Oportunidades fuera del software | — |

## 7. Monetización (hipótesis, a validar en fase 3)

- **Freemium:** top 5 oportunidades de la semana gratis; tablero completo, filtros y deep
  dives en plan pago.
- **Reportes de nicho:** informes puntuales por vertical (salud, legal, pymes, etc.).
- **Contenido como canal:** newsletter semanal "oportunidades de la semana" generada por la
  misma herramienta, que sirve de marketing.

## 8. Riesgos

- **Mercado con competidores** (sitios de ideas, herramientas de análisis de Reddit). La
  diferenciación es: evidencia trazable, scoring transparente y foco en español.
- **Acceso a datos:** las APIs cambian de condiciones (Reddit en 2023). Diseñar las fuentes
  como *plugins* intercambiables.
- **Costo de IA:** la extracción sobre miles de posts puede ser cara. Usar modelos pequeños
  para clasificar y modelos grandes sólo para síntesis; cachear resultados.
- **Ideas genéricas:** si el output parece un listado de blog, el producto no sirve. Medir
  con un criterio simple: *¿alguna oportunidad me dio ganas de construirla?*
