# Writing Workspace: arquitectura y plan de incorporación

> Plan aprobado el 15 de octubre de 2026.
> Rama de trabajo: **feature/writing-workspace**, creada desde **develop**, commit **7d23bfe**.
> Este documento conserva las decisiones, contratos y tareas del plan acordado.
> Estado: **8 de 10 tareas completadas** (más 3 aplazadas en la fase D). Fases A y B cerradas; fase C en curso.
> Próximo paso: **TASK C2 — progreso**.

## Cómo continuar

- Trabajar en feature/writing-workspace; los cambios se integran mediante PR a develop.
- Seguir las tareas de la sección 14 en orden, respetando sus dependencias.
- Marcar una tarea solo cuando su implementación y sus comprobaciones estén completas.
- Anotar al final de este documento los commits, comprobaciones y cambios de decisión.
- Leer AGENTS.md y las guías pertinentes de `node_modules/next/dist/docs/` antes de escribir código.
- Las migraciones se prueban sobre bases temporales. `data/errorlog.db` aplicó la 0012 el 15-oct-2026,
  al cerrar la fase A: desde entonces es inmutable y cualquier cambio de esquema (como
  `writing_text_history` en TASK B3) va en una migración nueva.
- Las E2E sirven desde `.next-e2e`: compilar con `ERRORLOG_E2E=1` antes de `playwright test`.
- Todo texto nuevo de interfaz va a `src/lib/i18n/en.ts` y `es.ts`. El contenido del usuario
  (redacciones, títulos, comentarios, correcciones, enunciados) nunca se traduce ni se altera.
- No incorporar funciones de la fase D como parte de otra tarea.

## 1. Resumen

Writing pasa de ser un registro de bandas a un cuaderno de redacciones corregidas. El flujo real:

1. Juan escribe en papel y lo fotografía; a veces la profesora devuelve el papel corregido.
2. ChatGPT o Claude transcriben el texto exacto, identifican las correcciones y generan un JSON.
3. Error-Log importa ese JSON desde su propia interfaz (no con un script), con vista previa.
4. La redacción se estudia sobre una hoja de papel con las anotaciones resaltadas.
5. Las puntuaciones alimentan un seguimiento del progreso por criterio.

Error-Log no hace OCR, no corrige con IA ni llama a APIs de modelos. No hay dependencias nuevas.

## 2. Decisiones aprobadas

| # | Decisión | Motivo |
| --- | --- | --- |
| 1 | Se amplía `writing_piece`; cada importación crea su sesión Writing | Q6 y la regla 6 atribuyen errores por sesión (P1); `error_row.session_id` es obligatorio y la futura integración con el Error Log la necesita; desaparece el paso manual por Sesiones |
| 2 | Anotaciones con 12 focos propios ligados a los criterios de Cambridge | Las 14 categorías del Error Log son cerradas (SPEC §3), no cubren contenido, claridad ni puntuación y son más finas de lo que marca una profesora. La equivalencia queda para la fase D |
| 3 | Sin fotografías en esta versión | Pesan megas, inflarían las copias SQLite y el Notebook ya excluyó adjuntos; se estudia la transcripción |
| 4 | Cinco tipos; `LETTER` se muestra como «Letter / Email» | Cambridge (formato oficial de C1 Advanced) y los apuntes de Juan lo tratan como un único tipo. Solo cambia la etiqueta, no el valor guardado |
| 5 | Writing entra en la navegación principal, con el atajo G W | Pasa a ser un espacio de uso habitual, como el Notebook |

Valores por defecto aprobados con ellas:

- Estados `AWAITING` / `CORRECTED` / `NOT_SUBMITTED`.
- Los errores frecuentes cuentan los de la profesora y los propios; los de la IA solo si se activan.
- JSON estricto: una clave desconocida se rechaza; una opcional puede omitirse o ir a `null`.
- Eje ordinal en el gráfico de progreso.
- Sesión automática cerrada (`CLOSED`), con fuente `ACADEMIA` editable en la vista previa.
- Las redacciones nuevas exigen texto; las antiguas sin texto se conservan y pueden recibirlo.
- Rango de palabras 220–260 en las dos partes, comprobado en la página oficial de formato de
  C1 Advanced. Ajustable por redacción.

## 3. Punto de partida

- Ruta [src/app/writing/page.tsx](../src/app/writing/page.tsx): tabla de textos con bandas y pestaña de
  reescrituras (Q6), en el menú «Más».
- Alta y edición en [PieceForm.tsx](../src/app/writing/PieceForm.tsx): obliga a elegir una sesión Writing libre
  y guarda la evaluación, no la redacción.
- `writing_piece` en [schema.ts](../src/lib/db/schema.ts): `session_id` NOT NULL UNIQUE, `date`, `genre`,
  `word_count` manual, `minutes`, `timed`, `rewrite_of`, `corrector` y cuatro bandas enteras 0–5.
- La base real no tenía ninguna redacción ni sesión Writing el 15-oct-2026: solo el seed, el demo y las
  E2E usan este modelo.
- Reutilizable del Notebook: `StudyAnchor`, `studyAnchor()` y `resolveStudyAnchor()`
  ([annotations.ts](../src/lib/notebook/annotations.ts)), `readStudySelection()`
  ([studySelection.ts](../src/app/notebook/studySelection.ts)), la barra contextual de
  [NotebookStudy.tsx](../src/app/notebook/NotebookStudy.tsx) y la hoja `.reader`.
- Reutilizable de Sesiones: validación estricta, mensajes traducidos y recibo idempotente de
  [sessionImport.ts](../src/lib/db/sessionImport.ts); el botón «Copiar instrucciones para la IA».
