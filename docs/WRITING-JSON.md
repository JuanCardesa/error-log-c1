# JSON de Writing

Writing tiene un formato para importar una redacción y otro para conservar exactamente
las fechas cuando Error Log la exporta. Los dos usan `format: "error-log-writing"`.

## Importación v1

El prompt de **Preparar con IA** genera la versión 1. Pega el objeto completo en
**Writing → Importar**; la vista previa valida el contenido y no escribe hasta que
confirmas. Las claves desconocidas se rechazan. En campos opcionales, omitir la clave y
usar `null` significa «no lo sé», no borrar el valor guardado.

```json
{
  "format": "error-log-writing",
  "version": 1,
  "writing": {
    "id": null,
    "title": "Making cities more liveable",
    "type": "ESSAY",
    "writtenOn": "2026-10-02",
    "taskPrompt": "Which measure should local authorities prioritise?",
    "text": "Public transport can reduce traffic.\n\nThere effect is less direct.",
    "wordRange": null,
    "timed": true,
    "minutes": 80
  },
  "assessment": {
    "status": "CORRECTED",
    "assessedBy": "PROFESOR",
    "correctedOn": "2026-10-09",
    "scores": {
      "content": 4,
      "communicativeAchievement": 3,
      "organisation": 3,
      "language": 2.5
    },
    "total": 12.5,
    "teacherComment": null,
    "personalNotes": null
  },
  "annotations": [
    {
      "kind": "ERROR",
      "focus": "GRAMMAR",
      "source": "PROFESOR",
      "target": { "scope": "SPAN", "quote": "There", "paragraph": 2 },
      "comment": "Possessive determiner.",
      "suggestion": "Their",
      "reviewedAt": null
    }
  ]
}
```

### Campos principales

- `writing.id`: UUID de la redacción al actualizar; `null` al crear.
- `writing.title`: 1–200 caracteres. `type` es `ESSAY`, `REPORT`, `PROPOSAL`, `LETTER`
  o `REVIEW`.
- `writing.writtenOn`: fecha de escritura confirmada (`YYYY-MM-DD`) o `null`. Si no se
  conoce, Error Log pregunta y conserva la procedencia de la fecha que use.
- `writing.text`: transcripción exacta, de 1–20.000 caracteres. CRLF se convierte a LF y
  se recortan los extremos; el resto no se corrige ni se modifica.
- `wordRange`: `[mínimo, máximo]` o `null` para el rango predeterminado 220–260.
- `assessment.status`: `AWAITING`, `CORRECTED` o `NOT_SUBMITTED`. Las cuatro bandas,
  de 0 a 5 en medios puntos, pueden ser `null`; `total` solo comprueba la suma y no se guarda.
- `assessment.assessedBy`: `PROFESOR`, `YO`, `IA` o `null`; incluye fecha de corrección,
  comentario de la profesora y notas personales.
- `annotations` admite `ERROR`, `IMPROVEMENT`, `STRENGTH` y `COMMENT`; fuentes `PROFESOR`,
  `IA` y `YO`; focos de Writing y destinos `DOCUMENT`, `PARAGRAPH` o `SPAN`. Cada anotación
  necesita comentario o sugerencia, salvo una fortaleza que lleve foco.
- En `SPAN`, `quote` se copia literal. `paragraph`, `occurrence`, `before`, `after`, `start`
  y `end` ayudan a localizarla. Los offsets solo se usan si coinciden con la cita actual.
- `annotations[].id` y `reviewedAt` se aceptan para conservar una exportación; en una
  anotación nueva pueden omitirse. El servidor comprueba IDs e importaciones repetidas.

Los límites completos y las reglas de actualización están en
[WRITING-PLAN.md](WRITING-PLAN.md), secciones 6–7. Una importación sin ID usa la huella del
texto y, si hace falta, propone coincidencias parecidas. Una anotación existente nunca se
borra al importar.

## Exportación v2

En el lector, **Exportar JSON** descarga `/exportar/writing-<id>.json`. El archivo conserva
el ID UUID, todas las anotaciones, sus estados de estudio, las bandas y la fecha registrada.
Además de los campos v1, contiene:

```json
{
  "version": 2,
  "writing": {
    "writtenOn": null,
    "recordedDate": "2026-10-09",
    "dateBasis": "CORRECTED"
  }
}
```

`recordedDate` es la fecha guardada por Error Log; `dateBasis` es `WRITTEN`, `CORRECTED`
o `IMPORTED`. `writtenOn` solo se rellena con una fecha que se sabe que corresponde a la
escritura. Así una fecha aproximada no se vuelve una fecha confirmada al reimportar.
Las versiones 1 y 2 se aceptan; el prompt de IA continúa pidiendo v1.

Reimportar una exportación v2 sobre su misma base, usando su ID, no crea duplicados ni
cambia datos: la vista previa indica que no hay nada que actualizar. Los textos históricos
sin transcripción no tienen exportación individual; sus filas siguen incluidas en el dump
completo y se pueden transcribir desde el lector.

## Dump completo v4

`/exportar/dump.json` es un volcado de portabilidad, **no** un archivo de restauración ni
de importación. La propiedad `formatVersion` es `4`; contiene las filas, Anki, el Notebook
y `writingAnnotations` con sus filas crudas (incluidos IDs, anclajes, revisión e
`importKey`). El Notebook se añade por streaming. Para restaurar una base completa usa
`pnpm db:backup` y `pnpm db:restore`.
