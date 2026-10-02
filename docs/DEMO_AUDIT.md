# Error Log C1 — auditoría para la demo

Revisión del código local, 1 de octubre de 2026. La selección del vídeo y sus límites se basan en el código, no en funcionalidades previstas. Guion operativo: [DEMO_PLAN.md](../DEMO_PLAN.md).

## Propuesta de valor

**Conservar el contexto de un fallo, entenderlo y convertir el historial en una decisión de repaso.** El valor no está en contar errores: está en conectar respuesta, corrección, causa, confianza, regla, apunte y siguiente acción. Es una herramienta personal de preparación; no un corrector automático, un curso ni un predictor de aprobado.

## Arquitectura y persistencia

- Next.js 16.3.5 App Router y React 19; páginas dinámicas leen SQLite en el servidor. Los componentes cliente gestionan revisión, paneles, búsqueda, edición y marcas. Se consultaron las guías locales de componentes servidor/cliente, variables de entorno, `distDir` y CLI antes de editar.
- `src/lib/domain/`: taxonomías y contratos; `validation/`: Zod; `queries/`: consultas puras con reloj inyectado; `rules/`: siete reglas y prioridad única; `db/`: adaptadores Drizzle/better-sqlite3. No se ha cambiado el motor ni sus umbrales.
- `schema.ts`: sesiones → errores; una pieza de Writing por sesión y enlaces entre original y reescritura; carpetas → apuntes; vínculos error/apunte con apartado opcional; marcas sobre texto; espejo de notas, tarjetas y repasos Anki. Restricciones SQL y claves ajenas complementan la validación.
- SQLite local con WAL, sin cuenta ni autenticación. Ruta personal `data/errorlog.db`, configurable con `DB_FILE_OVERRIDE`. Borradores de importación y Notebook también viven en el navegador: resetear SQLite por sí solo no los borra.
- `demo.ts` ya creaba una base nueva por arranque, con ocho apuntes y ejemplos generales. Se conserva ese flujo. El nuevo estado de grabación tiene otra carpeta, otro puerto y otro build; no reutiliza el seed genérico ni modifica la base personal.
- Migraciones en `drizzle/`; backups verificados y restauración a un destino nuevo. Exportación JSON v3, CSV por consulta y Markdown/ZIP para apuntes. JSON y ZIP no equivalen a una restauración completa desde la UI.

## Inventario comprobado y valor demostrable

| Ruta / evidencia | Comportamiento real | Beneficio | Decisión editorial |
| --- | --- | --- | --- |
| `/` → `/registrar`; `registrar/page.tsx` | Sesiones, búsqueda, filtros, apertura/cierre, captura manual, detalle lateral | Centraliza la práctica y sus denominadores | Contexto breve; no rellenar formularios largos |
| `PasteEntry`, `ImportWorkspace`, `lib/import`, `db/sessionImport.ts` | Tabla/JSON, sobre con sesión, revisión, clasificación editable, validación y guardado transaccional | Ahorra transcripción sin quitar control al estudiante | Hero: una tanda → tres errores legibles |
| `repo.ts`, recibos de importación | Duplicados dentro de una sesión; reintentos con identidad de tanda | Evita repetir registros por un reintento | No gastar tiempo repitiendo el pegado; no afirmar deduplicación universal |
| `/errores`, `ErrorExplorer`, `ErrorDetailPanel` | Buscar/filtrar errores, comparar respuestas, leer regla, editar | Recupera el contexto que una nota suelta pierde | Hero: `made` → `carried out` |
| `/certezas`, `q4FalseCertainties` | Errores marcados por el estudiante como «Seguro», últimos 30 días | Permite revisar respuestas en las que confiaba | Se muestra la confianza en revisión; la lista completa queda fuera |
| `/notebook`, lector/editor, `ErrorNotebookLinks` | Markdown, carpetas, etiquetas, búsqueda con fragmentos, índice, vínculo manual a apartado y errores relacionados | Conecta explicación y práctica personal | Hero: dos errores conectados al apartado Research |
| `NotebookStudy`, `annotations` | Rotulador y colores persistentes sobre texto; selección y reconciliación tras editar | Lectura activa | Reserva para otro vídeo; selección precisa añade riesgo a una toma breve |
| Notebook autosave/drafts/import/export | Guardado automático, conflictos y recuperación, `.md` con vista previa, ZIP | Permite mantener un cuaderno durante la preparación | Importantes para el producto, poco visibles en 104 s |
| `/informe`, `q1`, `q2`, `recommendation.ts` | Causas, categorías, actividad, cobertura y una recomendación prioritaria con evidencia | Saber dónde mirar y qué hacer primero | Hero: historial → decisión |
| `rules.ts`, `measurements.ts` | Siete reglas; ventanas 30/60 días, falsas certezas siempre 30; mínimo 15 en reglas de porcentaje | Evita presentar porcentajes pequeños como patrones concluyentes | No desplegar la tabla técnica; no llamar a esto IA |
| `/ruoe`, `q3RuoeAccuracy`, `RuoeMatrix` | Precisión por part/semana, denominadores y sesiones de una celda | Leer evolución de la práctica | Hero: 8/8 y su sesión, no una nota Cambridge |
| `/writing`, `q6RewriteEfficacy` | Género, duración, bandas introducidas, original/rewrite; repetición por categoría/subcategoría/respuesta correcta | Comprobar qué sobrevive a una corrección | Dataset preparado; fuera del vídeo principal por cambio de contexto |
| `/anki`, AnkiConnect y `q7AnkiReviews` | Cola, crear/actualizar/vincular tarjetas y sincronizar repasos manualmente con Anki abierto | Lleva los errores a repaso espaciado | Mostrar la recomendación; no conectar con el Anki personal ni simular sincronización |
| Cabecera / `CommandPalette` | Ctrl+K busca errores, sesiones y apuntes | Recuperar información rápido | Alternativa para una demo larga; no abrir otro menú aquí |
| `/exportar`, `backup.ts` | Datos portables y copia SQLite verificable | El historial sigue siendo del usuario | Fuera: interrumpe la transformación principal |