- Reutilizable en general: Drawer, ConfirmDialog, Toast con Deshacer, Menu, RouteTabs, LiveSearch,
  StatusText, `ui.module.css`, `/exportar/[file]` y la búsqueda sin acentos de `searchText.ts`.
- No se reutiliza `MarkdownRenderer`: la redacción es texto plano y un `*` escrito a mano no es formato.

## 4. Modelo de datos

### `writing_piece` (ampliada en 0012)

La tabla se reconstruye porque las bandas pasan a REAL. La migración desactiva las claves foráneas como
0001, conserva IDs, secuencia, reescrituras y la sesión de cada texto.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `uid` | text NOT NULL UNIQUE | UUID v4; la base lo genera. Identifica la redacción en el contrato JSON |
| `title` | text, null | 1–200 caracteres. Null en textos antiguos: se usa el título derivado de siempre |
| `task_prompt` | text, null | ≤ 5 000 |
| `original_text` | text, null | 1–20 000 caracteres. Null solo en textos antiguos |
| `text_fingerprint` | text, null, indexado | Huella del texto normalizado. Existe si y solo si existe el texto |
| `text_revision` | int ≥ 1, por defecto 1 | Solo cambia con «Corregir transcripción» |
| `date` | ya existía | Fecha cronológica de la redacción |
| `date_basis` | `WRITTEN` / `CORRECTED` / `IMPORTED` | De dónde sale `date`. Nunca se inventa una fecha |
| `corrected_on` | text, null | Fecha en que llegó la corrección; no anterior a `date` |
| `status` | `AWAITING` / `CORRECTED` / `NOT_SUBMITTED` | Textos antiguos: `CORRECTED` si tenían corrector o alguna banda |
| `band_*` | REAL 0–5 en pasos de 0,5, null | Null es «sin evaluar», nunca cero |
| `teacher_comment` | text, null | ≤ 5 000. Distinto de las anotaciones |
| `personal_notes` | text, null | ≤ 5 000 |
| `word_min`, `word_max` | int, null | Los dos o ninguno; 1 ≤ min ≤ max ≤ 2 000. Null = 220–260 |
| `created_at`, `updated_at` | text NOT NULL | Textos antiguos: medianoche UTC de su `date` |
| `word_count` | ya existía | En los textos con transcripción se calcula y se guarda; Q6 y el volcado no cambian |

Mientras el formulario antiguo siga activo, al guardar desde él el estado se deduce igual que en la
migración. TASK C1 lo convierte en un campo editable.

### `writing_annotation` (nueva en 0012)

| Campo | Valores |
| --- | --- |
| `id` | UUID |
| `piece_id` | FK → `writing_piece`, en cascada |
| `kind` | `ERROR` · `IMPROVEMENT` · `STRENGTH` · `COMMENT` |
| `focus` | null o uno de los 12 focos |
| `source` | `PROFESOR` · `IA` · `YO` (los valores de `CORRECTORS`) |
| `scope` | `SPAN` · `PARAGRAPH` · `DOCUMENT` |
| `anchor` | JSON `StudyAnchor` o null |
| `paragraph` | int ≥ 1 o null |
| `quote` | La cita recibida al importar (≤ 20 000) |
| `comment`, `suggestion` | ≤ 2 000 cada uno |
| `reviewed_at` | null = pendiente de estudiar |
| `import_key` | Huella de importación; única por redacción cuando existe |
| `created_at`, `updated_at` | ISO 8601 |

Invariantes en Zod y en CHECK:

- `DOCUMENT`: sin anclaje, párrafo ni cita.
- `PARAGRAPH`: con párrafo, sin anclaje ni cita.
- `SPAN`: con anclaje o con cita. Sin anclaje significa **sin colocar**. El párrafo, si llega, indica
  dónde se esperaba la cita.
- Hay comentario o corrección. Una fortaleza puede llevar solo su foco.
- El anclaje cumple el mismo CHECK JSON que `notebook_annotation`.

### `writing_import_receipt` (nueva en 0012)

`import_id` (PK), `payload_hash`, `piece_id`, `created_at`. Igual que `session_import_receipt`: sin clave
foránea, para que un reintento no recree una redacción aunque después se haya borrado.

### `writing_text_history` (TASK B3, migración propia)

`id`, `piece_id`, `text`, `text_revision`, `replaced_at`. Guarda la transcripción sustituida.

### Focos y criterios

| Criterio de Cambridge | Focos |
| --- | --- |
| Content | `CONTENT` |
| Communicative Achievement | `REGISTER` · `CLARITY` |
| Organisation | `LINKING` · `ORGANISATION` |
| Language | `GRAMMAR` · `SPELLING` · `PUNCTUATION` · `WORD_ORDER` · `VOCABULARY` · `COLLOCATION` |
| — | `OTHER` |

La relación vive en `src/lib/domain/enums.ts`; no se guarda en la base.

## 5. Anclaje de anotaciones

1. **Lo guardado:** posiciones UTF-16 sobre `original_text`, más el texto exacto y 48 caracteres de
   contexto a cada lado (`StudyAnchor`). El texto es inmutable, así que las posiciones mandan. Al leer
   se comprueba `text.slice(start, end) === exact`; si no coincide, la anotación se trata como sin
   colocar. Nunca se mueve en silencio.
