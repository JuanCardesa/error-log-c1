# Error Log C1 — especificación

Transcripción del briefing de encargo. Es la fuente de verdad del proyecto: si el código
y este documento discrepan, discrepa el código.

El antecedente de este briefing es `error-log-spec.md` (documento de diseño original).
Donde ambos difieren, **manda este documento**. Ver §10.

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
| `paper` | enum | `RUOE` `WRITING` `LISTENING` `SPEAKING` |
| `part` | int | dentro del máximo del paper |
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

### Reglas invariantes (en Zod **y** en constraints de la DB)

- `items_correct <= items_total`, ambos `>= 0`.
- `part` dentro del máximo del paper: `RUOE:8`, `WRITING:2`, `LISTENING:4`, `SPEAKING:4`.
- `date` no puede ser futura.
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

## 4. Las seis queries (todas en el MVP)

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
  Umbral 80%.
- **Q6 · Eficacia del rewrite** — de los errores del texto original, cuántos reaparecen en
  su rewrite. Umbral 50%. Empareja por `rewrite_of` y compara
  `(category, subcategory, correct_answer)`.

Cada query exporta también a **CSV** (comillas escapadas correctamente).

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

1. **Registrar** — cabecera de sesión + entrada rápida de errores, en dos variantes
   conmutables: **grid** (tabla, teclado, para volcar diez errores seguidos) y **card**
   (un error a la vez, campos grandes). `category` con autocompletado y última usada
   preseleccionada; `subcategory` texto libre con sugerencias de lo ya escrito.
   `late_in_session` deshabilitado si la sesión no es `timed`. Valida la cabecera **antes**
   de aceptar errores y muestra el error concreto.
2. **Informe** — Q1, Q2, Q5 y la tabla de reglas de decisión con el `DO NOW` destacado.
3. **RUOE** — Q3.
4. **Anki** — cola de pendientes con botón «añadida» que sella `anki_added_at`.
5. **Falsas certezas** — Q4.
6. **Writing** — alta y edición de `writing_piece` con las cuatro bandas, y Q6.
7. **Exportar** — un CSV por query, más un dump completo en JSON.

CRUD completo: crear sesión, cerrarla, reabrirla, corregir sesiones pasadas, editar y
borrar filas de error. Borrado con confirmación. Nada de datos irrecuperables por un clic.

`Error Log C1.dc.html` es la **referencia visual y de comportamiento**: densidad de
información, monoespaciada para datos, chips de causa con color por lado (`study` azul /
`exec` rojo), fondo hueso. Se copia a `/docs/reference/` y se respeta. No es código a
reutilizar — se reimplementa bien.

---

## 7. Fases de entrega

Una rama, un PR y un tag por fase. Al cerrar cada fase, merge a `main` y tag `v0.x`.

- **Fase 1 — `feature/schema-and-core`**: schema Drizzle, migraciones, Zod, seed con datos
  de ejemplo realistas, queries Q1–Q6 puras con tests. Sin UI. Tag `v0.1`.
- **Fase 2 — `feature/rules-engine`**: motor de reglas con guardas y prioridad, test
  completo. Tag `v0.2`.
- **Fase 3 — `feature/capture-ui`**: vista Registrar con ambas variantes y validación.
  Tag `v0.3`.
- **Fase 4 — `feature/report-views`**: Informe, RUOE, Anki, Falsas certezas. Tag `v0.4`.
- **Fase 5 — `feature/writing-and-export`**: Writing, Q6, CSV/JSON. Tag `v0.5`.
- **Fase 6 — `feature/polish`**: e2e Playwright, README con capturas, accesibilidad de
  teclado. Tag `v1.0`.

---

## 8. Definition of done

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde.
- Cobertura de tests en `/src/lib/` por encima del 90%.
- Ninguna regla puede dispararse por debajo de `MIN_N`, y nunca hay dos `DO NOW`.
- `README.md` explica en cinco líneas qué hace la app y cómo arrancarla.
- Cero `any` y cero `@ts-ignore`.

---

## 9. Proceso

Preguntar antes de: cambiar el stack, añadir una dependencia no listada, alterar un umbral
o un enum, o inventar un campo que no esté en §2. Ante una contradicción en el briefing,
**parar y preguntar** — no elegir interpretación unilateralmente. Después de cada fase,
resumen de tres líneas: qué cambió y qué falta.

Flujo de git: rama `feature/<slug>` → PR a `develop`; `develop` → `main` solo al cerrar
fase. Conventional Commits, un commit por unidad lógica. CI (`typecheck`, `lint`, `test`,
`build`) en push y PR a `develop` y `main`; el PR no se mergea si CI falla.

---

## 10. Relación con `error-log-spec.md`

El documento de diseño original queda **superado** por este briefing en estos puntos:

| punto | spec original | este briefing (manda) |
|---|---|---|
| nombre de tabla | `error_entry` | `error_row` |
| campos nuevos | — | `session.status`, `error_row.secs`, `error_row.subcategory` |
| `items_total` | `NOT NULL`, `> 0` | nullable si `paper = WRITING` |
| enum `source` | incluye `OTRO` | seis valores, sin `OTRO` |
| enum `corrector` | `PROFESOR/WRITE_AND_IMPROVE/AUTO/NINGUNO` | `PROFESOR/YO/IA` |
| alcance MVP | Q1, Q2, Q5; sin `writing_piece` | las seis queries y `writing_piece` dentro |
| entrega | script local, 6–8 h | Next.js, seis fases, CI, e2e |
| reglas de decisión | siete señales, sin mecánica | + `MIN_N`, WATCH, prioridad, estados |

Lo que el original aporta y sigue vigente: el porqué del diseño (la causa es el campo que
trabaja; sin denominador los errores no significan nada; registrar un error debe costar
menos de 30 segundos).
