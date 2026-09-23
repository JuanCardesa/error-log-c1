# Error Log C1 — especificación

Contrato vigente del producto. La causa orienta el remedio; las sesiones aportan el
denominador y registrar un error debe costar menos de 30 segundos.

---

## 1. Stack (decidido, no negociable)

- **Next.js (App Router) + TypeScript en modo strict.**
- **SQLite + Drizzle ORM** con migraciones versionadas en `/drizzle`. La base vive en
  `./data/errorlog.db`, fuera de git.
- **Zod** para validación compartida entre formularios y API.
- **Vitest** para lógica pura (queries y reglas), **Playwright** para dos flujos e2e.
- Estilos: CSS Modules o Tailwind, a elección, pero **sin librería de componentes**.
- Sin autenticación: herramienta local monousuario. Dejar `TODO(auth)` donde haría falta.

---

## 2. Modelo de datos

### `session` — una sesión de práctica. Es el denominador de todo.

| campo | tipo | notas |
|---|---|---|
| `id` | PK | |
| `date` | ISO date | no puede ser futura |
| `kind` | enum | `DRILL` `PARCIAL` `SIMULACRO` `CLASE` `WRITING` |
| `paper` | enum, nullable | `RUOE` `WRITING` `LISTENING` `SPEAKING`; null si no tiene formato de examen |
| `part` | int, nullable | dentro del máximo del paper; null exactamente cuando `paper` es null |
| `source` | enum | `LIBRO` `WORKBOOK` `TRAINER` `PAST_PAPER` `ONLINE` `ACADEMIA` |
| `source_ref` | texto | |
| `items_total` | int | **nullable solo si `paper = WRITING`** |
| `items_correct` | int | nullable en las mismas condiciones |
| `duration_min` | int | |
| `timed` | bool | |
| `status` | enum | `OPEN` `CLOSED` |

### `error_row` — un error dentro de una sesión.

| campo | tipo | notas |
|---|---|---|
| `id` | PK | |
| `session_id` | FK → `session` | |
| `item_ref` | texto | |
| `prompt` | texto | |
| `my_answer` | texto | |
| `correct_answer` | texto | |
| `cause` | enum | ver §3 |
| `category` | enum | ver §3 |
| `subcategory` | texto libre, nullable | |
| `confidence` | enum | `SEGURO` `DUDABA` `ADIVINE` |
| `late_in_session` | bool | |
| `rule_note` | texto | **obligatorio** |
| `anki_added` | bool | |
| `anki_added_at` | timestamp, nullable | |
| `anki_note_id` | FK → anki_note.note_id, nullable | vínculo verificado; NULL en marcas manuales |
| `secs` | int | segundos que costó registrarlo |
| `created_at` | timestamp | |

### `writing_piece` — un texto de Writing.

| campo | tipo | notas |
|---|---|---|
| `id` | PK | |
| `session_id` | FK → `session` | |
| `date` | ISO date | |
| `genre` | enum | `ESSAY` `REPORT` `PROPOSAL` `LETTER` `REVIEW` |
| `word_count` | int | |
| `minutes` | int | |
| `timed` | bool | |
| `rewrite_of` | FK → `writing_piece`, nullable | |
| `corrector` | enum | `PROFESOR` `YO` `IA` |
| `band_content` | int 0–5, nullable | |
| `band_communicative` | int 0–5, nullable | |
| `band_organisation` | int 0–5, nullable | |
| `band_language` | int 0–5, nullable | |

### Espejo de Anki (2026-09-22)

| tabla | campos y relaciones |
| --- | --- |
| `anki_note` | `note_id` PK de Anki, `model`, `label` de texto, `tags` JSON, `category` nullable, `first_seen_at`, `last_seen_at` |
| `anki_card` | `card_id` PK, `note_id` FK → anki_note (CASCADE), `deck`, `template_ord`, `lapses`, `reps`, `queue`, `interval_days` |
| `anki_review` | `review_id` PK (epoch ms), `card_id` FK → anki_card (CASCADE), `reviewed_at` ISO, `review_date` según el corte de Anki en la zona local, `ease`, `interval`, `last_interval`, `factor`, `time_ms`, `type` |
| `anki_sync` | fila única `id=1`, `namespace` UUID de esta base, `profile`, `url`, `source_deck`, `target_deck`, `last_synced_at` nullable, `notes_seen` |