2. **Al importar** se reciben citas, no posiciones. La búsqueda:
   1. Busca la cita exacta en el párrafo indicado (o en todo el texto). Una cita que empieza o acaba
      en letra o número no puede empezar o acabar dentro de otra palabra.
   2. Sin resultados, repite tolerando espacios repetidos, comillas tipográficas y guiones, y devuelve
      las posiciones reales. El resultado se marca como «aproximado».
   3. Una coincidencia se coloca, salvo que `occurrence` o el contexto la contradigan.
   4. Varias coincidencias se filtran por `occurrence` y después por `before` y `after`. Solo se coloca
      si queda una.
   5. Cita ambigua o no encontrada: la anotación entra sin colocar, con su cita y el motivo.
3. **Exportación:** incluye `start` y `end`. Al reimportar solo se usan si `text.slice` coincide con la cita.
4. **Corregir la transcripción** (TASK B3): `resolveStudyAnchor` reubica las anotaciones; las que no
   encajan pasan a sin colocar y el texto anterior va a `writing_text_history`.

## 6. Contrato JSON v1

```json
{
  "format": "error-log-writing",
  "version": 1,
  "writing": {
    "id": null,
    "title": "Making cities more liveable",
    "type": "ESSAY",
    "writtenOn": "2026-10-02",
    "taskPrompt": "Your class has attended a panel discussion on what local authorities should do to make cities more liveable. Write an essay discussing two of the measures in your notes, explaining which is more important and giving reasons.",
    "text": "In recent years, many cities have tried to become more liveable. In my opinion, two measures deserve particular attention: investing in public transport and creating more green spaces.\n\nFirstly, an efficient public transport network has a direct impact on people's daily lives. It reduces traffic congestion and, as a result, cuts air pollution considerably.\n\nSecondly, green spaces are also important, but there effect is more limited. Many people dont use parks regularly, specially in winter, and the goverment have to spend a lot of money to mantain them, so a lot of residents prefer to stay at home.\n\nTo conclude, although both measures are valuable, I believe public transport should be the priority, since it benefits a far larger number of citizens.",
    "wordRange": null,
    "timed": true,
    "minutes": 80
  },
  "assessment": {
    "status": "CORRECTED",
    "assessedBy": "PROFESOR",
    "correctedOn": "2026-10-09",
    "scores": { "content": 4, "communicativeAchievement": 3, "organisation": 3, "language": 2.5 },
    "total": 12.5,
    "teacherComment": "Paragraphs 1, 2 and 4 are well written. Paragraph 3 has a lot of basic grammar and spelling mistakes.",
    "personalNotes": null
  },
  "annotations": [
    { "kind": "STRENGTH", "focus": null, "source": "PROFESOR", "target": { "scope": "PARAGRAPH", "paragraph": 1 }, "comment": "Well written.", "suggestion": null },
    { "kind": "STRENGTH", "focus": null, "source": "PROFESOR", "target": { "scope": "PARAGRAPH", "paragraph": 2 }, "comment": "Well written.", "suggestion": null },
    { "kind": "ERROR", "focus": null, "source": "PROFESOR", "target": { "scope": "PARAGRAPH", "paragraph": 3 }, "comment": "Needs work: many basic grammar and spelling mistakes.", "suggestion": null },
    { "kind": "STRENGTH", "focus": null, "source": "PROFESOR", "target": { "scope": "PARAGRAPH", "paragraph": 4 }, "comment": "Well written.", "suggestion": null },
    { "kind": "ERROR", "focus": "SPELLING", "source": "PROFESOR", "target": { "scope": "SPAN", "quote": "there", "paragraph": 3 }, "comment": "Possessive.", "suggestion": "their" },
    { "kind": "ERROR", "focus": "PUNCTUATION", "source": "PROFESOR", "target": { "scope": "SPAN", "quote": "dont", "paragraph": 3 }, "comment": null, "suggestion": "don't" },
    { "kind": "ERROR", "focus": "VOCABULARY", "source": "PROFESOR", "target": { "scope": "SPAN", "quote": "specially", "paragraph": 3 }, "comment": "'Specially' means 'for a particular purpose'.", "suggestion": "especially" },
    { "kind": "ERROR", "focus": "SPELLING", "source": "PROFESOR", "target": { "scope": "SPAN", "quote": "goverment", "paragraph": 3 }, "comment": null, "suggestion": "government" },
    { "kind": "ERROR", "focus": "GRAMMAR", "source": "PROFESOR", "target": { "scope": "SPAN", "quote": "have to", "paragraph": 3 }, "comment": "'The government' takes a singular verb.", "suggestion": "has to" },
    { "kind": "ERROR", "focus": "SPELLING", "source": "PROFESOR", "target": { "scope": "SPAN", "quote": "mantain", "paragraph": 3 }, "comment": null, "suggestion": "maintain" },
    { "kind": "IMPROVEMENT", "focus": "VOCABULARY", "source": "PROFESOR", "target": { "scope": "SPAN", "quote": "a lot of", "paragraph": 3, "occurrence": 2 }, "comment": "More precise and formal.", "suggestion": "many" },
    { "kind": "STRENGTH", "focus": "LINKING", "source": "PROFESOR", "target": { "scope": "SPAN", "quote": "as a result", "paragraph": 2 }, "comment": "Good linker.", "suggestion": null },
    { "kind": "STRENGTH", "focus": "GRAMMAR", "source": "PROFESOR", "target": { "scope": "SPAN", "quote": "a far larger number of", "paragraph": 4 }, "comment": "Well-modified comparative.", "suggestion": null },
    { "kind": "IMPROVEMENT", "focus": "CONTENT", "source": "IA", "target": { "scope": "DOCUMENT" }, "comment": "Say which measure matters more already in the introduction; the reader only finds out in the conclusion.", "suggestion": null }
  ]
}
```

