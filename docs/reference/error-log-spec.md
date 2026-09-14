# Error log C1 — especificación

Documento de diseño para el registro de errores del plan de C1 Advanced. Define el modelo de datos, las reglas de negocio, las consultas que el programa tiene que responder y las reglas de decisión que convierten esas consultas en una acción concreta cada semana.

---

## 0. Qué problema resuelve (y cuál no)

Un error log no sirve para acumular errores. Sirve para responder **una sola pregunta cada domingo**: *¿qué cambio en lo que estoy haciendo esta semana?*

Si el programa no termina escupiendo una frase accionable —«tus fallos son de despiste, deja de añadir vocabulario y cambia el protocolo de revisión»— entonces es una base de datos de vergüenza, no una herramienta. Todo lo que sigue está subordinado a eso.

Dos consecuencias de diseño que conviene tener claras desde el principio:

**El campo que hace el trabajo es `cause`, no `correct_answer`.** Saber que fallaste «meanwhile» no vale nada. Saber que lo fallaste porque lo confundiste con «whereas», y que eso te ha pasado seis veces, sí.

**Sin denominador, los errores no significan nada.** Doce fallos en Part 3 puede ser excelente o desastroso según cuántos ítems hiciste. Es el fallo de diseño más común en los error logs caseros: registran errores y no intentos. Por eso hay tabla `session`.

---

## 1. Modelo de datos

Tres tablas. `session` es el contenedor con el denominador, `error_entry` es el registro fino, `writing_piece` existe aparte porque el Writing no se mide por ítems acertados.

### 1.1 `session`

Una sesión = un bloque de práctica de una parte concreta. Un simulacro completo son cuatro sesiones (o más, si desglosas por parte).

```sql
CREATE TABLE session (
  id            INTEGER PRIMARY KEY,
  date          DATE    NOT NULL,
  kind          TEXT    NOT NULL CHECK (kind IN
                  ('DRILL','PARCIAL','SIMULACRO','CLASE','WRITING')),
  paper         TEXT    NOT NULL CHECK (paper IN
                  ('RUOE','WRITING','LISTENING','SPEAKING')),
  part          INTEGER,
  source        TEXT    NOT NULL CHECK (source IN
                  ('LIBRO','WORKBOOK','ACADEMIA','TRAINER','PAST_PAPER','ONLINE','OTRO')),
  source_ref    TEXT,                        -- 'Unidad 4, ej. 3' / 'Trainer 2, test 1'
  items_total   INTEGER NOT NULL CHECK (items_total > 0),
  items_correct INTEGER NOT NULL CHECK (items_correct >= 0),
  duration_min  INTEGER,
  timed         BOOLEAN NOT NULL DEFAULT 0,
  CHECK (items_correct <= items_total)
);
```

`part` se valida contra `paper` en la capa de aplicación, porque SQLite no lo hace cómodo:

| paper | partes válidas |
|---|---|
| `RUOE` | 1–8 |
| `WRITING` | 1–2 |
| `LISTENING` | 1–4 |
| `SPEAKING` | 1–4 |

### 1.2 `error_entry`

```sql
CREATE TABLE error_entry (
  id              INTEGER PRIMARY KEY,
  session_id      INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  item_ref        TEXT,                      -- número de pregunta
  prompt          TEXT    NOT NULL,          -- la frase con el hueco / el enunciado
  my_answer       TEXT,
  correct_answer  TEXT    NOT NULL,
  cause           TEXT    NOT NULL CHECK (cause IN
                    ('DESCONOCIMIENTO','CONFUSION','DESPISTE',
                     'FORMATO','TIEMPO','ORTOGRAFIA')),
  category        TEXT    NOT NULL,
  confidence      TEXT    NOT NULL CHECK (confidence IN
                    ('ADIVINE','DUDABA','SEGURO')),
  late_in_session BOOLEAN NOT NULL DEFAULT 0,-- último tercio de una sesión cronometrada
  rule_note       TEXT    NOT NULL CHECK (length(rule_note) >= 15),
  anki_added      BOOLEAN NOT NULL DEFAULT 0,
  anki_added_at   TIMESTAMP,
  CHECK (rule_note <> correct_answer)
);
```

### 1.3 `writing_piece`