`error_row.anki_note_id` es el único vínculo con el error, con `ON DELETE SET NULL`.
Una sincronización confirma por ID las notas vinculadas, incluso fuera del mazo origen;
si una ya no existe, limpia también `anki_added` y `anki_added_at`. Moverla no devuelve
la deuda. Una marca manual queda con `anki_note_id = NULL` y se muestra sin verificar.

Cada snapshot completo validado se aplica en una transacción. Repetirlo es idempotente;
se incluyen repasos importados antiguos y se retiran del espejo los repasos deshechos y
las cartas que ya no pertenecen al alcance. No se borran notas de la colección de Anki.
Perfil y mazos quedan fijados por base para impedir mezclas accidentales. Los datos de
Anki se exportan también en el dump JSON, separados del `Dataset` original.

La creación usa el tipo propio **Error Log C1** con `ErrorLogId`, `Prompt`, `MyAnswer`,
`Correct`, `Rule`, `Meta`. La identidad estable permite recuperar un reintento tras un
timeout; no se usa el enunciado como identidad. Solo se marca una conversión verificada
si Anki devuelve una nota con al menos una tarjeta. Las notas anteriores y sus modelos
se conservan; no se actualizan automáticamente al editar después el error en la app.

### Reglas invariantes (en Zod **y** en constraints de la DB)

- `items_correct <= items_total`, ambos `>= 0`.
- `part` dentro del máximo del paper: `RUOE:8`, `WRITING:2`, `LISTENING:4`, `SPEAKING:4`.
- **Práctica sin formato de examen (2026-09-18):** `paper` y `part` son ambos nulos
  o ambos están informados. Null significa «no aplica», no «pendiente de rellenar».
  Se rechazan pares parcialmente nulos, papers desconocidos y parts no enteras.
  El enum de papers conserva los cuatro valores de Cambridge.
- Fuente y formato son independientes: `LIBRO` puede contener ejercicios libres o
  tareas de examen. Unidad, página y ejercicio se indican en `source_ref`. Las sesiones
  sin formato siguen necesitando `items_total` e `items_correct`, incluidos los ceros;
  la excepción de ítems nulos sigue siendo exclusiva de `paper = WRITING`.
- `date` no puede ser futura.
  «Hoy» es el día del reloj local del servidor. Las ventanas de 30/60 días terminan
  en ese mismo día local; la aritmética posterior de fechas civiles sigue en UTC para
  que los cambios de hora no alteren sus límites.
- `kind = WRITING` → `paper = WRITING`. **Resuelto (P4, 2026-09-14):** el briefing escribía
  un bicondicional, que impedía registrar el Writing de un `SIMULACRO` o de una `CLASE`.
  Queda como implicación simple: `paper = WRITING` admite cualquier `kind`.
- **Resuelto (P1, 2026-09-14):** `writing_piece.session_id` es `UNIQUE`. Una sesión tiene
  como mucho un texto, y por eso los errores de la sesión son atribuibles a ese texto en
  Q6. Una reescritura es su propia sesión.
- `rule_note` mínimo 15 caracteres y **no puede ser igual a `correct_answer`**
  (es la regla, no la respuesta).
- Una sesión con cero errores es válida y **cuenta en el denominador**.
- `rewrite_of` no puede apuntar a sí misma ni formar ciclos.

---

## 3. Taxonomías (cerradas, no ampliables)

### Causas

| causa | significado | remedio | lado |
|---|---|---|---|
| `DESCONOCIMIENTO` | No lo sabía, no podía saberlo | Tarjeta Anki y nada más | study |
| `CONFUSION` | Lo sabía, elegí mal entre dos | Tarjeta de contraste con el par confundido | study |
| `DESPISTE` | Lo sabía. No leí / no releí / no comprobé | No se estudia. Cambia el protocolo de revisión | exec |
| `FORMATO` | Rompí una norma de la tarea | Releer instrucciones del paper, checklist | exec |
| `TIEMPO` | Se acabó el tiempo o fui con prisa | Gestión del tiempo, no contenido | exec |
| `ORTOGRAFIA` | Sabía la palabra, la escribí mal | Tarjeta de spelling. Crítico en Listening P2 | study |

Generan tarjeta Anki (`DEBT`): `DESCONOCIMIENTO`, `CONFUSION`, `ORTOGRAFIA`.
Las demás **no generan tarjeta** — si el usuario intenta crearla, avisarle de que el
problema no es de estudio.