### Campos

| Ruta | Tipo | Notas |
| --- | --- | --- |
| `format`, `version` | `"error-log-writing"`, `1` | Obligatorios |
| `writing.id` | UUID o null | El `uid` de Error-Log. Null en la primera importación |
| `writing.title` | 1–200 | Obligatorio |
| `writing.type` | `ESSAY` `REPORT` `PROPOSAL` `LETTER` `REVIEW` | Obligatorio. `LETTER` = Letter / Email |
| `writing.writtenOn` | `YYYY-MM-DD` o null | No futura |
| `writing.taskPrompt` | ≤ 5 000 o null | |
| `writing.text` | 1–20 000 | Obligatorio. Párrafos separados por una línea en blanco |
| `writing.wordRange` | `[min, max]` o null | Sustituye a 220–260 |
| `writing.timed`, `writing.minutes` | bool, entero ≥ 0 o null | Opcionales |
| `assessment` | objeto o null | |
| `assessment.status` | `AWAITING` `CORRECTED` `NOT_SUBMITTED` | Si falta, se deduce |
| `assessment.assessedBy` | `PROFESOR` `IA` `YO` o null | |
| `assessment.correctedOn` | fecha o null | No anterior a `writtenOn` ni futura |
| `assessment.scores` | `content`, `communicativeAchievement`, `organisation`, `language` | Cada uno 0–5 en pasos de 0,5, o null |
| `assessment.total` | número o null | No se guarda. Si no cuadra con la suma, la vista previa avisa |
| `assessment.teacherComment`, `personalNotes` | ≤ 5 000 o null | |
| `annotations[]` | hasta 300 | |
| `annotations[].id` | UUID | Solo en exportaciones |
| `annotations[].kind`, `focus`, `source` | ver §4 | `kind` y `source` obligatorios |
| `annotations[].target` | `{scope: "DOCUMENT"}`, `{scope: "PARAGRAPH", paragraph}` o `{scope: "SPAN", quote, paragraph?, occurrence?, before?, after?, start?, end?}` | |
| `annotations[].comment`, `suggestion` | ≤ 2 000 o null | Al menos uno, salvo en fortalezas con foco |
| `annotations[].reviewedAt` | ISO 8601 o null | Solo en exportaciones |

### Reglas

- El texto solo se normaliza así: CRLF pasa a LF y se recortan los espacios del principio y del final.
  Todo lo demás se guarda byte a byte.
- Si `writtenOn` es null, la vista previa la pide. Si se deja vacía, `date` toma `correctedOn` o la
  fecha de importación, y `date_basis` lo registra.
- Estado deducido cuando falta: `CORRECTED` si llega alguna puntuación, `assessedBy: PROFESOR` o una
  anotación de la profesora; si no, `AWAITING`.
- Límites: 500 KB por importación.

## 7. Importación y actualización

**A qué redacción corresponde un JSON:**

- Con `writing.id`: a esa redacción. Si no existe en esta base, se crea conservando el id.
- Sin id y con la misma huella de texto: a la que ya existe, que se propone actualizar.
- Sin id y con un texto parecido (≥ 0,6 de palabras compartidas, mismo tipo): la vista previa ofrece
  actualizarla o crear una nueva. Actualizar viene preseleccionado a partir de 0,85.
- Si no, se crea una redacción nueva con su sesión: `kind` y `paper` WRITING, `part` 1 para Essay y 2
  para el resto, fecha de la redacción, fuente elegida en la vista previa, `source_ref` = título,
  `duration_min` = minutos, `timed` y estado `CLOSED`.
- Con `?sesion=<id>` se enlaza esa sesión Writing libre en vez de crear otra. La sesión es de la
  persona: solo recibe el título como referencia si no tenía ninguna.

**Reglas al actualizar:**

- El texto guardado siempre gana. Si el del JSON difiere, la vista previa lo dice y las citas se buscan
  sobre el guardado.
- Un campo null o ausente no cambia nada. Los valores distintos se enumeran en la vista previa
  («Language: — → 2,5») y se aplican al confirmar.
- Lo descriptivo (título, enunciado y notas personales) solo rellena huecos: cada transcripción de la
  IA redacta el título a su manera y no debe pisar uno retocado a mano. La evaluación, las fechas y los
  datos de la tarea sí se sustituyen cuando llegan distintos.
- La sesión acompaña a su texto: si cambia la fecha o el tipo, cambian su fecha y su parte.
- Unas puntuaciones con `assessedBy: IA` no marcan el texto como corregido: lo corrige la profesora o
  uno mismo.
- Las anotaciones solo se añaden. Las repetidas (mismo `import_key` o mismo id) se omiten. Las que ya
  existen, también las propias, nunca se borran ni se modifican.
- Si llegan puntuaciones o anotaciones de la profesora, el estado pasa a `CORRECTED`.

**Garantías:**

- Una sola transacción `immediate`. El servidor vuelve a validar todo y no se fía de la vista previa.
- El recibo (`import_id` fijado al analizar más hash del contenido) hace que un reintento o un doble clic
  no dupliquen nada.
- El servidor recalcula el plan y rechaza la importación si la redacción cambió desde la vista previa.

**Instrucciones para la IA** (botón «Copy instructions for the AI»):

- Transcribe exactamente, con los errores; no corrijas nada.
- Escribe un párrafo por bloque, separados por una línea en blanco. No partas líneas dentro de un párrafo
  salvo en saludos, despedidas y encabezados.
