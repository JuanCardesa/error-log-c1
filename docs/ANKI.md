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
  **Se busca por las dos vías**, tag y campo. Solo por el tag quedaba un estado sin
  salida: si el tag se perdía —«borrar tags no usados», un renombrado, una edición a
  mano— no se encontraba la nota, y `addNote` la rechazaba por duplicada precisamente
  porque el primer campo es esa misma identidad. Ni crear ni vincular. El campo no se
  puede perder sin editar la nota. La forma `"Campo:valor"` está verificada contra una
  colección real: empareja, y los dos puntos del valor son literales entre comillas.
- **Un vínculo de referencia.** `error_row.anki_note_id` referencia `anki_note`; no se
  duplica el enlace en `anki_note.error_id`. El campo `ErrorLogId` identifica un error
  concreto: la sincronización rechaza vínculos que no coincidan con esa identidad.
  `ON DELETE SET NULL` se añadió a mano al SQL generado: Drizzle no lo emitió para el
  `ALTER TABLE`. La sincronización devuelve la deuda antes de retirar la nota del espejo.
- **Identidades que no se reutilizan.** `error_row.id` es AUTOINCREMENT, así que no se
  repite dentro de una base; pero restaurar una copia anterior devuelve el contador atrás
  y el namespace viaja en la copia, de modo que un error nuevo puede heredar la identidad
  de otro que ya tiene tarjeta. Se detecta por la fecha: los identificadores de nota de
  Anki son el instante de creación en milisegundos, igual que los del revlog, así que una
  nota **anterior** al error que dice identificar no puede ser suya. Con más de cinco
  minutos de desfase —margen para el ruido de reloj— no se vincula ni se escribe nada, y
  se explica que la base parece restaurada.
- **Perfil y alcance fijados.** El estado conserva perfil, URL y ambos mazos; se
  rechazan cambios de alcance. El perfil se vuelve a verificar antes de guardar.
  Cambiar de colección requiere otra base. Renombrar/restaurar otra colección bajo el
  mismo nombre de perfil no tiene un identificador de colección garantizado por esta API;
  no debe reutilizarse esta base para una colección distinta.
  Además, dentro de la transacción se compara el `ErrorLogId` leído de cada nota
  vinculada con `errorlog::<namespace>::<error.id>`, también fuera del filtro de mazo.
  Un campo ausente o distinto aborta todo el guardado aunque otras notas sí coincidan.
  Es una comprobación de identidad de los vínculos, no un identificador universal de
  colección: sin vínculos, o con una copia que conserve las mismas identidades, esta API
  no permite distinguirlas. Para otra colección se usa una base nueva con `DB_FILE_OVERRIDE`.
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
- **Lapso frente a fallo aprendiendo.** Un «Again» en una carta ya graduada (tipo 1) es un
  lapso: la sabías y se te fue, y es lo único comparable con un error de práctica. Un
  «Again» en los pasos de aprendizaje o reaprendizaje (tipos 0 y 2) es estar montándola
  todavía, que es lo normal en una tarjeta recién creada. Anki hace la misma distinción:
  su contador `lapses` solo sube con el tipo 1. Contarlos juntos inflaba los «fallos» justo
  cuando el log funciona, que es cuando más tarjetas nuevas hay. Se muestran por separado
  y el cruce con práctica usa solo los lapsos.
- **Resultados interpretables.** Repasos y cartas distintas tienen contadores separados.
  Las categorías de Anki son aproximaciones derivadas de etiquetas. El cruce con práctica
  muestra cantidades y denominadores separados, sin alterar el motor de decisión.
- **Marca manual explícita.** Continúa contando para la regla de conversión, por
  compatibilidad. No se afirma que esa regla mida exclusivamente tarjetas verificadas.
  Al marcarla se recuerda que no se ha comprobado que la tarjeta exista.
- **El aviso sobrevive a la acción.** Convertir un error lo saca de la cola y
  `revalidatePath` vuelve a pintar la lista, así que un mensaje guardado dentro del
  `QueueItem` se desmontaba con él y la confirmación no llegaba a verse nunca. Crear,
  actualizar, marcar a mano y deshacer informan por un contexto que vive por encima de
  lo que cambia.