### Categorías

`COLOCACION`, `PHRASAL_VERB`, `WORD_FORMATION`, `PREPOSICION_DEPENDIENTE`,
`TIEMPO_VERBAL`, `ESTRUCTURA`, `ARTICULO_CUANTIFICADOR`, `LEXICO`, `EXPRESION_FIJA`,
`DISCURSO`, `COMPRENSION`, `REGISTRO`, `ESTRUCTURA_TEXTO`, `SPELLING`.

---

## 4. Consultas (Q1–Q6 del MVP y Q7 de Anki)

Ventana por defecto **30 días**, conmutable a 60. Cada una es una función pura en
`/src/lib/queries/` con test unitario y fixtures deterministas.

- **Q1 · Reparto de causas** — conteo y % por causa sobre el total de errores de la ventana.
- **Q2 · Categorías por tasa** — errores por categoría **normalizados por ítems
  intentados**, no por conteo bruto. Orden por tasa descendente.
- **Q3 · Precisión RUOE por part y semana** — matriz part × semana ISO,
  `items_correct / items_total`. Celdas vacías si no hay datos.
- **Q4 · Falsas certezas** — errores con `confidence = SEGURO`, últimos 30 días, listados
  individualmente. Son creencias instaladas, prioridad sobre cualquier categoría.
  **Resuelto (P2, 2026-09-14):** Q4 usa 30 días fijos, no la ventana conmutable — igual que
  la regla 2, cuyo umbral absoluto de 5 está calibrado para 30 días.
- **Q5 · Deuda de Anki** — `pct_convertidos = anki_added / errores que generan tarjeta`.
  Umbral 80%. Incluye las marcas manuales explícitas y las creaciones verificadas;
  no representa exclusivamente notas verificadas. El motor conserva su contrato.
- **Q6 · Eficacia del rewrite** — de los errores del texto original, cuántos reaparecen en
  su rewrite. Umbral 50%. Empareja por `rewrite_of` y compara
  `(category, subcategory, correct_answer)`.
- **Q7 · Repaso en Anki** — número de repasos y cartas distintas, fallos `ease=1`,
  aciertos `ease=2/3/4`, porcentaje nullable si no hay repasos, y notas falladas por
  categoría principal. Solo tipos 0–3 (aprendizaje, repaso, reaprendizaje y filtrado);
  manual y reprogramado quedan fuera. Ventana 30/60 por el día de Anki, usando el
  corte horario configurado o el valor predeterminado de 4:00. Los lapsos (Again de
  tipo 1) se separan de los demás fallos. Tags sin mapeo forman un grupo propio.

El cruce entre Q7 y los errores de práctica presenta recuentos y denominadores
separados, sin equiparar sus tasas ni añadir una octava regla. La falta de sincronización
se distingue de una ventana sincronizada sin repasos.

Cada query exporta también a **CSV** (comillas escapadas correctamente).

Los informes generales y las reglas incluyen la práctica sin formato de examen en su
universo habitual: describen el estudio global, no exclusivamente el rendimiento en
examen. Q2 incluye sus ítems y errores correspondientes, también las sesiones sin
errores en el denominador. Q3 incluye exclusivamente `paper = RUOE`; Writing y Q6
conservan sus requisitos actuales. Las agrupaciones generales por paper deben mostrar
el grupo «Sin formato de examen»; cualquier filtro por formato debe restringir por
igual sesiones, errores y denominadores. El dump JSON conserva ambos campos como null.

---

## 5. Motor de reglas de decisión

Siete reglas. Cada una devuelve un estado:
`DO NOW | QUEUED | WATCH | ok | needs n ≥ 15 | n/a`.

| # | señal | umbral | acción |
|---|---|---|---|
| 0 | `DESPISTE + TIEMPO` sobre todas las causas | > 40% | Congelar vocabulario nuevo dos semanas. El problema es protocolo de examen, no estudio. |
| 1 | `DESCONOCIMIENTO` sobre todas las causas | > 60% | El material te queda grande ahora. Baja de nivel o sube el ritmo de Anki antes de más simulacros. |
| 2 | Errores con `confidence = SEGURO` | ≥ 5 en 30 d | Las tarjetas de contraste tienen prioridad absoluta. Son creencias falsas, no lagunas. |
| 3 | Una sola categoría sobre el total de errores | > 25% | Sábados monotemáticos durante tres semanas. |
| 4 | `pct_convertidos` (Q5) | < 80% | Salta ejercicios un día y ponte al día con las tarjetas. Si no, el log no sirve de nada. |
| 5 | Errores con `late_in_session = 1` (solo sesiones `timed`) | > 35% | Fatiga o gestión del tiempo. Practica parts cronometrados sueltos, no sesiones largas. |
| 6 | El rewrite repite errores del original | > 50% | No estás leyendo la corrección. Léela antes de reescribir, con el original delante. |