- Solo lo que escribió la profesora va como `PROFESOR`. Lo que añadas tú va como `IA`.
- Copia la cita literal: el fragmento más corto que no se repita, con el número de párrafo y `occurrence`
  si se repite.
- Lo que no sepas va como `null`. Nunca inventes puntuaciones; `total` solo si la profesora lo escribió.

La segunda importación puede llevar el `id` («Copy JSON for the AI» en el lector) o fiarse de la huella.

## 8. Interfaz

**Biblioteca** (`/writing`, pestañas Biblioteca · Progreso · Reescrituras):

- Lista de documentos, no tabla. Título en serif; debajo tipo · fecha · palabras · anotaciones por revisar.
- Puntuación a la derecha en mono («12,5/20» o «—»). Rombo de aviso de `StatusText` en las pendientes.
- Búsqueda en vivo en título y texto, tipo, *All · Awaiting · Corrected* y orden (recientes primero).
- Acción primaria: **Import Writing**.

**Lector** (`/writing/<id>-<slug>`):

- Hoja de papel con Source Serif, `--reading-max` y párrafos amplios.
- Contador discreto en la esquina («97 words · 220–260»). Fuera de rango dice cuánto, sin alertas rojas.
- La evaluación va al pie de la hoja; la cabecera solo muestra el total.
- Desde 1024 px, panel fijo de 320 px a la derecha. Por debajo, el botón «Annotations (n)» abre el
  Drawer, que en móvil ocupa toda la pantalla.

**Anotaciones:**

| Tipo | Fondo | Subrayado |
| --- | --- | --- |
| Error | Rojo suave | Continuo, tinta `--study-red` |
| Mejora | Azul suave | Discontinuo |
| Fortaleza | Verde suave | Punteado |
| Comentario | Sin fondo | Punteado gris |

- De párrafo: filete de 3 px en el margen y un botón ¶. De documento: grupo «Whole text» en el panel.
- Procedencia como etiqueta pequeña (*Teacher · AI · Me*); lo de la IA dice además «AI suggestion».
- Pulsar un resaltado selecciona y despliega su anotación en el panel; si hay varias solapadas, las lista.
- El panel es la vía de teclado: botones, ↑/↓ o J/K, Intro lleva al fragmento, Escape cierra.
- Filtros por tipo y «Pending only»; *Annotated | Clean* oculta todos los resaltados.
- Crear: seleccionar texto → barra contextual *Error · Improvement · Strength · Comment* → editor con
  foco, comentario, corrección y procedencia («Me» por defecto).
- «Studied» marca una anotación como revisada. Borrar muestra un Toast con Deshacer.
- «Needs placing (n)» reúne las anotaciones sin colocar: elegir entre candidatos o seleccionar el
  fragmento y pulsar «Place here».

**Importación** (`/writing/importar`, con `?sesion=<id>` para enlazar una sesión libre):

- Pegar el JSON o elegir un `.json`; «Copy instructions for the AI»; «Paste text instead» abre un
  formulario manual que acaba en la misma vista previa.
- La vista previa dice si es nueva o actualización, enseña el texto en papel, los cambios, la
  evaluación, el recuento de anotaciones y sus problemas, y la fuente de la sesión.
- Nada se guarda hasta **Import writing** o **Update writing**.

**Evaluación:** el drawer actual con pasos de 0,5, corrector, fecha de corrección, estado, comentario de la
profesora y notas personales. Total solo con los cuatro criterios; si no, «3 de 4 criterios». Nunca se
convierte a la Cambridge English Scale.

**Navegación:** Writing pasa a la barra principal con G W.

## 9. Estadísticas

- Resumen en una línea: redacciones, corregidas y pendientes.
- Un gráfico SVG propio (sin librerías): medida (*Total · Content · Comm. · Org. · Lang.*), tipo y
  fechas desde/hasta. Eje ordinal con la fecha bajo cada punto. Los puntos con `date_basis` distinto
  de `WRITTEN` van huecos y se cuentan. «Show data» abre la tabla accesible.
- Media, n y última nota por criterio. «Strongest» y «Most room to improve» solo con n ≥ 3 por criterio
  y una diferencia de al menos 0,5.
- Las pendientes no cuentan para las medias; las incompletas solo cuentan en los criterios que tienen.
- Errores frecuentes: barras por foco de los errores de fragmento de la profesora y propios; los de la
  IA solo si se activan.

## 10. Contador de palabras

- Una palabra es una secuencia de letras o números, unida por apóstrofo o guion: *don't*, *well-known*
  y *2026* cuentan una.
- Cuenta todo el texto original, incluidos encabezados y saludo.
- Las anotaciones y las correcciones nunca alteran el recuento.
- Informativo: nunca penaliza.

## 11. Integración futura con el Error Log (fase D)

El modelo ya la admite gracias a la sesión de cada redacción. Un `ERROR` con corrección se convierte
en `error_row` así:

- Enunciado: la frase que contiene el fragmento. `myAnswer`: la cita. `correctAnswer`: la corrección.
- Categoría propuesta por el foco: SPELLING→SPELLING, COLLOCATION→COLOCACION, VOCABULARY→LEXICO,
  REGISTER→REGISTRO, LINKING→DISCURSO, ORGANISATION→ESTRUCTURA_TEXTO. En GRAMMAR elige el usuario.
- Causa, confianza y regla las rellena el usuario en el formulario de error de siempre.
- Una columna `error_id` en la anotación evita duplicados. Esos errores entran solos en Anki y en Q6.

## 12. Compatibilidad