```sql
CREATE TABLE writing_piece (
  id            INTEGER PRIMARY KEY,
  session_id    INTEGER REFERENCES session(id),
  date          DATE    NOT NULL,
  genre         TEXT    NOT NULL CHECK (genre IN
                  ('ESSAY','PROPOSAL','REPORT','REVIEW','LETTER')),
  word_count    INTEGER,
  minutes       INTEGER,
  timed         BOOLEAN NOT NULL DEFAULT 0,
  rewrite_of    INTEGER REFERENCES writing_piece(id),
  corrector     TEXT    CHECK (corrector IN
                  ('PROFESOR','WRITE_AND_IMPROVE','AUTO','NINGUNO')),
  band_content       INTEGER CHECK (band_content       BETWEEN 0 AND 5),
  band_communicative INTEGER CHECK (band_communicative BETWEEN 0 AND 5),
  band_organisation  INTEGER CHECK (band_organisation  BETWEEN 0 AND 5),
  band_language      INTEGER CHECK (band_language      BETWEEN 0 AND 5)
);
```

Las cuatro bandas son las subescalas reales con las que Cambridge puntúa el Writing: Content, Communicative Achievement, Organisation y Language, de 0 a 5 cada una. Registrarlas por separado es lo que te permite ver que, por ejemplo, tu Language sube y tu Organisation lleva tres meses clavada.

`rewrite_of` es la clave del seguimiento de reescrituras: enlaza un texto con el original que reescribe.

---

## 2. Los dos enums que importan

### 2.1 `cause` — el eje diagnóstico

Regla de diseño: **cada causa tiene que mapear a un remedio distinto. Si dos causas llevan a hacer lo mismo, sobra una.**

| Valor | Qué significa | Remedio |
|---|---|---|
| `DESCONOCIMIENTO` | No lo sabía, no podía saberlo | Tarjeta de Anki, sin más |
| `CONFUSION` | Lo conocía, elegí mal entre dos opciones próximas | Tarjeta de **contraste** con el par confundido, no tarjeta suelta |
| `DESPISTE` | Lo sabía. Fallé por no leer bien, no releer o no comprobar | **Nada de estudio.** Cambio en el protocolo de revisión |
| `FORMATO` | Incumplí una regla de la tarea (más de 6 palabras en Part 4, cambiar la palabra clave, no responder a lo que pedía) | Releer las instrucciones del paper y hacer checklist |
| `TIEMPO` | No llegué, o respondí a la carrera | Gestión de tiempo, no contenido |
| `ORTOGRAFIA` | Sabía la palabra, la escribí mal | Tarjeta de spelling. Crítico en Listening Part 2 |

Seis valores, ni uno más. La tentación de añadir «gramática» hay que resistirla: gramática es *categoría*, no *causa*. Si mezclas los dos ejes, el reporte deja de decirte qué hacer.

### 2.2 `category` — el eje lingüístico

```
COLOCACION
PHRASAL_VERB
WORD_FORMATION
PREPOSICION_DEPENDIENTE
TIEMPO_VERBAL
ESTRUCTURA            -- pasivas, condicionales, inversión, cleft
ARTICULO_CUANTIFICADOR
LEXICO                -- palabra suelta, sin patrón
EXPRESION_FIJA
DISCURSO              -- linkers, referencia, cohesión
COMPRENSION           -- entendí mal el texto o el audio
REGISTRO              -- solo Writing / Speaking
ESTRUCTURA_TEXTO      -- solo Writing
SPELLING
```

Una sola categoría por error, la principal. Si dudas entre dos, elige la que describa **lo que tendrías que haber sabido**, no lo que te confundió.

Añade un campo libre `subcategory` si quieres detalle (`-ance/-ence`, `inversión con hardly`), pero que no sea enum: los enums libres se convierten en cien valores con una entrada cada uno y dejan de agrupar.

---

## 3. Reglas de negocio

1. **`rule_note` es obligatorio y no puede ser la respuesta correcta.** Es la regla escrita con tus palabras. Si el programa te deja copiar la solución en ese campo, has construido un log que no enseña nada. El `CHECK` de longitud mínima y el de desigualdad con `correct_answer` están para forzarlo.
2. **`cause` ∈ {`DESCONOCIMIENTO`, `CONFUSION`, `ORTOGRAFIA`} genera deuda de Anki.** Esos errores deben tener `anki_added = 1` en un plazo de 48 h. El programa mantiene una cola de pendientes.
3. **`cause = DESPISTE` nunca genera tarjeta.** Es el error más frecuente de los error logs caseros: convertir despistes en tarjetas. Un despiste no se arregla estudiando, se arregla cambiando cómo revisas.
4. **`late_in_session` solo aplica si `session.timed = 1`.** Si no hubo cronómetro, el dato no significa nada.
5. **`confidence = SEGURO` marca el error como prioritario** independientemente de la categoría. Un error que cometiste convencido es una creencia falsa instalada, y esas cuestan mucho más que las lagunas.
6. **Una sesión sin errores también se registra.** Es el denominador. Si solo guardas sesiones con fallos, todas tus tasas mienten al alza.

