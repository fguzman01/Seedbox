# Seedbox: guía para agentes

Seedbox es un radar de oportunidades de software impulsado por IA. Lee `docs/VISION.md`
antes de proponer o implementar cualquier funcionalidad.

## Idioma

- Documentación, historias de usuario y comunicación: **español**.
- Código, nombres de variables, commits y comentarios en el código: **inglés**.

## Metodología

Trabajamos con un flujo ágil liviano, ejecutado por agentes con roles definidos en
`.claude/agents/`:

| Rol | Agente | Responsabilidad |
|---|---|---|
| Product Owner | `product-owner` | Prioriza el backlog, escribe historias con criterios de aceptación |
| Arquitecto | `architect` | Decisiones técnicas, registra ADRs en `docs/adr/` |
| Desarrollador | `developer` | Implementa una historia a la vez, con tests |
| Tester / QA | `qa-tester` | Verifica criterios de aceptación, escribe tests de integración/e2e |

Ciclo de una historia:

1. **PO** toma una necesidad y la escribe en `docs/backlog.md` con formato
   *Como… quiero… para…* + criterios de aceptación verificables.
2. **Arquitecto** interviene sólo si la historia requiere una decisión técnica nueva.
3. **Desarrollador** implementa en una rama, con tests unitarios.
4. **QA** valida contra los criterios de aceptación y reporta hallazgos.
5. El humano (Felipe) revisa y aprueba el merge.

## Reglas de trabajo

- Una historia por rama / PR. PRs pequeños.
- Nada se marca como terminado sin tests que pasen.
- Las decisiones técnicas relevantes se registran como ADR (`docs/adr/NNNN-titulo.md`).
- Toda oportunidad mostrada al usuario debe tener evidencia trazable (link a la fuente).
- No commitear secretos. Las API keys van en variables de entorno (`.env.local`, ignorado).