- Q6, la regla 6 y la pestaña de reescrituras conservan su semántica; las diferencias admiten «+0,5».
- `/writing?edit=<id>` y el regreso desde Sesiones (`/writing?registrar=1&sesion=<id>`) siguen funcionando.
- El volcado JSON incluye las columnas nuevas; TASK C3 añade las anotaciones y sube el formato a 4.
- Las copias de seguridad exigen el esquema actual, incluidas las tablas nuevas.
- Taxonomías cerradas de SPEC §3 sin cambios.

## 13. Pruebas

- Vitest para la lógica pura y SQLite temporal real para repositorios y migraciones. Cobertura de
  `src/lib` por encima del 90 %.
- Playwright en español (`storageState`), con `e2e/language.spec.ts` para el inglés.
- Casos obligatorios: importaciones válidas e inválidas, texto byte a byte, duplicados, actualizaciones,
  puntuaciones parciales y completas, total sobre 20, persistencia de anotaciones, fragmentos repetidos y
  no localizables, contador de palabras, estadísticas cronológicas, filtros, migración y compatibilidad.

## 14. Tareas

### Fase A — Modelo e importación

- [x] **TASK A1 — Modelo y migración 0012.**
  Ampliar `writing_piece`, crear `writing_annotation` y `writing_import_receipt`, bandas con pasos de
  0,5, enums nuevos, «Letter / Email» y SPEC.
  **Archivos:** schema.ts, drizzle/0012, enums.ts, limits.ts, schemas.ts, repo.ts, PieceForm.tsx,
  actions.ts, page.tsx, backup.ts, seed.ts, recording.ts, i18n, SPEC.md.
  **Dependencias:** ninguna. **Pruebas:** migración con filas antiguas (IDs, secuencia, reescrituras,
  uid, estado, fechas), CHECK de bandas y de anotaciones, Zod con decimales.
  **Aceptación:** typecheck, lint, test y build; `e2e/writing.spec.ts` en verde.

- [x] **TASK A2 — Motor de importación.**
  Contrato Zod, texto (normalización, párrafos, palabras, huella), localización de citas, plan de
  creación o actualización y transacción con recibo.
  **Archivos:** src/lib/writing/{contract,text,locate,plan}.ts, src/lib/db/writingRepo.ts y pruebas.
  **Dependencias:** A1. **Pruebas:** JSON válido, mal formado e incompleto; puntuaciones inválidas
  (6, 2,3, −1); sin corregir y corregido; texto byte a byte (tildes, comillas, espacios dobles); citas
  repetidas, no encontradas, aproximadas y límite de palabra; duplicado; actualización por id, huella y
  parecido; nunca borra anotaciones; recibo; rollback.