---

## 4. Las consultas

El programa tiene que responder a estas seis. Todo lo demás es opcional.

### Q1 · Reparto de causas, últimos 30 días

La consulta principal. Dice si tu problema es de conocimiento o de ejecución.

```sql
SELECT e.cause,
       COUNT(*) AS n,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM error_entry e
JOIN session s ON s.id = e.session_id
WHERE s.date >= date('now','-30 days')
GROUP BY e.cause
ORDER BY n DESC;
```

### Q2 · Categorías por tasa, no por volumen

Normalizada por ítems intentados. Sin esto, las partes que más practicas parecen siempre las peores.

```sql
WITH intentos AS (
  SELECT paper, SUM(items_total) AS items
  FROM session
  WHERE date >= date('now','-60 days')
  GROUP BY paper
)
SELECT e.category,
       s.paper,
       COUNT(*) AS errores,
       ROUND(100.0 * COUNT(*) / i.items, 2) AS errores_por_100_items
FROM error_entry e
JOIN session s   ON s.id = e.session_id
JOIN intentos i  ON i.paper = s.paper
WHERE s.date >= date('now','-60 days')
GROUP BY e.category, s.paper
ORDER BY errores_por_100_items DESC
LIMIT 5;
```

El resultado de Q2 es, literalmente, el temario de tus próximos dos sábados.

### Q3 · Precisión por parte a lo largo del tiempo

Es la que te dice si seis semanas de drills de Part 3 han servido de algo.

```sql
SELECT strftime('%Y-W%W', date) AS semana,
       part,
       SUM(items_correct) AS aciertos,
       SUM(items_total)   AS total,
       ROUND(100.0 * SUM(items_correct) / SUM(items_total), 1) AS pct
FROM session
WHERE paper = 'RUOE'
GROUP BY semana, part
ORDER BY semana, part;
```

### Q4 · Falsas certezas

```sql
SELECT s.date, e.category, e.my_answer, e.correct_answer, e.rule_note
FROM error_entry e
JOIN session s ON s.id = e.session_id
WHERE e.confidence = 'SEGURO'
  AND s.date >= date('now','-30 days')
ORDER BY s.date DESC;
```

### Q5 · Deuda de Anki

Mide si el log cierra el círculo o solo acumula.

```sql
SELECT ROUND(100.0 * SUM(anki_added) / COUNT(*), 1) AS pct_convertidos,
       SUM(CASE WHEN anki_added = 0 THEN 1 ELSE 0 END) AS pendientes
FROM error_entry
WHERE cause IN ('DESCONOCIMIENTO','CONFUSION','ORTOGRAFIA');
```

### Q6 · Eficacia de la reescritura

```sql
SELECT orig.id            AS original,
       orig.genre,
       COUNT(DISTINCT eo.id) AS errores_original,
       COUNT(DISTINCT er.id) AS errores_reescritura
FROM writing_piece orig
JOIN writing_piece rw ON rw.rewrite_of = orig.id
LEFT JOIN error_entry eo ON eo.session_id = orig.session_id
LEFT JOIN error_entry er ON er.session_id = rw.session_id
GROUP BY orig.id;
```

---

## 5. Reglas de decisión

Esto es lo que el programa imprime el domingo. Sin esta tabla, las consultas anteriores son decoración.