- **Datos de prueba aislados.** Demo/e2e no pueden contactar Anki personal. Los tests
  de conexión inyectan respuestas, con SQLite real para transacciones y relaciones.
  Los e2e hablan con un doble propio por HTTP (`e2e/fakeAnki.ts`, puerto 8769), el mismo
  `FakeAnki` que valida los tests unitarios: un solo doble del contrato para los dos
  niveles. Con `ERRORLOG_E2E`, `ankiConfig` **ignora** `ANKI_CONNECT_URL` y solo acepta
  la URL inyectada en `ERRORLOG_ANKI_FAKE_URL`, que además tiene prohibido el puerto
  8765; sin esa variable, Anki sigue desactivado. Fuera de los e2e la variable no existe,
  así que tampoco puede desviar la app real. La demo nunca habla con Anki.

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
necesita `last_review_id`, porque no descarta registros por antigüedad.

El día de un repaso es el **día de Anki**, no el civil. Anki reparte por su «next day
starts at» —4:00 por defecto—, así que un repaso de la 1:30 pertenece al día anterior:
fecharlo por medianoche desplazaba un día entero cada vez que se estudia de noche y los
recuentos no cuadraban con los del propio Anki.

**AnkiConnect no expone ese dato.** Comprobado contra la instalación real: `apiReflect`
declara 121 acciones, `getPreferences` responde «unsupported action» y `getDeckConfig`
son opciones de mazo. Así que la hora se declara a mano en `ANKI_ROLLOVER_HOUR`, y si no
se declara se **supone** el 4 por defecto de Anki en vez de inventar un cero que nadie
configuró. Se sigue intentando leerla por si una versión futura la añade; que la acción
no exista no impide sincronizar, pero un fallo de conexión sí se propaga, que no es lo
mismo. `anki_sync` guarda la hora y **de dónde salió** (`rollover_hour`, `rollover_source`;
migraciones `0003` y `0004`), porque la pantalla no debe presentar una suposición con el
mismo aire que un dato leído: cuando es supuesta, dice cómo corregirla.

El tipo de nota nuevo tiene `ErrorLogId`, `Prompt`, `MyAnswer`, `Correct`, `Rule`, `Meta`.
Solo se muestran los últimos cinco en la tarjeta. Los campos se escapan como texto
antes de enviarlos a Anki. No se leen ni copian audio ni campos de la colección existente.

La configuración es local, sin CORS adicional ni ampliación de direcciones de escucha.
Si existe clave de AnkiConnect, se manda desde el servidor, incluso en cada subacción
de `multi`; no se registra ni llega al navegador. Las llamadas no siguen redirecciones.

Solo dos acciones escriben en Anki, y ninguna ocurre sola: **crear** una tarjeta y
**actualizarla**. Editar un error no reescribe su nota —la app decía «Verificada en
Anki» de una tarjeta que ya no coincidía—, así que se guarda una huella del contenido
enviado (`error_row.anki_content_hash`, migración `0005`) y la pantalla avisa cuando el
texto actual ya no cuadra. Actualizar usa `updateNoteFields`: reescribe los campos de esa
nota y nada más. No toca tags, mazo ni programación, así que si cambias la categoría del
error, la clasificación local es la que manda y la etiqueta en Anki se queda como estaba.
Antes de escribir se comprueba que la nota siga siendo la de ese error, y la huella solo
se sella cuando `notesInfo` confirma exactamente `ErrorLogId`, `Prompt`, `MyAnswer`,
`Correct`, `Rule` y `Meta`; un éxito sin aplicar todos los campos conserva la huella
anterior y el aviso. Deshacer olvida
la huella: no se avisa de una tarjeta que ya no se reclama.

