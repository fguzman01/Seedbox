# Seedbox: guía para agentes

Seedbox es un radar de oportunidades de software impulsado por IA. Lee `docs/VISION.md`
antes de proponer o implementar cualquier funcionalidad.

Antes de escribir código de Next.js, lee `AGENTS.md`: esta versión de Next.js tiene cambios
respecto de lo que conocen los modelos, y la documentación está en `node_modules/next/dist/docs/`.

## Comandos

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Ver `README.md`.

## Idioma

- Documentación, historias de usuario y comunicación: **español**.
- Código, nombres de variables, commits y comentarios en el código: **inglés**.

## Metodología

Seedbox opera con el **marco de operación autónoma** de Felipe (`MARCO.md` de fguzman01/operador). Lo
propio de este repo está en **`OPERACION.md`**: léelo antes de tomar una tarea.

- **Las tareas son GitHub Issues**; su estado son las etiquetas de `.operador.yml`
  (`estado:` `tipo:` `prio:` `riesgo:`). `docs/backlog.md` es la historia de lo hecho (H1–H18).
- **Felipe decide desde Telegram** (grupo «Seedbox · Operación») con ✅ / ❌. El operador le manda las
  tarjetas y el cierre del día; un comentario que empieza con `<!-- telegram -->` le llega al grupo.

| Rol | Agente | Responsabilidad |
|---|---|---|
| Product Owner | `product-owner` | Abre issues `estado:propuesta` como historias con criterios de aceptación |
| Arquitecto / diseñador | `architect` | Plan en cada issue `aprobada` (→ `diseñada`), ADRs, responde pedidos |
| Desarrollador | `developer` | Un issue `en-curso` por día: código + tests, PR con `Closes #N` |
| Tester / QA | `qa-tester` | Revisa con contexto limpio cada PR contra los criterios y el plan |

Además, el skill `seedbox-analyst` (`.claude/skills/seedbox-analyst/`) hace el análisis diario
con Claude Code a través de la API del sitio (ADR-0008).

Ciclo de una historia:

```
propuesta ──✅──► aprobada ──► diseñada ──✅──► en-curso ──► en-revision ──✅──► hecha
```

1. **PO** la abre como issue `estado:propuesta`. Felipe la aprueba o descarta.
2. **Arquitecto** escribe el plan en el issue (y el ADR si hace falta). Felipe aprueba el plan.
3. **Desarrollador** implementa en una rama, con tests; **QA** lo revisa antes del PR.
4. Con el CI en verde, Felipe fusiona desde Telegram. Railway despliega `main`.

## Reglas de trabajo

- Una historia por rama / PR. PRs pequeños.
- Nada se marca como terminado sin tests que pasen.
- Las decisiones técnicas relevantes se registran como ADR (`docs/adr/NNNN-titulo.md`).
- Toda oportunidad mostrada al usuario debe tener evidencia trazable (link a la fuente).
- No commitear secretos. Las API keys van en variables de entorno (`.env.local`, ignorado).
