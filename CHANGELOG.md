# Cambios

Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Cada
versión corresponde a un tag `vX.Y` en `main`; `package.json` lleva el mismo número.

## Pendiente de publicar

### Añadido

- **Notebook:** apuntes Markdown con carpetas de dos niveles, etiquetas, lector con índice,
  búsqueda FTS5, editor con vista previa, autosave y borradores recuperables. Vínculos
  manuales entre errores y apuntes o apartados, importación individual de `.md` y
  exportación de `.md` y ZIP. La demo incluye un cuaderno de ejemplo ficticio.
- **Marcas de estudio:** resaltado y subrayado en cuatro colores, guardados aparte del
  Markdown. El JSON y las copias SQLite los conservan; `.md` y ZIP exportan el texto original.

### Cambiado

- El volcado `dump.json` usa `formatVersion: 3` e incorpora la clave `notebook` con
  carpetas, apuntes, vínculos y anotaciones. El manifiesto del ZIP usa `formatVersion: 2`.
- README en inglés, como presentación del producto: qué problema resuelve, cómo funciona,
  la demo de 1:51 y el arranque. El detalle de uso pasa sin recortes a
  [docs/GUIDE.md](docs/GUIDE.md), en español como la interfaz.
- Las migraciones `0008_notebook_core`, `0009_notebook_search` y
  `0010_notebook_annotations` añaden las tablas, el índice y las marcas de estudio.
  Ejecuta `pnpm db:migrate` con la app detenida: antes guarda una copia
  verificada. Si el índice de búsqueda necesita reconstrucción, ejecuta
  `pnpm db:notebook-rebuild`.

### Notas para actualizar desde 2.0

- No hay migración inversa: conserva la copia SQLite previa para volver atrás.
- Los consumidores del JSON deben aceptar `formatVersion: 3` y la nueva clave
  `notebook`, incluidas sus `annotations`. El ZIP es una exportación portable; importar sus `.md` no reconstruye
  los vínculos con errores. La copia SQLite conserva todos los datos y relaciones.
- Notebook no carga imágenes ni representa HTML, no guarda historial de versiones y
  admite un `.md` por importación. Sigue siendo una app local sin autenticación.

## [2.0] — 2026-09-28

Versión mayor: cambia el modelo de datos (migraciones que reconstruyen tablas), se retiran
funciones y exportaciones, y la interfaz es nueva de arriba abajo.

### Cambios que rompen

- **Migra la base antes de arrancar.** Hay siete migraciones nuevas (`0001` a `0007`), y
  tres de ellas reconstruyen tablas. `pnpm db:migrate` guarda antes una copia verificada y
  no migra si la copia falla.
  No hay migraciones inversas: para volver atrás se restaura esa copia.
- **Retirado:** la comparación práctica/Anki del informe, la medición de segundos por
  error (`secs` queda a `NULL` en los errores nuevos) y la marca manual de tarjeta.
- **Exportaciones:** desaparecen los dos CSV que eran una sola fila de totales, y el
  volcado JSON guarda solo datos, sin resultados recalculables.
- **La herramienta de captura externa ya no forma parte del repositorio**, y con ella sus
  scripts de `package.json`. La app sigue aceptando el mismo JSON de sesión y errores,
  venga de donde venga.

### Añadido

- **Anki con AnkiConnect:** crear tarjetas desde la app, actualizarlas y deshacer el
  vínculo, y sincronizar el historial de repasos. La conversión solo se sella tras
  verificar la tarjeta. La pestaña Anki separa pendientes, convertidas y repasos.
  Exportación Q7 con los repasos y fallos por categoría.
- **Importar una tanda con cabecera:** pegar sesión y errores juntos (hasta 300), revisar la
  cabecera propuesta y los errores, y crear todo en una sola transacción. Si se reintenta
  el guardado, la tanda no se duplica. Si faltan los ítems y aciertos, la revisión los pide
  antes de guardar.
- **Sesiones sin formato de examen** para ejercicios del libro que no siguen una tarea de
  Cambridge: sin Part, cuentan en el informe y en Anki, y quedan fuera de la precisión RUOE.
- **Vista Errores** para buscar en todos los fallos, y búsqueda global con Ctrl/⌘+K.
- **Interfaz v5:** cabecera y paleta de comandos, lista y detalle de sesiones, revisión
  de tandas por filas con contador de pendientes, franja con la recomendación de la semana,
  matriz RUOE con leyenda, y la tabla de errores apilada en tarjetas en pantallas estrechas.
- Búsqueda de texto con índice FTS5 de trigramas.

### Cambiado

- Taxonomía cerrada también en la interfaz: la categoría se elige de la lista.
- Tildes y textos revisados en toda la interfaz y en los mensajes del servidor.
- Aviso de no afiliación en el README.

### Corregido

- Importaciones seguras de reintentar y búsquedas indexadas.
- Accesibilidad: página actual marcada en la navegación, errores de Writing asociados a
  sus campos y tabla de errores que sigue siendo tabla al convertirse en tarjetas.

## [1.2] — 2026-09-16

Importación masiva de correcciones, demo reproducible y copias de seguridad.

## [1.1] — 2026-09-14

CRUD completo, con corrección de filas de error y de sesiones pasadas.

## [1.0] — 2026-09-14

Registro de errores del C1 completo, con motor de decisión, seis consultas, Writing y
exportación.

## [0.5] — 2026-09-14

Writing con las cuatro bandas, Q6 y exportación CSV/JSON.

## [0.4] — 2026-09-14

Informe con la tabla de decisión, RUOE, Anki y Falsas certezas.

## [0.3] — 2026-09-14

Vista Registrar con variantes de rejilla y tarjeta, validación de cabecera y captura por
teclado.

## [0.2] — 2026-09-14

Motor de reglas con guarda de muestra mínima, umbrales de vigilancia y prioridad.

## [0.1] — 2026-09-14

Esquema Drizzle con invariantes, Zod, seed y las seis consultas puras con tests.

[2.0]: https://github.com/JuanCardesa/error-log-c1/compare/v1.2...develop
[1.2]: https://github.com/JuanCardesa/error-log-c1/compare/v1.1...v1.2
[1.1]: https://github.com/JuanCardesa/error-log-c1/compare/v1.0...v1.1
[1.0]: https://github.com/JuanCardesa/error-log-c1/compare/v0.5...v1.0
[0.5]: https://github.com/JuanCardesa/error-log-c1/compare/v0.4...v0.5
[0.4]: https://github.com/JuanCardesa/error-log-c1/compare/v0.3...v0.4
[0.3]: https://github.com/JuanCardesa/error-log-c1/compare/v0.2...v0.3
[0.2]: https://github.com/JuanCardesa/error-log-c1/compare/v0.1...v0.2
[0.1]: https://github.com/JuanCardesa/error-log-c1/releases/tag/v0.1