El plazo depende de la acción: 5 s para el saludo, 15 s para escribir y 60 s para los
lotes. `cardsInfo` renderiza la pregunta y la respuesta de cada carta, así que un plazo
único obligaba a elegir entre abortar lotes legítimos y dejar colgado el saludo. Solo se
reintenta —dos veces, esperando 0,5 s y 1 s— una **lectura** que expiró: repetir una
escritura es como se acaba con dos notas, y que Anki esté cerrado no mejora esperando.
Agotar los reintentos de un lote aborta la sincronización entera sin guardar nada.
Además, el presupuesto global limita el conjunto de llamadas y sus esperas.

## Escala medida

Contra la colección real (3000 cartas): `cardsInfo` de 250 cartas tarda 190 ms pero
devuelve **2,87 MB**, unos 11,5 KB por carta, casi todo pregunta y respuesta ya
renderizadas que esta app no usa —`cardSchema` se queda con nueve campos—. El `multi`
que hace la sincronización son 215 ms por lote de 250, así que la colección entera son
unos 2,6 s y 10 000 cartas rondarían 8,6 s. El plazo de 60 s para lotes es holgura, no
una necesidad: el riesgo real no era el tiempo sino el volumen.

Recorriendo esa colección entera: con lotes de 100 son 4260 ms, con 250 son 2579, con
500 son 2535 y con 1000 son 2387. Cada petición paga unos 30 ms fijos del bucle de Qt de
AnkiConnect, así que los lotes pequeños se van en esa espera y a partir de 250 la curva
se aplana; lo único que sigue creciendo es la memoria por respuesta. Por eso el tamaño
por defecto se queda en 250, ahora con la medida detrás, y se puede ajustar con
`ANKI_BATCH_SIZE` para colecciones muy distintas.

**No hay barra de progreso ni botón de cancelar, y es a propósito.** La sincronización
completa de esta colección son 2,6 s, y 10 000 cartas rondarían 8,6 s: para eso basta el
botón en «Sincronizando…». Lo que sí hacía falta era acotar el caso patológico, cuando
Anki no responde y cada lote agota su plazo y sus reintentos. `ANKI_SYNC_BUDGET_MS`
—tres minutos por defecto— empieza al entrar en `syncAnki`, incluida la espera por el
bloqueo local, el saludo, perfil, mazos, preferencias, `findCards` y los reintentos.
Al expirar cancela el HTTP en vuelo y rechaza respuestas tardías. Se comprueba el plazo
antes y después de cada llamada y antes de guardar; si la escritura síncrona en SQLite
agota el plazo, la transacción se revierte antes del commit. Esa escritura síncrona no
puede interrumpirse mientras bloquea el hilo. El aviso final dice cuántas cartas y notas
se han leído.

Con 3000 cartas y 30 000 repasos, `reconcile` tarda 88 ms y guardar el espejo 1188 ms;
antes de insertar por lotes eran 2768 ms. El recorrido que comprobaba la nota de cada
carta era cuadrático y ahora usa un conjunto.

Preguntar el estado de conexión cuesta 67 ms medidos —AnkiConnect atiende en el bucle de
Qt y cada llamada paga esa espera—, y `/anki` es `force-dynamic`, así que se pagaba en
cada render. Se guarda el saludo unos segundos por conexión, URL, mazos, clave, modo
activado y alcance local. El perfil se consulta incluso dentro del TTL para detectar
cambios en Anki. Crear, actualizar y sincronizar invalidan la caché; los errores no se
guardan. En demo y e2e el TTL vale cero.

Notas que salen del mazo conservan su fila en `anki_note` sin cartas. Es deliberado
—preserva `first_seen_at` si vuelven— y no crece sin límite: el tope es el número de
notas que alguna vez entraron en el mazo.

## Verificación real pendiente

La implementación supera 470 pruebas unitarias/integración, con cobertura global
superior al 90 %, además de `typecheck`, `lint`, compilación de Next.js y 44 pruebas
de navegador. Seis de ellas recorren contra el doble los flujos que antes no se veían
en navegador: sincronizar, repetir sin repasos nuevos, un fallo de Anki y su reintento,
Anki cerrado, crear una tarjeta sin duplicarla y exportar lo sincronizado. Se revisaron
las capturas de escritorio y móvil. La migración sobre la base personal conserva las
filas previas, con `integrity_check = ok` y sin errores en `foreign_key_check`.

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
