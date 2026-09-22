# Integración con Anki: revisión del plan

El diseño de capas, el transporte inyectable y la separación de `AnkiDataset` encajan
con la aplicación. Se mantienen las siete reglas y los umbrales. Estos ajustes corrigen
los puntos que podían causar pérdidas o duplicados:

- **Consultas por etapas.** `findCards` produce los IDs para `cardsInfo` y
  `getReviewsOfCards` (estas dos van en `multi`); después `notesInfo` recibe los IDs de
  nota. No se pueden enviar las cuatro consultas dependientes en un único `multi`.
- **Historial completo por lotes.** No se filtra por `-is:new`: restablecer una carta
  puede dejarla nueva y conservar su historial. Tampoco se descartan IDs inferiores a
  una marca de agua global: pueden llegar de una importación posterior.
- **Espejo atómico.** Se valida todo antes de una transacción. El espejo de cartas y
  repasos se sustituye en esa transacción, por lo que repetir la lectura no duplica
  filas y deshacer un repaso en Anki se refleja correctamente. Se conservan los
  metadatos de notas previamente vistas. Las estadísticas usan solo cartas del mazo
  origen/destino actual (incluidos submazos). No es un archivo histórico de cartas borradas.
- **Creación recuperable.** Cada base tiene un UUID persistente. El campo primero
  `ErrorLogId` y un tag identifican el error independientemente de su enunciado. Evita
  confundir dos errores con el mismo texto y permite recuperar una nota tras un timeout.
  Se comprueba el esquema de un tipo de nota ya existente y nunca se sobrescribe.
- **Un vínculo de referencia.** `error_row.anki_note_id` referencia `anki_note`; no se
  duplica el enlace en `anki_note.error_id`. Una nota puede servir a más de un error.
  `ON DELETE SET NULL` se añadió a mano al SQL generado: Drizzle no lo emitió para el
  `ALTER TABLE`. La sincronización devuelve la deuda antes de retirar la nota del espejo.
- **Perfil y alcance fijados.** El estado conserva perfil, URL y ambos mazos; se
  rechazan cambios de alcance. El perfil se vuelve a verificar antes de guardar.
  Cambiar de colección requiere otra base. Renombrar/restaurar otra colección bajo el
  mismo nombre de perfil no tiene un identificador de colección garantizado por esta API;
  no debe reutilizarse esta base para una colección distinta.
- **Borrado frente a traslado.** Las notas vinculadas se consultan por ID también fuera
  del filtro de mazo. Solo un resultado vacío confirmado devuelve la deuda. Que
  desaparezcan **todas** a la vez, habiendo tres o más, no se acepta como borrado: el
  perfil y el mazo coinciden también cuando se restaura otra colección, y desvincular
  borra `anki_added_at`, que no se reconstruye sincronizando otra vez. La sincronización
  se detiene sin escribir nada y explica cómo forzarlo con «Deshacer» si de verdad se
  han borrado esas tarjetas.
- **Tipos de revisión.** Se aceptan tipos 0–3 con botón 1–4; se excluyen manual (4),
  reprogramado (5) y registros sin respuesta. Intervalos negativos del revlog se guardan
  tal cual: representan segundos, no un número negativo de días.
- **Resultados interpretables.** Repasos y cartas distintas tienen contadores separados.
  Las categorías de Anki son aproximaciones derivadas de etiquetas. El cruce con práctica
  muestra cantidades y denominadores separados, sin alterar el motor de decisión.
- **Marca manual explícita.** Continúa contando para la regla de conversión, por
  compatibilidad. No se afirma que esa regla mida exclusivamente tarjetas verificadas.
- **Datos de prueba aislados.** Demo/e2e no pueden contactar Anki personal. Los tests
  de conexión inyectan respuestas, con SQLite real para transacciones y relaciones.

## Modelo y funcionamiento

`src/lib/anki/` contiene configuración, API con validación Zod, clasificación, conciliación,
sincronización y creación. `src/lib/db/ankiRepo.ts` contiene las escrituras del espejo;
`q7AnkiReviews` y `compareAnkiPractice` son consultas puras. No hay nuevas dependencias.

La migración `0002_anki_sync.sql` añade cuatro tablas y una columna nullable. No
reclasifica errores ni borra marcas manuales antiguas. `pnpm db:migrate` guarda antes una
copia verificada en `data/backups/`, y no migra si esa copia falla; no hay migraciones
inversas, así que volver atrás es restaurar esa copia. A la copia previa no se le exige el
esquema nuevo —por definición no lo tiene—, pero `pnpm db:backup` sí lo exige entero:
media migración no la detectan `integrity_check` ni `foreign_key_check`. `anki_sync` tiene una fila y no
necesita `last_review_id`, porque no descarta registros por antigüedad. El día de los
repasos se guarda según el calendario local del servidor, consistente con la app.

El tipo de nota nuevo tiene `ErrorLogId`, `Prompt`, `MyAnswer`, `Correct`, `Rule`, `Meta`.
Solo se muestran los últimos cinco en la tarjeta. Los campos se escapan como texto
antes de enviarlos a Anki. No se leen ni copian audio ni campos de la colección existente.

La configuración es local, sin CORS adicional ni ampliación de direcciones de escucha.
Si existe clave de AnkiConnect, se manda desde el servidor, incluso en cada subacción
de `multi`; no se registra ni llega al navegador. Las llamadas tienen timeout de 5 s
y no siguen redirecciones. Solo la acción de crear realiza escrituras en Anki.

## Verificación real pendiente

La implementación supera 448 pruebas unitarias/integración, con cobertura global
superior al 90 %, además de `typecheck`, `lint`, compilación de Next.js y 12 pruebas
de navegador de Anki, informe y exportación. Se revisaron las capturas de escritorio
y móvil. La migración sobre la base personal conserva las filas previas, con
`integrity_check = ok` y sin errores en `foreign_key_check`.

En este entorno Windows, el proceso que gestiona el servidor de Playwright quedó
esperando al cerrar. Las 12 pruebas se completaron también con salida 0 contra ese
mismo servidor de pruebas, gestionado aparte; luego se detuvo el proceso. No afecta
al funcionamiento de la app ni implica acceso de los tests a la colección personal.

AnkiConnect no estaba instalado al revisar este plan (solo figuraba Colorful Tags).
Las cifras sobre las 58 cartas, los 20 tags y las fechas de repaso proceden del plan
aportado; no son una inspección de la colección realizada en esta implementación.

Tras instalar AnkiConnect, sincronizar debe permitir consultar el historial disponible.
Repetir la sincronización sin estudiar debe informar cero repasos nuevos. La creación
debe comprobarse con un error que realmente quieras estudiar. No se responde mal a
tarjetas reales para generar datos de prueba ni se modifica el planificador para probar.

Fuentes del contrato: [API de AnkiConnect](https://github.com/FooSoft/anki-connect/blob/master/plugin/__init__.py),
[búsquedas de Anki](https://docs.ankiweb.net/searching.html),
[tipos de revlog](https://github.com/ankitects/anki/blob/main/proto/anki/stats.proto).