### Mecánica exacta

- **Guarda de n mínimo:** `MIN_N = 15`. Ninguna regla basada en **porcentaje**
  (0, 1, 3, 5, 6) puede dispararse con menos de 15 errores en la ventana; en ese caso el
  estado es `needs n ≥ 15`. Las reglas de **conteo absoluto** (2, y 4 que es un ratio de
  conversión) sí se disparan sin la guarda.
- **Umbral WATCH** por regla, para avisar antes de cruzar: 30%, 50%, 3, 20%, 90%, 28%, 35%.
- **Orden de prioridad:** `[4, 0, 1, 2, 3, 5, 6]`. La regla 4 manda sobre todo — un bucle
  de conversión roto bloquea cualquier otro remedio. De las reglas disparadas, la primera
  en ese orden es `DO NOW` y es la única destacada visualmente; el resto quedan `QUEUED`.
  Nunca se muestran dos acciones contradictorias como activas a la vez.
- La regla 6 es `n/a` si no hay ningún par original/rewrite.
- **Resuelto (P3, 2026-09-14):** el denominador de la regla 5 son los errores **de sesiones
  cronometradas**, no todos los de la ventana. El paréntesis «(solo sesiones `timed`)»
  restringe el universo entero. Si no hay ninguna sesión cronometrada en la ventana, la
  regla es `n/a`. La guarda `MIN_N` se aplica sobre ese mismo denominador.

### Tests obligatorios

Cada regla en los cuatro estados, la guarda de n, y el desempate por prioridad con tres
reglas disparadas a la vez.

---

## 6. Vistas

**Prioridad de uso personal (2026-09-15):** reducir la transcripción y permitir empezar
a usar el registro cuanto antes. Registrar incorpora «Pegar varios errores»: JSON
preparado con las instrucciones para IA o celdas con tabulaciones, vista previa
editable y guardado de la tanda en una transacción. No interpreta texto libre ni
envía contenido a servicios externos. Conserva las validaciones del alta manual;
no inventa correcciones ausentes. Causa y confianza ausentes usan los valores del
formulario manual, avisando al usuario para que los revise. Omite duplicados dentro
de la sesión por item, enunciado y ambas respuestas; no sobrescribe filas existentes.

**Importar una tanda con cabecera (2026-09-21):** una sesión representa una tanda de
estudio completa, acumulada en la bandeja de Macmillan hasta «Copiar todo», no una
actividad individual. `/registrar` permite pegar `{ "session": { ... }, "errors": [...] }`,
editar la cabecera propuesta y revisar los errores, y crear todo en una transacción.
Un error inválido impide crear la sesión; un fallo de escritura revierte toda la tanda.
La revisión de respuesta correcta, categoría y regla sigue siendo obligatoria.

- `session` es un objeto estricto validado con Zod: `date`, `kind`, `paper`, `part`,
  `source`, `sourceRef`, `itemsTotal`, `itemsCorrect` y `timed`. Todos deben estar
  presentes, con null donde el modelo lo permita. Se rechazan campos adicionales,
  incluidos `id`, `status` y `durationMin`. El servidor fija `status = OPEN`.
- La duración solo se puede escribir manualmente en la vista previa. Macmillan propone
  `kind = DRILL` editable, `paper = part = null`, `source = LIBRO` y `timed = false`.
  Unidad, página y actividad siguen siendo texto en `source_ref`, sin campos nuevos.
- Se conservan el array de errores, el objeto de error individual y el TSV anteriores
  para añadir a una sesión existente. Su límite sigue siendo 100 filas. El sobre admite
  0–300 errores para conservar la tanda completa, con un máximo de 200 000 caracteres.
  Cero errores es válido y conserva el denominador de las actividades acertadas.
- Si hay sesiones abiertas, la vista previa ofrece crear una nueva o añadir a una de
  ellas, identificadas por id, fecha y referencia. Al añadir se conserva su cabecera;
  **no se suman automáticamente los recuentos** y se avisa de ello. El servidor vuelve
  a comprobar que la sesión siga abierta al guardar. La captura dentro de la sesión
  sigue disponible.