## Límites que condicionan el relato

1. Las explicaciones son introducidas o importadas por el estudiante. El producto no genera reglas lingüísticas ni corrige inglés automáticamente.
2. No lee fotos ni llama a una IA. Puede copiar instrucciones para una herramienta externa, cuya salida se revisa antes de importar.
3. Los vínculos a Notebook se eligen manualmente. Dos errores juntos en un apunte permiten reconocer una repetición; no es detección semántica automática entre cualquier par de sesiones.
4. La recomendación es una regla con evidencia. No crea un calendario ni comprueba que el estudiante haya realizado la acción semanal.
5. `q2` mide errores por cada 100 ítems totales; excluye Writing de ese denominador. No es probabilidad de fallar una categoría.
6. `q3` mide aciertos registrados, no puntuación oficial del examen; Part 4 no representa aquí la escala oficial de puntos parciales.
7. En el fixture, 25 errores son elegibles para tarjeta y ninguno está convertido. La regla 4 tiene prioridad y recomienda dedicar una sesión a las tarjetas pendientes. Las falsas certezas y la concentración de colocaciones quedan en cola. No se falsifican conversiones para obtener una recomendación más vistosa.
8. La serie ficticia no demuestra eficacia educativa ni causalidad. El 100 % visible corresponde a ocho ítems, no a dominio general ni a preparación garantizada.

## Estado editorial y ajustes

El seed general no era adecuado para este relato: mezcla referencias genéricas, tiene poca continuidad semanal y contiene ejemplos lingüísticos que necesitan otra revisión (por ejemplo, una explicación de `commitment` que habla de eliminar una e inexistente y un fallo con respuesta idéntica a la corrección). El fixture de grabación usa ejemplos nuevos con opciones/contexto y respuestas distintas, sin cambiar el seed del resto de tests.

Se mantiene la identidad existente: fondo papel `#f6f5f1`, verde `#304f46`, tipografía Plex para trabajar y Source Serif para leer. El ajuste de copy del aviso de demo elimina comandos de la pantalla y conserva tanto la identificación de los datos ficticios como el aviso de reinicio. El build de producción elimina las compilaciones de desarrollo durante una toma. No se han añadido estadísticas de escaparate, overlays en la app, resultados inventados ni pantallas exclusivas para aparentar capacidades.

La comprobación visual y las incidencias de encuadre se documentan en la sección de verificación del guion. Los PNG del ensayo se generan en `test-results/`; no se inyectan captions, estilos ni resultados en el DOM de la aplicación.
