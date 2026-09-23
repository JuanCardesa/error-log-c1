# Anki

## Conectar

1. En Anki abre Herramientas → Complementos → Descargar complementos e instala
   [AnkiConnect (2055492159)](https://ankiweb.net/shared/info/2055492159).
2. Reinicia Anki y deja abierto el perfil de tu colección.
3. En Error Log abre Anki y pulsa Sincronizar. Con Anki cerrado puedes seguir
   registrando errores y consultar los datos de la última sincronización.

La conexión es local y sale del servidor; la clave no llega al navegador. Demo y e2e
no pueden acceder a Anki personal. Los e2e usan su propio doble HTTP.

## Configuración del servidor

| Variable | Valor predeterminado |
| --- | --- |
| `ANKI_CONNECT_URL` | `http://127.0.0.1:8765`; solo direcciones locales |
| `ANKI_SOURCE_DECK` | `English B2 to C1 Practice` |
| `ANKI_TARGET_DECK` | `<mazo origen>::Error Log` |
| `ANKI_CONNECT_API_KEY` | sin clave; dejar sin definir si no se necesita |
| `ANKI_ROLLOVER_HOUR` | sin declarar; se supone 4 |
| `ANKI_BATCH_SIZE` | 250 cartas por petición; máximo 2000 |
| `ANKI_SYNC_BUDGET_MS` | 180000 ms; máximo 3600000 |

Los mazos admiten hasta 256 caracteres, la clave 1024 y la URL 2048, sin caracteres
de control. La URL acepta HTTP/HTTPS local, sin credenciales ni consulta; puertos 1–65535.
Los nombres y claves declarados no pueden estar vacíos.

El corte horario es «next day starts at» en Anki. Un repaso a la 1:30 pertenece al
día anterior si el corte es 4:00. La versión de AnkiConnect verificada no expone ese
dato: declara `ANKI_ROLLOVER_HOUR` si usas otro corte. La app distingue una hora
configurada de una supuesta; conserva también la lectura de preferencias si el
complemento la admite. Los cálculos usan la zona local del servidor.

## Crear, actualizar y deshacer

Crear en Anki usa el tipo propio **Error Log C1** con los campos `ErrorLogId`, `Prompt`,
`MyAnswer`, `Correct`, `Rule` y `Meta`. Crea el mazo destino si falta. No altera modelos
anteriores y rechaza un modelo propio que tenga otros campos.

Cada error se identifica con el UUID de la base y su ID. Se busca por campo y tag
antes de crear, por lo que repetir tras un tiempo de espera agotado recupera la nota
existente. Solo se marca la conversión tras verificar la identidad y al menos una tarjeta.

Editar un error no reescribe su nota. Una huella del contenido confirmado permite
avisar de cambios locales y ofrecer Actualizar en Anki. La actualización verifica
los campos recibidos; no cambia tags, mazo ni programación. Si cambias la categoría,
las estadísticas de Anki siguen usando sus etiquetas originales.

La conversión solo se sella tras verificarla; ya no hay marca manual. Las marcas de
versiones anteriores se conservan, cuentan como convertidas y se señalan como no
verificadas. Deshacer quita el vínculo local y devuelve el error a la cola sin borrar
la nota de Anki.
Volver a crearla recupera su identidad. Borrar un error tampoco borra su nota.

## Sincronización y estadísticas

Se lee el historial completo de las cartas de los mazos origen y destino y sus submazos,
por lotes. Las notas vinculadas se verifican también fuera de esos mazos: mover no equivale
a borrar. Las notas borradas confirmadas devuelven sus errores a pendientes.

El espejo local se sustituye en una transacción. Incluye importaciones antiguas,
retira repasos deshechos y excluye de las estadísticas cartas borradas o fuera del
alcance. Conserva metadatos de notas vistas para reconocerlas si vuelven.

Q7 muestra repasos, cartas distintas y fallos: `Again` es fallo; `Hard`, `Good` y `Easy`
son aciertos. Se separan los lapsos de repaso (tipo 1) y los fallos restantes. Se excluyen
registros manuales, reprogramaciones y respuestas inválidas. Q7 se lee en la pestaña Anki
y no altera las siete reglas del informe.

Las etiquetas se asignan a una categoría principal mediante el mapeo de
`src/lib/anki/categories.ts`. Q7 tiene CSV; el JSON exporta el espejo y sus resultados.
Para recuperar toda la app, usa una copia SQLite: [copias y recuperación](../README.md#copias-y-recuperación).

## Protecciones y límites

- La primera creación o sincronización fija perfil, URL y mazos de esta base.
  Para otra colección usa una base nueva mediante `DB_FILE_OVERRIDE`.
- La identidad de cada nota vinculada se comprueba antes de guardar. Si desaparecen
  todas y hay al menos tres vínculos, se aborta. Si realmente las borraste, deshaz
  sus conversiones antes de volver a sincronizar.
- Restaurar una base antigua puede reutilizar IDs. Una nota más de cinco minutos
  anterior al error provoca rechazo. Es una detección heurística, no una identidad
  universal de colección. Renombrar otra colección con el mismo perfil no basta
  para identificarla; tampoco se garantiza una escritura atómica por perfil.
- Las lecturas que expiran se reintentan dos veces. Las escrituras no se reintentan
  automáticamente. Plazos: 5 s para consultas breves, 15 s para escribir, 60 s por lote.
  El presupuesto global incluye esperas; si se agota, el espejo no se confirma.
- No se responden tarjetas ni se modifica el planificador. Las escrituras explícitas
  crean el modelo, el mazo o la nota necesarios, o actualizan los campos de una nota
  vinculada.

Las pruebas automatizadas usan dobles de AnkiConnect y SQLite real. No demuestran
compatibilidad con todas las versiones del complemento. Las cifras y verificaciones
históricas están en el historial de Git y en la
[auditoría del 22 de septiembre](AUDIT-2026-09-22.md).