- [x] **TASK A3 — Pantalla de importación e instrucciones para la IA.**
  **Archivos:** src/app/writing/importar/*, acciones, i18n.
  **Dependencias:** A2. **Pruebas E2E:** pegar → vista previa → importar; error legible; reimportar
  propone actualizar; doble clic sin duplicados.

- [x] **TASK A4 — Biblioteca, lector básico y navegación.**
  **Archivos:** src/app/writing/page.tsx, [writingKey]/page.tsx, AppHeader.tsx, redirección de `?edit`.
  **Dependencias:** A3. **Pruebas E2E:** búsqueda, filtros, orden, texto antiguo sin transcripción,
  móvil sin desplazamiento horizontal, atajo G W.

### Fase B — Lectura y anotaciones

- [x] **TASK B1 — Hoja, resaltados, panel y contador.** Navegación, filtros, *Annotated | Clean*,
  Drawer en móvil. **Pruebas:** segmentos, párrafos y palabras; E2E de clic, teclado y móvil.
- [x] **TASK B2 — Crear, editar, borrar, revisar y colocar.** El servidor verifica `exact` contra el
  texto guardado. **Pruebas:** persistencia, solapes, deshacer y colocación.
- [x] **TASK B3 — Corregir la transcripción.** Migración de `writing_text_history`, re-anclaje y
  recuento. **Pruebas:** reubicación, paso a sin colocar, historial.

### Fase C — Evaluación y progreso

- [x] **TASK C1 — Evaluación editable.** Drawer de detalles y bloque al pie de la hoja; estado
  editable. **Pruebas:** total solo con los cuatro criterios, decimales, parciales y transiciones.
- [ ] **TASK C2 — Progreso.** `src/lib/writing/progress.ts` y la pestaña con SVG. **Pruebas:** orden
  cronológico, fechas aproximadas, filtros, medias sin pendientes, umbral de n y sin duplicados.
- [ ] **TASK C3 — Exportación y documentación.** `/exportar/writing-<id>.json`, volcado v4 con
  anotaciones, `docs/WRITING-JSON.md`, GUIDE, README, SPEC, PRODUCT, DESIGN y demo.
  **Pruebas:** exportar y reimportar da lo mismo.

### Fase D — Solo si se justifica

- [ ] Integración de anotaciones con el Error Log (§11).
- [ ] Estadísticas finas por foco y criterio.
- [ ] Fotografías.

## 15. Lo que no se construye

OCR, llamadas a modelos de IA, corrección automática, editor WYSIWYG, colaboración, versionado del texto
más allá del historial de transcripciones, conversión a la Cambridge English Scale y librerías de gráficos.

---

## Registro de continuidad

| Fecha | Trabajo | Validación / siguiente paso |
| --- | --- | --- |
| 2026-10-15 | Análisis y plan aprobados con las cinco decisiones; rama feature/writing-workspace creada desde develop 7d23bfe | Continuar por TASK A1 |
| 2026-10-15 | TASK A1: `writing_piece` reconstruida con bandas REAL en medios puntos (CHECK `band*2` entero), `uid` UUID v4 por DEFAULT de SQLite, texto, huella, estado, base de la fecha, corrección, comentarios, rango de palabras y fechas de alta; tablas `writing_annotation` y `writing_import_receipt`; enums y relación foco → criterio en `enums.ts`; límites en `src/lib/writing/limits.ts`; «Letter / Email»; formulario con paso 0,5 y cifras con el separador del idioma. La migración 0012 se reescribió a mano: el `INSERT … SELECT` de drizzle-kit leía columnas inexistentes de la tabla vieja; ahora exige `foreign_keys` desactivadas como 0001 (con ellas activas `DROP TABLE` vaciaría `rewrite_of`), conserva la secuencia, rellena los textos antiguos y crea las tablas hijas después de la reconstrucción. Decisiones al implementar: guardar desde el formulario marca `CORRECTED` si hay evaluación, pero quitarla no devuelve a `AWAITING` (el estado puede venir de una importación); el seed y la grabación declaran `CORRECTED` en sus textos evaluados; la prueba de favoritos del Notebook ahora parte de «todo lo anterior a 0011». | `pnpm typecheck`, `pnpm lint` (solo los 4 avisos previos de `data/notebook-import/import.run.ts`, fuera del repositorio), 897 pruebas unitarias, cobertura 97,77 % sentencias y 93,39 % ramas, build E2E y suite Playwright completa (156 correctas, 7 omitidas por `SHOOT`). `data/errorlog.db` sin migrar. Siguiente TASK A2. |
| 2026-10-15 | TASK A1 confirmada en `8ec6218` (modelo) y `3a900af` (plan). TASK A2: `src/lib/writing/` con `text.ts` (normalización, párrafos, palabras, parecido), `locate.ts` (citas exactas o tolerantes a blancos, comillas, guiones y mayúsculas; límite de palabra; párrafo, aparición y contexto; nunca adivina), `contract.ts` (Zod estricto del JSON v1, lectura con valla de código y BOM, rutas de error como `annotations[4].target.quote`), `fingerprint.ts` (huellas de texto, anotación y contenido; solo servidor), `plan.ts` (crear o actualizar, cambios, fechas, estado, avisos, errores y `planDigest`) y `fixtures.ts`; `src/lib/db/writingRepo.ts` con vista previa sin escrituras y confirmación en una transacción `immediate` con recibo. Decisiones al implementar: lo descriptivo solo rellena huecos al actualizar; enlazar una sesión libre no cambia su fecha ni su parte; las notas de la IA no marcan el texto como corregido; un reintento reenvía la misma decisión y el recibo lo reconoce aunque el plan ya fuera otro. | `pnpm typecheck`, `pnpm lint` (mismos 4 avisos ajenos), 962 pruebas unitarias (65 nuevas), cobertura 97,9 % sentencias y 93,56 % ramas. Sin cambios de interfaz: E2E no necesarias. Siguiente TASK A3. |
| 2026-10-15 | TASK A2 confirmada en `d444db7` (motor) y `b6f2099` (registro). TASK A3: `/writing/importar` (`importar/page.tsx`, `WritingImport.tsx`, `import.module.css`) con JSON pegado o `.json`, vista previa calculada en el servidor (`importActions.ts`, `src/lib/writing/previewView.ts`): destino elegible, texto en la hoja de papel, datos, evaluación, cambios, anotaciones por colocar o aproximadas, avisos y errores que bloquean; fecha preguntada solo si el JSON no la trae; confirmación con `importId` y `digest`; «Copiar instrucciones para la IA» (`src/lib/writing/prompt.ts`, ejemplo comprobado contra el contrato) y formulario sin IA que genera el mismo JSON. «Importar Writing» es la acción primaria de la cabecera; el formulario antiguo queda secundario hasta A4. Etiquetas nuevas: estado, tipo y foco de anotación. Decisiones al implementar: la fecha vacía se envía siempre como «no la sé» (sin estado intermedio de «aún no preguntada»); `?sesion=<id>` ya enlaza una sesión libre, pero el regreso desde Sesiones sigue abriendo el formulario antiguo hasta A4; los `select` se asocian con `htmlFor` para que su nombre accesible no incluya la opción elegida. | `pnpm typecheck`, `pnpm lint` (mismos 4 avisos ajenos), 968 pruebas unitarias, cobertura 97,93 % sentencias y 93,48 % ramas, build E2E y suite Playwright completa (161 correctas, 7 omitidas por `SHOOT`; 5 nuevas en `writingImport.spec.ts`). Capturas revisadas a 1440 y 390 px, sin desplazamiento horizontal. Siguiente TASK A4. |
| 2026-10-15 | TASK A3 confirmada en `cae7b4e` (pantalla) y `ec05fd0` (registro). TASK A4: biblioteca en `/writing` (pestañas Biblioteca · Reescrituras; Progreso llega con C2) como lista de documentos con título en serif, tipo · fecha · palabras · «n por revisar» · «Sin transcripción» · «Reescritura», rombo en las pendientes y nota en mono a la derecha («12,5/20» o «—»); búsqueda en vivo en título y texto sin acentos (`src/lib/writing/library.ts`), estado *Todas · Pendientes (n) · Corregidas (n)*, tipo y orden (recientes, antiguas, mejor nota con las que no tienen total al final), todo en la URL (`q`, `estado`, `tipo`, `orden`). Lector básico en `/writing/<id>-<slug>` (`[writingKey]/page.tsx`, `src/lib/writing/urls.ts`): hoja de papel con tipo, fecha (marcada si es aproximada), palabras y estado, el total arriba, enunciado, párrafos con `pre-wrap` y la evaluación de solo lectura al pie; los textos antiguos dicen «Sin transcripción» y conservan su evaluación. Writing pasa a la barra principal con G W (también en la paleta); en móvil los seis destinos se reparten por anchura y caben a 320 px. `listWritingLibrary` en `writingRepo.ts` trae cada redacción con su sesión y las anotaciones sin estudiar. Decisiones al implementar: el formulario antiguo ya solo edita («Editar datos» en el lector) y la acción rechaza altas sin id, porque las redacciones nuevas entran por la importación (también el formulario sin IA); se retiran el alta, la elección de sesión libre y `writingSessionsWithoutPiece`; con transcripción el formulario oculta «Palabras» y `updateWritingPiece` conserva el recuento calculado; `?edit=<id>` redirige al lector con `?editar=1`, `?registrar=1[&sesion=<id>]` a la importación y el regreso desde Sesiones va directo a `/writing/importar?sesion=<id>`; al confirmar una importación se abre el lector (el resultado del repositorio incluye el título); la evaluación al pie es de solo lectura hasta C1 y el contador con rango queda para B1; los textos antiguos sin título usan `/writing/<id>`. | `pnpm typecheck`, `pnpm lint` (mismos 4 avisos ajenos), 986 pruebas unitarias, cobertura 97,96 % sentencias y 93,57 % ramas, build E2E y suite Playwright completa (164 correctas, 7 omitidas por `SHOOT`; 5 nuevas en `writingLibrary.spec.ts`, `writing.spec.ts` rehecho para la edición y los enlaces antiguos). Capturas revisadas a 1440, 390 y 320 px, sin desplazamiento horizontal. Fase A cerrada. |
| 2026-10-15 | TASK A4 confirmada en `45b4733`. `data/errorlog.db` migrada a 0012 con `pnpm db:migrate`, con copia previa verificada en `data/backups/previa-a-migrar-2026-10-15T17-30-35-227Z.db`. | Mismas filas en todas las tablas anteriores, `writing_annotation` y `writing_import_receipt` creadas y vacías, `integrity_check` correcto, `foreign_key_check` sin fallos y ninguna migración pendiente; la biblioteca y el contexto de importación responden sobre la base real. La 0012 ya es inmutable. Siguiente TASK B1. |
| 2026-10-15 | TASK B1: lector con contador y rango, resaltados exactos por fragmento y párrafo, modo Annotated/Clean, filtros por tipo y revisión, panel de escritorio y Drawer móvil; tarjetas navegables con ↑/↓, J/K, Intro y Escape. Los offsets solo se muestran si coinciden con `original_text`; el filtro no altera las anotaciones guardadas. E2E cubre clic, teclado, filtros, Drawer y ancho móvil. | `pnpm typecheck`, `pnpm lint` (4 avisos anteriores), build y 6 E2E de `writingLibrary.spec.ts` correctas. La primera ejecución completa de Vitest tuvo fallos temporales por concurrencia; la suite completa quedó verde al repetirla en B3 (994 pruebas). Siguiente TASK B2. |
| 2026-10-15 | TASK B2: acciones de servidor con Zod estricto y transacciones para crear, editar, borrar, estudiar y colocar; cada ancla se genera leyendo el texto guardado y comprobando los offsets UTF-16. Admite solapes y los tipos Documento, Párrafo y Fragmento. Las citas pendientes muestran coincidencias exactas elegibles o se colocan tras seleccionar texto. Borrar ofrece Deshacer mediante un token de corta duración ligado a la instancia local; restaurar comprueba de nuevo que el ancla siga coincidiendo. E2E recorre alta, edición, revisión, borrado, deshacer y colocación manual. | `pnpm typecheck`, `pnpm lint` (4 avisos anteriores), 4 pruebas SQLite del repositorio de anotaciones, 10 pruebas de mensajes, build y 7 E2E de `writingLibrary.spec.ts` correctas. Siguiente TASK B3. |
| 2026-10-15 | TASK B3: migración `0013` con `writing_text_history` por redacción y revisión; edición de transcripción incluso en textos históricos vacíos; recuento y huella recalculados. El historial y la actualización comparten una transacción. Los fragmentos buscan anclaje exacto y contextual en el texto nuevo; si no hay coincidencia segura pasan a «Por colocar». Los párrafos sobreviven cambios de número si su texto exacto sigue siendo único; si desaparecen o resultan ambiguos, quedan por colocar. Backups ahora exigen también la tabla de historial. | `pnpm typecheck`, `pnpm lint` (4 avisos anteriores), 994 pruebas Vitest, build y 8 E2E de `writingLibrary.spec.ts`; `pnpm db:migrate` aplicó 0013 tras crear y verificar la copia previa `data/backups/previa-a-migrar-2026-10-15T18-09-34-851Z.db`. Fase B cerrada. Siguiente TASK C1. |
| 2026-10-15 | TASK C1: el drawer permite editar estado, fecha de corrección, corrector, bandas de 0,5, comentario de la profesora y notas personales; fecha validada entre la fecha de escritura y hoy. El repositorio guarda el estado indicado sin inferirlo de las bandas. La suma sigue derivándose solo cuando existen los cuatro criterios y los parciales conservan el detalle disponible. | `pnpm typecheck`, `pnpm lint` (4 avisos anteriores), `pnpm exec vitest run --maxWorkers=2` (996 pruebas), build E2E y 4 pruebas de `e2e/writing.spec.ts`. Commit: `feat(writing): make assessments editable`. Siguiente TASK C2. |