| Señal | Umbral | Qué haces esa semana |
|---|---|---|
| `DESPISTE` + `TIEMPO` sobre el total de causas | > 40% | Congela el vocabulario nuevo dos semanas. El problema es de protocolo de examen, no de estudio |
| `DESCONOCIMIENTO` sobre el total | > 60% | El material te viene grande. Baja un escalón o sube el ritmo de Anki antes de seguir con simulacros |
| Errores con `confidence = SEGURO` | ≥ 5 en 30 días | Prioridad absoluta a tarjetas de contraste. Son creencias falsas, no lagunas |
| Una sola categoría sobre el total de errores | > 25% | Monotema los sábados durante tres semanas |
| `pct_convertidos` (Q5) | < 80% | Para de hacer ejercicios un día y ponte al día con las tarjetas. El log no está sirviendo para nada |
| Errores con `late_in_session = 1` | > 35% | Fatiga o gestión de tiempo. Practica partes sueltas cronometradas, no sesiones largas |
| Reescritura que repite errores del original | > 50% | No estás leyendo la corrección. Lee antes de reescribir, con el texto original delante |

---

## 6. Requisitos no funcionales

**El requisito número uno, por encima de todos los demás: dar de alta un error tiene que costar menos de 30 segundos.** Si cuesta dos minutos, dejarás de registrarlos en tres semanas y el proyecto entero se cae. Esto manda sobre cualquier otra decisión de diseño.

De ahí salen:

- **Alta por lotes.** Después de un ejercicio tienes ocho errores de golpe. Crea la sesión una vez y añade filas que hereden `paper`, `part`, `source` y fecha. Un formulario completo por error es la muerte del sistema.
- **Todo por teclado.** Tab entre campos, enter para guardar y volver a empezar. Nada de ratón.
- **Valores por defecto agresivos.** `cause` y `category` con el último valor usado preseleccionado; dentro de una tanda se repiten mucho.
- **Autocompletado en `category` y en `subcategory`** sobre lo ya introducido.
- **Local y sin cuentas.** SQLite en un fichero. Sin login, sin servidor, sin despliegue. El backup es copiar el archivo.
- **Exportación a CSV** de cualquier consulta. Te la vas a querer llevar a otro sitio antes o después.

---

## 7. Alcance del MVP

Eres ingeniero de software y este es exactamente el tipo de proyecto que se come un mes sin que te des cuenta. El plan ya avisa de ello. Así que el alcance es cerrado:

**Dentro del MVP:**
- Las tablas `session` y `error_entry`. `writing_piece` puede esperar.
- Alta de sesión y alta rápida de errores en lote.
- Q1, Q2 y Q5.
- Un informe semanal en texto plano con las reglas de decisión aplicadas.

**Fuera del MVP, y no se negocia:**
- Exportador a Anki. Tentador y prescindible: un CSV de dos columnas vale.
- Gráficas. Una tabla en consola informa igual.
- `writing_piece` y bandas de Cambridge.
- App móvil, sincronización, autenticación, clasificación automática por IA, OCR de los ejercicios.

**Presupuesto: 6–8 horas en total.** Si a las ocho horas no tienes algo que registre un error en menos de 30 segundos y te saque el reparto de causas, abandónalo y usa una hoja de cálculo con esas mismas columnas. El error log tiene que estar funcionando en la semana 1 del plan, y lo que no puede pasar es que el mes de septiembre se te vaya en construir la herramienta en lugar de estudiar.

---

## 8. Dos filas de ejemplo

**Sesión:** `2026-09-22`, `DRILL`, `RUOE`, part 4, `LIBRO`, «Unidad 1 ej. 5», 6 ítems, 3 correctos, 20 min, sin cronómetro.

| campo | valor |
|---|---|
| `prompt` | *I only recognised him because of his voice.* (WAS) |
| `my_answer` | it was only his voice that I recognised him |
| `correct_answer` | it was only by his voice that I recognised him |
| `cause` | `FORMATO` |
| `category` | `ESTRUCTURA` |
| `confidence` | `DUDABA` |
| `rule_note` | En las cleft con «it was… that», la preposición del complemento no desaparece: «by his voice», no «his voice» |
| `anki_added` | 1 |

**Sesión:** `2026-09-25`, `DRILL`, `LISTENING`, part 2, `WORKBOOK`, 8 ítems, 5 correctos, 15 min, cronometrado.

| campo | valor |
|---|---|
| `prompt` | The speaker says the survey was carried out by ______ |
| `my_answer` | volunteers |
| `correct_answer` | volunters *(sic, lo escribí así)* |
| `cause` | `ORTOGRAFIA` |
| `category` | `SPELLING` |
| `confidence` | `SEGURO` |
| `late_in_session` | 1 |
| `rule_note` | «volunteer» lleva doble e antes de la r. En Part 2 la ortografía puntúa: palabra mal escrita es cero |
| `anki_added` | 1 |
