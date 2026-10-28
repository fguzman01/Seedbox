# ADR-0007: Protección de acceso para un solo usuario

- Estado: aceptada
- Fecha: 2026-10-28

## Contexto

Hasta H6 la web sólo leía datos. H7 (favoritas y notas) es la primera funcionalidad que **escribe**
desde el navegador. Seedbox todavía es una herramienta personal (fase 1), sin cuentas, pero se
puede desplegar en Railway con una URL pública: sin protección, cualquiera con el link podría
modificar datos o leer las notas.

## Decisión

1. **Autenticación básica HTTP opcional para todo el sitio.** Si `SEEDBOX_BASIC_AUTH` tiene la
   forma `usuario:clave`, el `proxy.ts` de Next.js exige esas credenciales en todas las rutas
   (el navegador muestra su diálogo nativo). Sin la variable, el sitio queda abierto, que es lo
   cómodo en desarrollo local.
2. **Cada acción del servidor verifica de nuevo**, como pide la guía de seguridad de Next.js: el
   proxy puede dejar de cubrir una acción si cambia el `matcher` o si la acción se mueve de ruta.
   - En desarrollo: se permite escribir.
   - En producción sin `SEEDBOX_BASIC_AUTH`: **sólo lectura**; las acciones se rechazan.
   - En producción con `SEEDBOX_BASIC_AUTH`: la acción exige el mismo encabezado de autenticación.
3. **Comparación en tiempo constante** de las credenciales (`timingSafeEqual`).
4. **Siempre sobre HTTPS** en producción (Railway lo da por defecto): la autenticación básica
   envía las credenciales en cada petición.

## Alternativas consideradas

- **Login con sesiones o un proveedor (Auth.js, Clerk):** necesario cuando haya varios usuarios
  (fase 3), pero hoy agrega tablas, flujos y dependencias para una sola persona.
- **Escrituras sólo en desarrollo (como `/labeling`):** no sirve, porque favoritas y notas se
  usan justamente en la versión desplegada.

## Consecuencias

- Para desplegar con favoritas y notas hay que definir `SEEDBOX_BASIC_AUTH` en Railway.
- Las notas son de un único usuario. Con cuentas (fase 3), favoritas y notas pasan a ser por
  usuario y este ADR se reemplaza.