- El capturador acumula los huecos comprobados de todas las actividades, incluidas
  las perfectas. Conserva el primer veredicto observado de cada hueco: recorrer el
  DOM, recargar o reintentar no infla los recuentos ni borra los fallos anteriores.
  Copiar o vaciar descarta juntos errores y acumulador; no los vuelve a recoger solos.
- `sourceRef` agrupa libro, páginas y actividades legibles. Omite datos no disponibles
  y no deduce páginas o números de actividad de identificadores opacos. Las tandas
  de una versión antigua sin recuentos completos se exportan como array compatible
  para completar la cabecera manualmente, sin inventar el denominador.

1. **Registrar** — cabecera de sesión + entrada rápida de errores en un único formulario,
   denso y con teclado, que pasa a una columna cuando no cabe a lo ancho; pegar una tanda
   es una opción aparte. `category` con autocompletado y última usada
   preseleccionada; `subcategory` texto libre con sugerencias de lo ya escrito.
   `late_in_session` deshabilitado si la sesión no es `timed`. Valida la cabecera **antes**
   de aceptar errores y muestra el error concreto.
   Paper ofrece «Sin formato de examen», que oculta Part y guarda ambos campos como
   null. Al editar se conserva esa elección; cabeceras e historial muestran esa etiqueta
   sin una part ficticia. Elegir el tipo `WRITING` sigue exigiendo paper `WRITING`.
2. **Informe** — Q1, Q2, Q5 y la tabla de reglas de decisión con el `DO NOW` destacado.
3. **RUOE** — Q3.
4. **Anki** — cola de pendientes con creación verificada mediante AnkiConnect, marca
   manual explícita y consulta de repasos/fallos por categoría (Q7).
5. **Falsas certezas** — Q4.
6. **Writing** — alta y edición de `writing_piece` con las cuatro bandas, y Q6.
7. **Exportar** — un CSV por query, más un dump completo en JSON.

CRUD completo: crear sesión, cerrarla, reabrirla, corregir sesiones pasadas, editar y
borrar filas de error. Borrado con confirmación. Nada de datos irrecuperables por un clic.

## 7. Decisiones técnicas

- Consultas y reglas puras sobre filas en memoria, con reloj inyectado y fixtures.
  `src/lib/db/` concentra el acceso a SQLite y ficheros.
- Enums y umbrales compartidos; Zod valida entradas y SQLite protege la integridad.
- Semana ISO propia, comprobada en cambios de año; CSS Modules sin librería de UI.
- P1: una pieza por sesión; P2: Q4 y regla 2 usan 30 días; P3: la regla 5 usa
  errores de sesiones cronometradas; P4: Writing obliga al paper, no a la inversa.
- La referencia visual externa del briefing no está disponible en el repositorio.
  Se mantiene la interfaz existente como base para los cambios aprobados.

## 8. Definition of done

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde.
- Cobertura de tests en `/src/lib/` por encima del 90%.
- Las reglas 0, 1, 3, 5 y 6 respetan `MIN_N` en su denominador; nunca hay dos `DO NOW`.
- `README.md` explica el arranque, la recuperación y enlaza el contrato de Anki.
- Cero `any` y cero `@ts-ignore`.
- Práctica sin formato: probar alta y edición, rechazo de pares parcialmente nulos en
  Zod y SQLite, ítems obligatorios, exclusión de Q3 e inclusión correcta en Q2.
  La migración debe preservar sesiones, errores, textos, IDs, relaciones y secuencias
  autoincrementales, sin reclasificar datos históricos; verificar rollback ante fallos.

---

## 9. Proceso

Preguntar antes de: cambiar el stack, añadir una dependencia no listada, alterar un umbral
o un enum, o inventar un campo que no esté en §2. Ante una contradicción en el briefing,
**parar y preguntar** — no elegir interpretación unilateralmente. Después de cada fase,
resumen de tres líneas: qué cambió y qué falta.

Flujo de git: rama `feature/<slug>` → PR a `develop`; `develop` → `main` solo al cerrar
fase. Conventional Commits, un commit por unidad lógica. CI (`typecheck`, `lint`, `test`,
`build`) en push y PR a `develop` y `main`; el PR no se mergea si CI falla.
