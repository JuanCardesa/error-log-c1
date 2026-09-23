# Bloque 4: revisión compacta de tandas. Especificación de implementación

Documento de traspaso para implementar el bloque 4 del [PLAN.md](PLAN.md) sin más
contexto que este repositorio. Parte del commit `b373989` de la rama `feature/ui-redesign`.
Todo lo que hace falta saber está aquí. Si algo no encaja con el código, **para y pregunta**:
no improvises sobre la lógica de negocio.

---

## 0. Antes de tocar nada

1. **Rama.** `git branch --show-current` tiene que decir `feature/ui-redesign`. Nunca trabajes
   en `develop` ni en `main`.
2. **Next.js.** Este repo usa **Next.js 16**, con cambios respecto a lo que conoces. Lee
   `AGENTS.md`. Antes de usar una API de Next, consulta `node_modules/next/dist/docs/`. En este
   bloque solo se usan `useRouter` y la integración de `window.history.replaceState`
   (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`,
   sección «Native History API»).
3. **Línea base.** Ejecuta y apunta el resultado. Debe estar todo en verde antes de empezar:
   ```bash
   pnpm typecheck && pnpm lint && pnpm test      # 584 tests unitarios
   pnpm test:e2e                                 # 55 pasan, 5 omitidos
   ```
   `pnpm test:e2e` hace `next build` y levanta la app en el puerto 3210 con un AnkiConnect
   falso. No lo ejecutes a la vez que `pnpm demo` o `pnpm dev`: comparten `.next`.
4. **Documentos que leer:**
   - `PRODUCT.md`: quién usa esto y para qué.
   - `DESIGN.md`: el sistema visual. Aún describe el estado previo al rediseño; los tokens
     vigentes están en `src/app/globals.css`.
   - `docs/ui-review/AUDIT.md`, apartados A y C y el problema 1: por qué existe este bloque.

## 1. Reglas no negociables

- **No se toca** nada de `src/lib/**`: validación Zod, importadores, repositorio, AnkiConnect ni
  exportadores. Tampoco las Server Actions (`src/app/registrar/importActions.ts`,
  `src/app/registrar/actions.ts`). Solo se pueden **importar** constantes y tipos de `src/lib`.
- **El `FormData` que se envía al servidor es idéntico al actual:** mismos nombres (`N.itemRef`,
  `N.prompt`, `N.myAnswer`, `N.correctAnswer`, `N.cause`, `N.category`, `N.subcategory`,
  `N.confidence`, `N.ruleNote`, `N.lateInSession`, y los de cabecera `date`, `kind`, `paper`,
  `part`, `source`, `sourceRef`, `itemsTotal`, `itemsCorrect`, `timed`, `durationMin`), la misma
  construcción del `payload` (`envelope` / `rows` / `sessionId`) y la misma elección de acción
  (`importSessionAction` si no hay destino, `importErrorsAction` si lo hay). La función
  `action={(form) => { … }}` de `ImportReview` solo se amplía con la comprobación de
  pendientes del paso 2.4. El resto no cambia.
- **Todos los campos de cada fila siguen en el DOM**, aunque estén plegados. El envío los lee
  con `form.get(...)`.
- **Commits pequeños** con conventional commits, uno por cada paso de la sección 3. Cada commit
  tiene que pasar `typecheck`, `lint`, los unitarios y los e2e que le afecten.
- **Textos:** la interfaz está en español y usa las mismas cadenas que hoy. Donde este documento
  da un texto nuevo, cópialo literal. **No añadas ni quites tildes en textos existentes:** eso es
  el bloque 6.
- **Estilo:** solo tokens de `src/app/globals.css` (`var(--…)`) y primitivas de
  `src/app/_shared/ui.module.css` (`ui.primary`, `ui.secondary`, `ui.small`, `ui.danger`,
  `ui.hint`, `ui.note`, `ui.noticeOk`, `ui.noticeError`, `ui.fieldError`, `ui.label`,
  `ui.help`, `ui.chipStudy`/`ui.chipExec`, `ui.panel`). Prohibido:
  - colores o radios literales;
  - sombras (regla del sistema: todo es plano, la profundidad se da con tono y filete);
  - bordes laterales de color de más de 1 px;
  - `style={{…}}` en línea.
- **Comentarios** en español, sin tildes en el código (como el resto del repo) y solo donde
  expliquen un porqué.

## 2. Situación actual

### El flujo

Hay dos entradas que acaban en el **mismo** componente de revisión, `ImportReview`, exportado
desde `src/app/registrar/BulkImport.tsx`:

| Entrada | Dónde | Componente | Qué pega | Al guardar |
|---|---|---|---|---|
| **Tanda de Macmillan** (la principal, a diario) | `/registrar`, sin sesión | `SessionImport.tsx` | Sobre JSON `{ "session": {…}, "errors": [...] }` | `router.push('/registrar?s=ID')`. El mensaje se descarta (`_message`) |
| **Pegar varios errores** | `/registrar?s=N`, dentro de una sesión abierta | `BulkImport` (en el mismo fichero) | Array JSON o celdas TSV | Aviso `role="status"` en la misma página y vuelta al área de pegado |

`ImportReview` recibe `drafts: ImportDraft[]` (tipo en `src/lib/import/errors.ts`; todos los
campos son `string` salvo `lateInSession: boolean`). Muestra **un `<fieldset>` por error con
el `ErrorFields` completo**: 9 campos más la casilla, en la rejilla de captura. En una tanda
de Macmillan real, `correctAnswer`, `category` y `ruleNote` llegan **vacíos** en todas las
filas; `prompt`, `myAnswer` e `itemRef` llegan rellenos, y `cause` y `confidence` llegan con
los valores por defecto `DESCONOCIMIENTO` y `DUDABA`. Resultado con 12 errores: 5.546 px de
página, 143 controles, 36 campos obligatorios vacíos, ningún contador, el botón de guardar
solo al final y, al terminar, ningún mensaje.

### Ficheros implicados

- `src/app/registrar/BulkImport.tsx`: `BulkImport` (área de pegado) y `ImportReview` (revisión).
- `src/app/registrar/SessionImport.tsx`: entrada de Macmillan.
- `src/app/registrar/ErrorFields.tsx`: los campos de un error, compartidos por captura, edición
  y revisión. Ya tiene:
  - Categoría como `<select>` con `CATEGORY_LABELS`;
  - Causa, Categoría, Subcategoría y Confianza con `<label htmlFor>` fuera del control;
  - mensajes de campo sin `role="alert"`, con `id` enlazado por `aria-describedby`;
  - el atributo `data-field="<campo>"` en cada `<p>` de error.
- `src/app/registrar/bulk.module.css`, `src/app/registrar/capture.module.css`.
- `src/app/registrar/page.tsx`: página de sesión, donde irá el aviso de «tanda guardada».
- `src/app/registrar/CaptureForm.tsx`: al montar, enfoca el campo Ítem. Esto importa en el
  paso 3.
- `src/app/_shared/usePreservedForm.ts`: impide que React vacíe el formulario tras una acción
  rechazada. Se sigue usando tal cual.
- e2e: `e2e/import.spec.ts`, `e2e/session-import.spec.mjs` y `e2e/demo.spec.ts` (este último
  solo corre con `SHOOT=1`, pero tiene que seguir funcionando).

### Contratos de los e2e que no se pueden romper

Estos selectores se usan hoy y **deben seguir encontrando lo mismo**:

- `getByRole('heading', { name: 'Revisar N errores' })`: el `h3` con ese texto exacto
  («Revisar 1 error» en singular).
- `getByRole('group', { name: 'Error N', exact: true })`: cada fila es un `<fieldset>` cuyo
  `<legend>` dice **exactamente** `Error N`, con N = posición actual + 1.
- Dentro de cada grupo: `getByLabel('Correcta *')`, `getByLabel('Categoria *')`,
  `getByLabel('Regla, con tus palabras *')`, `getByRole('combobox', { name: /^Causa/ })`,
  `getByRole('combobox', { name: 'Confianza', exact: true })` y
  `locator('[data-field="ruleNote"]')`. **Causa y Confianza tienen que estar visibles sin
  desplegar nada:** Playwright no puede elegir en un `<select>` oculto.
- Botones: `Quitar error N de la tanda`, `Guardar N errores` / `Guardar 1 error`,
  `Crear sesión y guardar N errores` / `… 1 error` / `… 0 errores`, `Preparar vista previa`,
  `Revisar sesión y errores` y `Copiar instrucciones para la IA`.
- Etiquetas: `Errores para importar`, `Sesión y errores para importar`, `Destino de la tanda`,
  `Instrucciones para la IA`, y el grupo `Cabecera propuesta` con sus campos.
- Textos de `summary`: `Convertir mis correcciones con IA` y `Pegar desde una hoja de calculo`.
- Avisos: `getByRole('status')` con `2 errores guardados.`, `0 errores guardados. 2 repetidos
  omitidos`, `1 error guardado.` y `no se suman automáticamente`; `getByRole('alert')` con
  `No se ha guardado ningun error`, `ya no esta abierta`, `No se ha creado ninguna sesión`,
  `Sobre inválido` y `Este bloque solo trae errores`.
- Tras guardar en «Pegar varios», `getByLabel('Errores para importar')` vuelve a estar
  visible y vacío.
- `session-import.spec.mjs:86` espera `toHaveURL(/registrar\?s=ID$/)`. Ver el paso 3.

## 3. Pasos de implementación (un commit por paso)

### Paso 1 · Funciones puras de revisión y sus tests

**Commit:** `feat(ui): add pure helpers to track incomplete rows in a pasted batch`

Crea `src/app/registrar/reviewRows.ts`, sin `'use client'`, sin React y sin DOM:

```ts
import { CATEGORIES } from '@/lib/domain/enums';
import type { ImportDraft } from '@/lib/import/errors';
import { RULE_NOTE_MIN_LENGTH } from '@/lib/validation/schemas';

/** Lo que la revision necesita saber de cada fila para decir si esta completa. */
export interface RowSnapshot {
  readonly itemRef: string;
  readonly prompt: string;
  readonly myAnswer: string;
  readonly correctAnswer: string;
  readonly category: string;
  readonly ruleNote: string;
}

/** Campos obligatorios que pueden faltar, en el orden en que se piden. */
export type MissingField = 'correctAnswer' | 'category' | 'ruleNote' | 'prompt';

export const MISSING_LABELS: Readonly<Record<MissingField, string>> = {
  correctAnswer: 'correcta',
  category: 'categoria',
  ruleNote: 'regla',
  prompt: 'enunciado',
};

export function snapshotFromDraft(draft: ImportDraft): RowSnapshot { /* copia los 6 campos */ }

/** Lee una fila del FormData del formulario de revision (campos con prefijo `N.`). */
export function readRow(data: FormData, id: number): RowSnapshot {
  /* para cada campo: const v = data.get(`${id}.${campo}`); typeof v === 'string' ? v : '' */
}

/** Que le falta a una fila para poder guardarse. Vacio = completa. */
export function missingFields(row: RowSnapshot): MissingField[] {
  // correctAnswer: row.correctAnswer.trim() === ''
  // category: no es uno de CATEGORIES
  // ruleNote: row.ruleNote.trim().length < RULE_NOTE_MIN_LENGTH
  // prompt: row.prompt.trim() === ''
  // Devuelve en el orden de MissingField: correctAnswer, category, ruleNote, prompt.
}
```

Notas:
- Estas funciones solo detectan lo **vacío o incompleto**. Las reglas de negocio (la regla no
  puede ser la respuesta, etc.) las sigue aplicando el servidor al guardar. No las copies.
- `MISSING_LABELS` va sin tilde en `categoria` a propósito: coincide con la etiqueta actual
  «Categoria». El bloque 6 añadirá las tildes en todos los sitios a la vez.

Crea `src/app/registrar/reviewRows.test.ts` con Vitest (entorno `node`, que ya incluye
`FormData`). Casos mínimos:
1. Un borrador de Macmillan típico (`prompt` y `myAnswer` rellenos; `correctAnswer`,
   `category` y `ruleNote` vacíos) → `['correctAnswer', 'category', 'ruleNote']`.
2. Una fila completa → `[]`.
3. Una regla de 14 caracteres cuenta como pendiente; una de 15, no.
4. Una categoría desconocida (`'PREPOSITION'`) cuenta como pendiente; una válida
   (`'LEXICO'`), no.
5. Solo espacios en `correctAnswer` o `prompt` → pendiente.
6. `readRow` lee `3.correctAnswer` y los demás de un `FormData` y devuelve `''` para lo que
   no viene.

Mira `src/app/_shared/formData.test.ts` para el estilo: `describe` e `it` en español.

### Paso 2 · Revisión compacta con contador y barra fija

**Commit:** `feat(ui): review pasted batches as compact rows with a pending counter`

Es el paso grande. Toca `ErrorFields.tsx`, `capture.module.css`, `BulkImport.tsx`
(`ImportReview`), `bulk.module.css` y los e2e de importación, solo para añadir pruebas.

#### 2.1 Aspecto objetivo de una fila (escritorio)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Error 3   [Falta: correcta, categoria, regla]         [Quitar error 3 de …] │ ← cabecera de fila
│ item 4 · They called ___ the meeting.   tu respuesta: ~~of~~                 │ ← resumen (solo lectura)
│                                                                              │
│ CORRECTA *        CAUSA              CATEGORIA *            CONFIANZA         │
│ [__________]      [DESCONOCIMIENTO▾] [Elige una categoría▾] [DUDABA ▾]        │ ← campos principales
│                   (estudio · tarjeta)                                         │
│ REGLA, CON TUS PALABRAS *                                                     │
│ [______________________________________________________________________]    │
│ ▸ Item, enunciado, tu respuesta y subcategoria                                │ ← <details>, plegado
└──────────────────────────────────────────────────────────────────────────────┘
```

Por debajo de 760 px, todo en una columna.

Barra fija al pie de la revisión, siempre visible mientras se hace scroll:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Faltan 7 de 12 por completar.  [Ir al siguiente pendiente] [Crear sesión y   │
│                                 guardar 12 errores]  [Volver al texto pegado]│
└──────────────────────────────────────────────────────────────────────────────┘
```

#### 2.2 `ErrorFields`: variante compacta

Añade a `Props`:

```ts
/** Revision de una tanda: solo lo que hay que completar a la vista; el resto, plegado. */
readonly compact?: boolean;
/** Solo con `compact`: abre el bloque plegado (lo decide la fila). */
readonly detailsOpen?: boolean;
/** Solo con `compact`: el usuario abre o cierra el bloque plegado. */
readonly onDetailsToggle?: (open: boolean) => void;
```

Con `compact` **ausente o `false`**, el componente se comporta y renderiza **exactamente
igual que ahora**. Lo usan la captura y la edición, y sus e2e no pueden cambiar.

Con `compact === true`, el componente devuelve los **mismos elementos de campo** (mismos
`name`, `id`, `aria-*` y lógica, sin duplicar código de campos) repartidos en dos
contenedores:

```tsx
<>
  <div className={styles.review}>
    {/* principales, en este orden de DOM: Correcta, Causa, Categoria, Confianza, Regla */}
  </div>
  <details
    className={styles.reviewMore}
    open={open}
    onToggle={(event) => { onDetailsToggle?.(event.currentTarget.open); }}
  >
    <summary>Item, enunciado, tu respuesta y subcategoria</summary>
    <div className={styles.reviewMoreGrid}>
      {/* plegados, en este orden: Item, Enunciado, Mi respuesta, Subcategoria, marcas (fFlags) */}
    </div>
  </details>
</>
```

- **Implementación recomendada:** guarda cada campo en una constante JSX (`const itemField = (…)`,
  `const promptField = (…)`, etc.). Devuelve el orden actual si `!compact` y los dos contenedores
  si `compact`. Así la lógica de cada campo sigue en un solo sitio.
- **`open`** es `detailsOpen === true || detailInvalid`, donde `detailInvalid` vale `true` si hay
  errores del servidor en alguno de `itemRef`, `prompt`, `myAnswer`, `subcategory`,
  `lateInSession` o `ankiAdded`. Un campo con error no puede quedar escondido.
- **Placeholder de Regla:** en compacto es `Por que es asi, con tus palabras`. Sin compacto
  sigue siendo el actual. El de ahora («call off lleva doble f…») se repetía en las 12 filas y
  parecía contenido.
- **Área de cada campo:** los contenedores de campo conservan sus clases (`styles.fCorrect`,
  `styles.fCause`…). Solo cambian el contenedor padre y las áreas de la rejilla (2.5). **No**
  pongas `capture.grid` en la variante compacta: sus reglas `.grid .fX { grid-area }`
  asignarían áreas que no existen.

#### 2.3 `ImportReview`: estado y fila

En `BulkImport.tsx`, dentro de `ImportReview`:

1. **`noValidate` en el `<form>`.** Con campos plegados, la validación nativa del navegador
   bloquea el envío sin avisar («An invalid form control is not focusable») o saca una burbuja
   por campo. La sustituye la comprobación del 2.4, y el servidor sigue validando todo.

2. **Instantáneas de las filas** para el contador y el resumen:
   ```ts
   const [snapshots, setSnapshots] = useState<ReadonlyMap<number, RowSnapshot>>(
     () => new Map(drafts.map((draft, id) => [id, snapshotFromDraft(draft)])),
   );
   const [dirty, setDirty] = useState(false);
   ```
   En el `<form>`, añade `onInput={refresh}` y `onChange={refresh}`, donde `refresh`:
   - lee `event.target`. Si es un control con `name` que casa con `/^(\d+)\./`, toma el `id`,
     hace `readRow(new FormData(formRef.current), id)` y actualiza esa entrada del `Map`,
     creando un `Map` nuevo;
   - en cualquier caso, `setDirty(true)`.

   `formRef` es el que ya devuelve `usePreservedForm()`.

3. **Pendientes:**
   `const pending = rows.filter(({ id }) => missingFields(snapshots.get(id) ?? EMPTY_SNAPSHOT).length > 0);`
   (define un `EMPTY_SNAPSHOT` con los seis campos vacíos).

4. **Filas plegadas abiertas por el usuario:** `const [openRows, setOpenRows] = useState<ReadonlySet<number>>(new Set())`.
   A `ErrorFields` le pasas `detailsOpen={openRows.has(id) || missing.includes('prompt')}`: si
   falta el enunciado, que está en el bloque plegado, se abre solo. `onDetailsToggle` añade o
   quita el `id` del conjunto.

5. **Estructura de cada fila.** Sustituye el `<fieldset>` actual por:
   ```tsx
   <fieldset key={id} disabled={pending /* el de useActionState */} className={styles.row}>
     <legend>Error {index + 1}</legend>
     <div className={styles.rowHead}>
       <RowStatus missing={missing} rejected={Object.keys(rowErrors).length > 0} />
       <button type="button" className={`${ui.secondary} ${ui.small}`} onClick={…}>
         Quitar error {index + 1} de la tanda
       </button>
     </div>
     <p className={styles.rowSummary}>…</p>
     <ErrorFields compact detailsOpen={…} onDetailsToggle={…}
       timed={target?.timed ?? timed} subcategorySuggestions={subcategorySuggestions}
       defaults={draft} namePrefix={`${String(id)}.`} fieldErrors={rowErrors} />
   </fieldset>
   ```
   - `rowErrors = errorsForRow(state.fieldErrors, sentIds.indexOf(id))`, igual que ahora.
   - **Cuidado con los nombres:** la variable `pending` del `useActionState` ya existe. Llama al
     array de filas incompletas `incompleteRows` (o similar) para no chocar.
   - El `<legend>` tiene que ser el **primer hijo** del `fieldset` y su texto exacto `Error N`.
     Para que la cabecera quede en una línea, usa CSS (2.5): el `legend` flota a la izquierda y
     `rowHead` se alinea a su lado.
   - **`RowStatus`** es un pequeño componente en el mismo fichero:
     - si `rejected`: chip `Rechazado: revisa los campos marcados`, en rojo de ejecución
       (`--exec` sobre `--exec-bg`);
     - si no, y `missing.length > 0`: chip `Falta: ` + `missing.map((f) => MISSING_LABELS[f]).join(', ')`,
       en ocre (`--queued` sobre `--queued-bg`);
     - si no: chip `Completo`, en verde (`--ok` sobre `--ok-bg`).

     Son chips de estado, no de causa: forma de píldora, `font-size: var(--fs-xs)`,
     `padding: 0 var(--sp-3)` y borde de 1 px del color del texto.
   - **Resumen de solo lectura** (`rowSummary`), sacado de la instantánea, no del borrador, para
     que refleje lo editado en el bloque plegado:
     `{itemRef && <span className="data">item {itemRef}</span>}` · el enunciado (o
     `<em>sin enunciado</em>` si está vacío) · `{myAnswer && <span>tu respuesta: <s className="data">{myAnswer}</s></span>}`.
     Separa las partes con ` · ` y no metas nada interactivo.
   - **Quitar una fila:** además del `setRows(...)` actual, lleva el foco al campo
     `${siguienteId}.correctAnswer` de la fila que ocupa ahora su sitio o, si era la última, al
     `h3`. Usa el mecanismo `focusRequest` del punto 2.4.

6. **El `h3` sube al principio del formulario**, antes de `envelopeSession`, `Destino de la
   tanda` y `Cabecera propuesta`. Conserva el texto exacto `Revisar {n} {error|errores}`,
   añádele `tabIndex={-1}` y un `ref`, y **enfócalo al montar `ImportReview`**
   (`useEffect(() => { headingRef.current?.focus(); }, [])`). Así, tras pulsar «Revisar sesión
   y errores» o «Preparar vista previa», el foco ya no se pierde en `body`.

7. **Pistas:** el párrafo que hoy dice «Comprueba las correcciones y la regla. Si no venian
   causa y confianza, proponemos DESCONOCIMIENTO y DUDABA…» se mantiene tal cual bajo el `h3`.
   El de «Los errores ya registrados en esta sesion se omiten…» pasa a justo antes de la barra.

#### 2.4 Barra fija, «Ir al siguiente pendiente» y envío con pendientes

Sustituye el `<div className={styles.actions}>` actual por la barra:

```tsx
<div className={styles.bar}>
  <p className={styles.barStatus} aria-live="polite">
    {incompleteRows.length === 0
      ? rows.length === 0 ? '' : `${rows.length === 1 ? 'El error esta completo' : `Los ${String(rows.length)} errores estan completos`}.`
      : `Faltan ${String(incompleteRows.length)} de ${String(rows.length)} por completar.`}
  </p>
  {incompleteRows.length > 0 && (
    <button type="button" className={`${ui.secondary} ${ui.small}`} onClick={goToNextPending}>
      Ir al siguiente pendiente
    </button>
  )}
  {/* el boton submit actual, con los MISMOS textos y la misma condicion de disabled */}
  {/* el control de «Volver al texto pegado» del paso 4 */}
</div>
```

- Si hubo un intento de guardar bloqueado (`blocked === true`, ver abajo), el texto del estado
  es `Completa los errores pendientes antes de guardar. Faltan N de M.` y se pinta con
  `ui.fieldError`.
- **`goToNextPending()`** coge la primera fila de `incompleteRows` que venga **después** de la
  fila que contiene `document.activeElement`. Si no hay ninguna, vuelve a la primera. Su primer
  campo que falta es `missingFields(...)[0]`. Si es `prompt`, añade el `id` a `openRows`. Luego
  pide foco:
  ```ts
  const [focusRequest, setFocusRequest] = useState<{ id: number; field: string } | null>(null);
  useEffect(() => {
    if (focusRequest === null) return;
    const element = formRef.current?.elements.namedItem(`${String(focusRequest.id)}.${focusRequest.field}`);
    if (element instanceof HTMLElement) {
      element.focus();
      element.scrollIntoView({ block: 'center' });
    }
    setFocusRequest(null);
  }, [focusRequest, formRef]);
  ```
  El efecto corre después del render, así que el `<details>` ya está abierto cuando se enfoca.
  Si el linter (`react-hooks`) se queja de `setFocusRequest(null)` dentro del efecto, usa un
  `useRef` como bandera en vez de estado para limpiar la petición.
- **Envío con pendientes.** Al principio de la función `action={(form) => { … }}`, antes de
  construir `values`:
  ```ts
  if (incompleteRows.length > 0) { setBlocked(true); goToNextPending(); return; }
  setBlocked(false);
  ```
  No se llama a `action(payload)`, así que el servidor ni se entera. `blocked` es un
  `useState(false)` nuevo que vuelve a `false` cuando `incompleteRows.length` llega a 0 (hazlo
  al calcularlo; no hace falta un efecto).
- **Tras un rechazo del servidor**, con el foco en el primer campo marcado:
  ```ts
  useEffect(() => {
    if (!state.ok && Object.keys(state.fieldErrors).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [state, formRef]);
  ```
  (`ErrorFields` ya abre el bloque plegado si el error está dentro.) El `<p role="alert">` con
  `state.message` sigue donde está, **justo encima de la barra**.

#### 2.5 CSS

En `src/app/registrar/capture.module.css`, añade la rejilla compacta. Las áreas usan las mismas
clases de campo, pero bajo contenedores distintos de `.grid`:

```css
/* ── Revision de una tanda: lo que hay que completar, a la vista ─────────── */

.review {
  display: grid;
  gap: var(--sp-4);
  grid-template-columns: minmax(8rem, 1fr) minmax(9rem, 1fr) minmax(12rem, 1.4fr) minmax(8rem, 0.8fr);
  grid-template-areas:
    'correct  cause  category  conf'
    'rule     rule   rule      rule';
  align-items: start;
}

.review .fCorrect { grid-area: correct; }
.review .fCause { grid-area: cause; }
.review .fCategory { grid-area: category; }
.review .fConfidence { grid-area: conf; }
.review .fRule { grid-area: rule; }

.reviewMore { margin-top: var(--sp-4); }
.reviewMore > summary { cursor: pointer; color: var(--ink-soft); font-size: var(--fs-sm); }

.reviewMoreGrid {
  display: grid;
  gap: var(--sp-4);
  margin-top: var(--sp-4);
  grid-template-columns: 5rem minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    'item   prompt   mine    subcat'
    'flags  flags    flags   flags';
  align-items: start;
}

.reviewMoreGrid .fItem { grid-area: item; }
.reviewMoreGrid .fPrompt { grid-area: prompt; }
.reviewMoreGrid .fMine { grid-area: mine; }
.reviewMoreGrid .fSubcategory { grid-area: subcat; }
.reviewMoreGrid .fFlags { grid-area: flags; }

/* Los campos de ambos contenedores se comportan como en la captura. */
.review label, .review > div, .reviewMoreGrid label, .reviewMoreGrid > div { display: block; min-width: 0; }
.review input, .review select, .review textarea,
.reviewMoreGrid input, .reviewMoreGrid select, .reviewMoreGrid textarea { width: 100%; }
```

Y dentro del `@media (max-width: 760px)` existente: `.review` y `.reviewMoreGrid` pasan a
`grid-template-columns: 1fr; grid-template-areas: none;`, con sus hijos a
`grid-area: auto; grid-column: 1;` (copia el patrón que ya hay para `.grid`).

**Comprueba** que las reglas de `.check` y `.labelRow` siguen aplicando: son clases propias, así
que sí. Revisa también que `display: block` no pise el `display: flex !important` de
`ui.check`: el `!important` gana. Si no, excluye `.fFlags label`.

En `src/app/registrar/bulk.module.css`:
- **Borra** `.row .fields { … }` y su versión en el `@media`: la revisión ya no usa
  `capture.grid`.
- **Borra** `.row > button { … }`: el botón Quitar pasa a `rowHead`.
- **Añade:**
  ```css
  .row > legend { float: left; padding: 0; margin-right: var(--sp-4); font-weight: 600; }
  .rowHead { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-4); }
  .rowSummary { clear: both; margin: var(--sp-3) 0 var(--sp-4); color: var(--ink-soft); font-size: var(--fs-sm); overflow-wrap: anywhere; }
  .rowSummary s { color: var(--exec); }
  .statusPending, .statusDone, .statusRejected { display: inline-block; padding: 0 var(--sp-3); border: 1px solid; border-radius: var(--radius-pill); font-size: var(--fs-xs); }
  .statusPending { color: var(--queued); background: var(--queued-bg); }
  .statusDone { color: var(--ok); background: var(--ok-bg); }
  .statusRejected { color: var(--exec); background: var(--exec-bg); }
  /* La barra acompaña el scroll: guardar y el recuento siempre a mano en tandas largas. */
  .bar { position: sticky; bottom: 0; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3) var(--sp-4); margin-top: var(--sp-5); padding: var(--sp-4) 0; background: var(--surface); border-top: 1px solid var(--rule-strong); }
  .barStatus { margin: 0 auto 0 0; font-size: var(--fs-sm); }
  ```
- **Mantén** `.row { margin; padding; border }`, `.row .headerFields` y `.paste`.
  `.actions` queda sin uso tras el paso 2: bórralo si nadie lo usa (búscalo antes con grep).

**Contraste:** los tres chips usan pares que ya pasan AA (ocre 5,32:1, verde 5,42:1 y rojo
5,52:1). No inventes otros.

#### 2.6 Pruebas del paso 2 (añadir en `e2e/import.spec.ts`)

Test nuevo: **«cuenta los errores pendientes y no envía hasta completarlos»**:
1. `openImport(page)`; pega `JSON.stringify([rows[0], { ...rows[1], correctAnswer: '' }])` y
   pulsa «Preparar vista previa».
2. `expect(page.getByRole('heading', { name: 'Revisar 2 errores' })).toBeFocused()`.
3. Comprueba que se ve `Faltan 1 de 2 por completar.` y que el grupo `Error 2` contiene
   `Falta: correcta`.
4. Pulsa `Guardar 2 errores`: **no** aparece la tabla `Errores registrados en esta sesion` y el
   foco está en el `Correcta *` del grupo `Error 2`.
5. Rellena `in` → se ve `Los 2 errores estan completos.` → guarda → `2 errores guardados.`

Test nuevo: **«pulsar Ir al siguiente pendiente abre y enfoca lo que falta»**: pega
`[{ ...rows[0], prompt: '' }]`, pulsa «Ir al siguiente pendiente» y comprueba que el
`Enunciado *` del grupo `Error 1` es visible y tiene el foco.

**No cambies** lo que comprueban los tests existentes. Si alguno falla, el fallo está en la
implementación, no en el test. La única excepción está en el paso 3.

### Paso 3 · Confirmación al guardar

**Commit:** `feat(ui): confirm a saved batch on the session page`

1. **Nuevo `src/app/registrar/SavedNotice.tsx`** (`'use client'`):
   ```tsx
   export function SavedNotice({ message, sessionId }: { readonly message: string; readonly sessionId: number }) {
     const ref = useRef<HTMLParagraphElement>(null);
     useEffect(() => {
       ref.current?.focus();
       // El aviso ya esta pintado: se quita de la URL para que recargar no lo repita.
       window.history.replaceState(null, '', `/registrar?s=${String(sessionId)}`);
     }, [sessionId]);
     return <p ref={ref} tabIndex={-1} role="status" className={`${ui.noticeOk} ${styles.savedNotice}`}>{message}</p>;
   }
   ```
   (`styles` es `page.module.css`; `.savedNotice { margin: 0 0 var(--sp-5); max-width: 70ch; }`.)
2. **`SessionImport.tsx`:** en `onSaved`, sustituye `_message` por `message` y navega a
   ``/registrar?s=${String(id)}&aviso=${encodeURIComponent(message)}``.
3. **`page.tsx`, rama con sesión activa:**
   - lee `params['aviso']`: solo si es `string`, recortado y con 300 caracteres como máximo; si
     no, `null`;
   - si hay aviso, pinta `<SavedNotice message={aviso} sessionId={active.id} />` justo después
     del `</header>` y antes de `CaptureForm` o del aviso de sesión cerrada;
   - pasa a `CaptureForm` la prop nueva `autoFocusFirstField={aviso === null}`.
4. **`CaptureForm.tsx`:** añade `readonly autoFocusFirstField?: boolean` (por defecto `true`) y
   condiciona el `useEffect` de montaje que enfoca Ítem. Si no, los dos componentes se pelean
   por el foco.
5. **`BulkImport` (Pegar varios):** el `<p role="status" className={ui.noticeOk}>{message}</p>`
   lleva `tabIndex={-1}` y un `ref`, y se enfoca cuando `message` pasa a no vacío. Hoy, al
   guardar, el foco se pierde en `body`.
6. **e2e:**
   - `session-import.spec.mjs`, primer test, tras `toHaveURL(/registrar\?s=\d+/)`: añade
     `await expect(page.getByRole('status').filter({ hasText: 'Sesión creada con 1 error' })).toBeFocused();`.
   - Tercer test, línea 86: la expresión `registrar\?s=${id}$` debería seguir pasando, porque
     `replaceState` deja la URL exacta y `toHaveURL` reintenta. **Si falla**, cámbiala a
     `new RegExp(\`registrar\\?s=${id}(&|$)\`)` y explícalo en el mensaje del commit. Es el
     único cambio permitido en un test existente.
   - Añade en ese tercer test: `await expect(page.getByRole('status').filter({ hasText: '1 error guardado.' })).toBeVisible();`.

### Paso 4 · Adiós a `window.confirm` y el área de pegado primero

**Commit:** `fix(ui): replace the native confirm and put the paste area first`

1. **«Volver al texto pegado»** (en la barra):
   - Si `!dirty`: llama a `onBack()` directamente, sin preguntar.
   - Si `dirty`: el botón se sustituye en su sitio por:
     - el texto `Se descartan los cambios de la vista previa; el texto pegado se conserva.`
       (`ui.note`);
     - `Descartar y volver` (`ui.danger ui.small`), que llama a `onBack()`;
     - `Seguir revisando` (`ui.secondary ui.small`), que cancela.
   - Copia el patrón de `src/app/registrar/SessionControls.tsx`:
     - al confirmar, el foco va a «Seguir revisando»;
     - al cancelar, vuelve a «Volver al texto pegado»;
     - Esc cancela;
     - refs `askRef`, `keepRef` y `wasConfirming`.
   - Borra la llamada a `window.confirm`.
2. **`BulkImport` sin revisión en curso** (`batch === null`), en este orden:
   1. el párrafo de introducción;
   2. el `label.paste` con el textarea «Errores para importar»;
   3. el botón «Preparar vista previa»;
   4. los dos `<details>` de instrucciones (IA y hoja de cálculo), **sin cambiar sus textos**.

   Con revisión en curso (`batch !== null`), **no** se pintan las instrucciones: solo
   `ImportReview`.
3. **e2e:** añade en `import.spec.ts` el test **«volver al texto pide confirmacion en la
   pagina, no con un dialogo»**:
   1. registra `page.on('dialog', () => { throw new Error('dialogo nativo inesperado'); })`;
   2. prepara la vista previa de `rows` y pulsa «Volver al texto pegado» sin tocar nada → vuelve
      al área de pegado con el texto intacto;
   3. prepara de nuevo, cambia `Correcta *` del `Error 1`, pulsa «Volver al texto pegado» → se ve
      «Descartar y volver» y el foco está en «Seguir revisando»;
   4. Esc → el foco vuelve a «Volver al texto pegado» y la edición sigue;
   5. «Volver al texto pegado» → «Descartar y volver» → el textarea contiene el texto original.

## 4. Verificación antes de dar el bloque por terminado

1. `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`: todo en verde. El recuento de
   e2e sube con los tests nuevos y no hay ninguno roto.
2. **Prueba manual con una tanda realista de 12 errores:**
   - `pnpm demo`, abre `http://127.0.0.1:3001/registrar` y pega en «Sesión y errores para
     importar» el sobre de la sección 6.
   - Recorre toda la revisión solo con teclado (Tab, «Ir al siguiente pendiente», Ctrl+Enter no
     aplica) y guarda.
   - Comprueba:
     - el foco al entrar en la revisión;
     - el contador;
     - la barra fija durante el scroll;
     - el aviso «Sesión creada con 12 errores.» enfocado en la página de la sesión;
     - que recargar no repite el aviso.
   - Repítelo a 390 px de ancho.
3. **Capturas.** A 1280 y 390 px guarda en `docs/ui-review/after/` estas capturas de página
   completa (sin commit; el cierre las sube todas juntas):
   - `03-registrar-pegar-{desktop,mobile}.png`: «Pegar varios» sin revisión;
   - `11-revision-tanda-{desktop,mobile}.png`: revisión de 12 errores a medio completar;
   - `12-tanda-guardada-{desktop,mobile}.png`: página de sesión con el aviso.
4. `npx impeccable detect --json src/app/registrar`: no puede aparecer ningún hallazgo nuevo
   respecto a `docs/ui-review/detect-before.json`.
5. `git status` limpio salvo `docs/ui-review/after/`. Cuatro commits nuevos, uno por paso.

## 5. Qué NO hacer en este bloque

- No reordenar la página `/registrar`: ni sesiones abiertas arriba ni «Nueva sesión» plegada.
  Eso es el **bloque 5**. Tampoco esconder «Nueva sesion» o «Sesiones recientes» durante la
  revisión.
- No cambiar etiquetas de enums (`DESCONOCIMIENTO`, `DUDABA`…) ni añadir tildes. Es el
  **bloque 6**.
- No tocar Anki, el Informe ni Writing.
- No añadir dependencias.
- No cambiar el límite de filas, los mensajes del servidor, las reglas de duplicados ni nada de
  `src/lib`.
- No usar `window.confirm`, `alert` ni modales.
- No añadir atajos de teclado globales.

## 6. Sobre de prueba (12 errores, estilo Macmillan)

Guárdalo como `/tmp/tanda12.json` o pégalo directamente. `correctAnswer`, `category` y
`ruleNote` van vacíos, como llegan del capturador:

```json
{"session":{"date":"2026-09-23","kind":"DRILL","paper":null,"part":null,"source":"LIBRO","sourceRef":"Ready for C1 Advanced · pág. 42 · actividades 1-3","itemsTotal":20,"itemsCorrect":8,"timed":false},
 "errors":[
  {"itemRef":"1","prompt":"She insisted ___ paying for dinner.","myAnswer":"in","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"2","prompt":"They called ___ the meeting at the last minute.","myAnswer":"of","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"3","prompt":"The results were ___ with our expectations.","myAnswer":"according","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"4","prompt":"He showed complete ___ for the rules. (REGARD)","myAnswer":"unregard","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"5","prompt":"___ the rain, the match went ahead.","myAnswer":"Even though","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"6","prompt":"We need to ___ a solution quickly.","myAnswer":"make","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"7","prompt":"There was widespread ___ with the decision. (SATISFY)","myAnswer":"unsatisfaction","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"8","prompt":"She regretted not ___ the job. (TAKE)","myAnswer":"take","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"9","prompt":"It was only by his voice ___ I recognised him.","myAnswer":"what","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"10","prompt":"The project fell ___ due to lack of funding.","myAnswer":"down","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"11","prompt":"He is widely ___ as the best in his field. (REGARD)","myAnswer":"regarding","correctAnswer":"","category":"","ruleNote":""},
  {"itemRef":"12","prompt":"Better ___ the communication between departments.","myAnswer":"comunication","correctAnswer":"","category":"","ruleNote":""}
 ]}
```

## 7. Entrega

Al terminar, deja un resumen de 3 a 5 líneas con:
- los commits, con su hash;
- el resultado de `typecheck`, `lint`, los unitarios y los e2e, con cifras;
- lo que no se ha podido hacer o se ha resuelto de otra forma, y por qué;
- cualquier test existente que hayas tenido que tocar (solo se admite el de la línea 86 del
  paso 3).

Juan revisará el bloque antes de pasar al bloque 5.
