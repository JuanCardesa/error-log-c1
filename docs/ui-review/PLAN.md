# Plan de rediseño de la interfaz · error-log-c1

Parte de [AUDIT.md](AUDIT.md). Rama `feature/ui-redesign`. Nada de esto se implementa hasta que
se apruebe.

## Dirección

**Refinar, no sustituir.** La identidad actual («El cuaderno corregido»: papel, tinta,
monoespaciada, azul estudio y rojo ejecución) es propia del producto y la auditoría no la señala
como problema. Lo que falla es:

- **el flujo principal:** la revisión de la tanda de Macmillan;
- **el acabado:** contraste, foco, lenguaje y primitivas duplicadas.

Cambiar el aspecto sin arreglar esto sería maquillaje. Hacerlo al revés ya da una interfaz
distinta.

**Límites que se respetan en todos los bloques:**

- No se tocan `src/lib/**` (AnkiConnect, modelos, consultas, reglas, exportadores ni validación
  Zod) ni las Server Actions.
- La forma de lo que se envía al servidor (nombres de campo y `FormData`) no cambia.
- Los valores de los enums no cambian; solo la etiqueta que se muestra.

**Cada bloque sigue el mismo ciclo:**

1. Implementar.
2. Pasar `typecheck`, `lint`, los unitarios y los e2e.
3. Capturar en `docs/ui-review/after/` con la demo, a 1280 y 390 px.
4. Hacer commits atómicos con conventional commits.
5. Escribir un resumen de 3 a 5 líneas y esperar el OK.

**Riesgo de los e2e:** unos 70 textos de la interfaz sirven de selector en los e2e
(`'Categoria *'`, `'Abrir sesion'`, `'Guardar y seguir'`…). Cuando un bloque cambie un texto,
el e2e afectado se actualiza en el mismo commit y solo en ese selector, nunca en lo que comprueba.

---

## Bloque 1 · Base: tokens, contraste y foco

**Comandos:** `/impeccable colorize` y `/impeccable typeset`, y la parte de foco de `/impeccable harden`.
**Archivos:** `src/app/globals.css` y los 4 contenedores con `overflow:hidden`
(`capture.module.css`, `report.module.css`, `registrar/page.module.css`, `exportar.module.css`).
**Resuelve:** los problemas 3 y 4 de la auditoría, el borde de campo a 2,05:1 y el foco en el modo
de alto contraste de Windows.

1. **Contraste.**
   - `--ink-faint` pasa a un valor de al menos 4,5:1 sobre las tres superficies (en torno a
     `#6f6959`).
   - `--queued` pasa a al menos 4,5:1 (en torno a `#7a5f17`).
   - Nuevo token `--rule-field`, de al menos 3:1, para el borde de los campos. `--rule` y
     `--rule-strong` siguen siendo filetes decorativos.
2. **Foco.**
   - El anillo pasa de `box-shadow` a `outline: 2px solid var(--accent)` con `outline-offset`, para
     que funcione en el modo de alto contraste.
   - Se añade `summary` a la lista de elementos con anillo.
   - Se quita el `overflow:hidden` de los 4 contenedores; las esquinas se redondean en los hijos
     extremos.
3. **Tokens que faltan.**
   - `--radius-pill` (sustituye 7 `999px`), `--ink-hover` (sustituye 4 `#000`) y `--on-ink`
     (sustituye 3 `#fff`).
   - Los 4 fondos de nivel de RUOE pasan a variables en `:root`.
4. **Escala tipográfica.** El h1 pasa de 19 a 22 px y el h2 de 15 a 16 px. El cuerpo sigue en 13 px
   para no perder densidad.
5. **Campo inválido con estilo propio.** `[aria-invalid=true]` recibe un borde rojo. Así el error no
   depende solo del mensaje de debajo.

**Commits:**
- `fix(a11y): raise text and field-border contrast to WCAG AA`
- `fix(a11y): stop containers from clipping the focus ring`
- `refactor(ui): replace literal colors and radii with tokens`

**Riesgo:** bajo. Cambia la apariencia de todas las pantallas, pero no el comportamiento.

## Bloque 2 · Primitivas compartidas

**Comandos:** `/impeccable extract` y `/impeccable distill`.
**Archivos:**
- nuevo `src/app/_shared/ui.module.css`;
- todos los `*.module.css`, a los que se les quitan las copias;
- los `className` de los `.tsx` que usan esas primitivas.

**Resuelve:** el problema 10 (primitivas duplicadas, botones que no dicen lo que hacen y `.actions`
definido dos veces).

1. **Una sola definición de cada primitiva:**
   - Botones: `primary`, `quiet` (secundario), `danger` y `link`.
   - Chips: de causa, de estado de regla y de estado de sesión.
   - La tabla de datos, el campo con etiqueta y los mensajes (`fieldError`, `hint`, `notice` de
     éxito y de error, `empty`).
2. **El mismo paso lleva el mismo botón.**
   - «Revisar sesión y errores» y «Preparar vista previa» pasan a ser los dos primarios.
   - «Sincronizar» (solo lee) pasa a secundario; «Crear en Anki» (escribe) sigue siendo primario.
   - «Actualizar en Anki» deja de ser un enlace subrayado y pasa a botón.
3. **Cursores:** un botón deshabilitado muestra `not-allowed`. `progress` queda solo para lo que
   está cargando de verdad.
4. **Estilos en línea:** los 11 `style={{…}}` pasan a clases (el ancho de las barras de datos sigue
   en línea).

**Commits:** uno por área (`refactor(ui): …` para Registrar, Anki, los informes y Writing y
Exportar).

**Riesgo:** medio. Toca muchos archivos, pero no cambia ningún texto, así que los e2e no se ven
afectados.

## Bloque 3 · Captura uno a uno y campo Categoría

**Comandos:** `/impeccable harden`, `/impeccable layout` y `/impeccable clarify`.
**Archivos:** `registrar/ErrorFields.tsx`, `CaptureForm.tsx`, `ErrorList.tsx`, `SessionForm.tsx`,
`capture.module.css`, nuevo `src/app/_shared/labels.ts` y `e2e/capture.spec.ts` y `edit.spec.ts`
(solo selectores).
**Resuelve:** los problemas 2, 5 y 6 y el apartado B de la auditoría.

1. **Categoría pasa a `<select>`** con los 14 valores de `CATEGORIES` y etiquetas legibles
   («Preposición dependiente»). El `value` sigue siendo el enum, así que no se puede escribir un
   valor inválido. Se conserva la última categoría usada, como pide la SPEC §6.1.
2. **La rejilla se reordena** para dar a Causa al menos 9 rem (Ítem es el campo estrecho) y el chip
   de lado queda dentro de su columna.
3. **Valores heredados visibles.** Causa, categoría y confianza conservadas de la tanda llevan una
   marca discreta de «heredado» hasta que se tocan.
4. **Foco.**
   - Al abrir una sesión nueva, el foco va a Ítem.
   - Tras un error del servidor, va al primer `[aria-invalid]`.
   - Editar una fila lleva el foco al primer campo; al guardar o cancelar vuelve al botón Editar.
   - Esc cancela la edición y la confirmación de borrado.
5. **Pista de teclado honesta:** «Enter guarda · en Regla, Ctrl+Enter».
6. **Mensajes.**
   - Cada mensaje de campo en su propia línea.
   - `overflow-wrap:anywhere` en `.fieldError` como red de seguridad.
   - Un único `role=alert` de resumen; los mensajes de campo se enlazan con `aria-describedby`.
7. **«Al final de la sesión»** se oculta si la sesión no está cronometrada. Si lo está, sigue igual.

**Commits:**
- `feat(ui): pick category from the closed list instead of free text`
- `fix(ui): widen the cause column and flag carried-over values`
- `fix(a11y): manage focus after opening a session, saving and editing`

**Riesgo:** medio. Es el formulario diario. Categoría cambia de `getByLabel` a combobox en unos 10
selectores de los e2e.

## Bloque 4 · Revisión de tanda (Macmillan y pegar varios)

**Comandos:** `/impeccable distill`, `/impeccable layout` y `/impeccable harden`.
**Archivos:** `registrar/BulkImport.tsx` (el componente `ImportReview`), `SessionImport.tsx`,
`bulk.module.css`, `registrar/page.tsx` (el aviso de guardado) y `e2e/import.spec.ts` y
`session-import.spec.mjs` (solo selectores).
**Resuelve:** el problema 1 y el apartado A de la auditoría, la entrada principal.

1. **Revisión compacta.** Cada error es una fila con el enunciado y las respuestas en solo lectura, y
   **Correcta, Categoría y Regla** editables. El resto de campos (ítem, causa, subcategoría y
   confianza) se abre por fila. Las filas incompletas se marcan.
2. **Barra fija al pie** con «Faltan 3 de 12 · Ir al siguiente» y el botón de guardar siempre a
   mano.
3. **Cierre.** Al guardar se llega a la sesión con un aviso «Sesión creada · 12 errores guardados»
   (`role=status`) y el foco en el título. El dato viaja en la URL de la redirección; el servidor
   no cambia.
4. **Foco al revisar:** tras «Revisar», el foco va a la cabecera propuesta.
5. **`window.confirm` fuera:** «Volver al texto pegado» pasa a un segundo paso en la propia página.
6. **Placeholder neutro** en Regla dentro de la revisión.
7. **En «Pegar varios errores»** el área de pegado va primero y las instrucciones de IA y de hoja
   quedan detrás.

**Invariante:** `FormData` idéntico (`N.itemRef`, `N.prompt`…, `envelope`, `rows`). Lo comprueban
los e2e de importación existentes, que no cambian lo que verifican.

**Commits:**
- `feat(ui): review pasted batches as compact rows with a pending counter`
- `feat(ui): confirm a saved batch on the session page`
- `fix(ui): replace the native confirm with an inline step`

**Riesgo:** alto. Es el componente más complejo y el más usado. Va solo en su bloque y con
capturas de una tanda real de 12 errores.

## Bloque 5 · Entrada de /registrar

**Comandos:** `/impeccable layout` y `/impeccable distill`.
**Archivos:** `registrar/page.tsx`, `SessionImport.tsx`, `SessionForm.tsx` y `page.module.css`.
**Resuelve:** el problema 9.

1. **Orden por uso:**
   1. las **sesiones abiertas**, si las hay, fijadas arriba;
   2. **Pegar tanda de Macmillan**, con acción primaria;
   3. **Nueva sesión a mano**, plegada tras un botón secundario;
   4. el historial.
2. **Enlace desde Writing:** `/registrar?nueva=writing` abre el formulario manual con tipo y paper
   WRITING precargados, y `/writing` enlaza ahí cuando no hay sesiones de Writing libres.

**Commit:** `feat(ui): put open sessions and the Macmillan paste first on Registrar`

**Riesgo:** bajo a medio. Los e2e que pulsan «Abrir sesion» tendrán que desplegar antes el
formulario manual.

## Bloque 6 · Lenguaje y etiquetas

**Comando:** `/impeccable clarify`.
**Archivos:** `src/app/_shared/labels.ts` (creado en el bloque 3), los textos de todas las páginas
y los e2e afectados (solo selectores).
**Resuelve:** el problema 7 y los apartados F y transversal.

1. **Etiquetas legibles para todo enum visible:** causas, confianzas, tipos, fuentes, estados de
   sesión (Abierta / Cerrada), lados (estudio / ejecución) y estados de regla («Haz esto»,
   «En cola», «Vigilar», «Bien», «Muestra insuficiente (n ≥ 15)»). Los CSV y el JSON siguen
   exportando los valores originales.
2. **Tildes en toda la interfaz** y en la meta `description`.
3. **Informe.**
   - «Qué hacer esta semana».
   - La justificación del DO NOW en lenguaje natural, sin nombres de variable.
   - Fuera los códigos Q de los títulos.
4. **Mensaje de enum no válido en español.** Es solo para otros formularios; en Categoría deja de
   poder pasar tras el bloque 3.

**Commits:** uno por pantalla: `fix(copy): …` para Registrar, Informe, Anki y el resto.

**Riesgo:** medio, sobre todo por los e2e. Por eso va después de los bloques de estructura: así
cada texto se toca una sola vez.

## Bloque 7 · Anki

**Comandos:** `/impeccable harden` y `/impeccable clarify`.
**Archivos:** `anki/page.tsx`, `SyncPanel.tsx`, `QueueItem.tsx`, `ReviewFailures.tsx`,
`anki.module.css` y un `anki/loading.tsx` nuevo.
**Resuelve:** el problema 8 y el apartado E. No se toca `anki/actions.ts` ni `src/lib/anki/**`.

1. **Anki no disponible.**
   - Un estado claro en «Conexión con Anki» (disponible o no disponible, con el porqué).
   - Un único aviso encima de la cola con el paso siguiente.
   - Los botones de la cola no aparecen deshabilitados uno a uno.
2. **Ceros sin datos:** «—» en «Repaso en Anki» mientras no se haya sincronizado nunca.
3. **La explicación de lapsos** se pliega y se limita a 70ch.
4. **`loading.tsx`** para que la página no quede en blanco mientras responde AnkiConnect.
5. **Convertidas:** «Marcada a mano» se muestra una vez como grupo, no en cada fila.
6. **Cada error de la cola enlaza a su sesión**, para corregir una errata antes de crear la
   tarjeta.

**Commits:**
- `feat(ui): state Anki availability once instead of per card`
- `fix(ui): show no review figures before the first sync`

**Riesgo:** medio. `e2e/anki*.spec.ts` comprueban el estado de los botones con el AnkiConnect falso;
el comportamiento con Anki disponible no cambia.

## Bloque 8 · Informes, navegación y móvil

**Comandos:** `/impeccable layout`, `/impeccable adapt`, `/impeccable colorize` y `/impeccable polish`.
**Archivos:** `layout.tsx`, un `_shared/NavLinks.tsx` nuevo (cliente, con `usePathname`),
`informe/*`, `ruoe/*`, `certezas/*`, `writing/*`, `exportar/*` y `registrar/list.module.css`.

1. **Navegación:** `aria-current="page"` y estilo de página activa. En 390 px, una sola fila con
   desplazamiento en lugar de 3 filas partidas.
2. **DO NOW con camino.** Un enlace a donde se hace la acción. Se hace con un mapa `id de regla →
   ruta` en la interfaz, sin tocar el motor.
3. **La regla de las dos plumas.** Q5 «cumplido / por debajo» y «% repetido» de Writing pasan a la
   escala de estados. Certezas pierde el borde lateral rojo y gana una etiqueta en el recuento.
4. **RUOE:** una leyenda de una línea para los tramos de color y las celdas sin datos.
5. **Móvil:** la tabla de errores de una sesión pasa a tarjetas por debajo de 620 px. Q1 y Q2 se
   ajustan (la columna Remedio va debajo). Los puntos de ruptura se unifican en dos.
6. **Certezas enlaza cada error a su sesión.** Writing y Exportar: enlaces con estilo de sistema y
   filas de descarga que se vean descargables.

**Commits:** uno por pantalla: `feat(ui): …`, `fix(a11y): mark the current page in the nav` y
`feat(ui): stack the error table as cards on narrow screens`.

**Riesgo:** bajo a medio.

## Bloque 9 · Opcional: vista «Errores» para consultar y filtrar

**Comandos:** `/impeccable shape` y `/impeccable layout`.
**Archivos:** una página nueva `src/app/errores/page.tsx` con su CSS y un enlace en la navegación
secundaria.

Lista de todos los errores con filtros de causa, categoría, confianza, estado de Anki y texto. Los
filtros viajan en la URL y cada fila enlaza a su sesión. Se construye sobre `loadDataset`, que ya
carga todas las filas: **no hace falta ninguna consulta ni función de repositorio nueva.**

Es la única pieza nueva de producto del plan y cubre el flujo «consultar / filtrar» que hoy no
existe. **Riesgo:** bajo, porque no toca nada existente. Pero es alcance nuevo y necesita tu sí
expreso.

---

## Fase 5 · Cierre

1. `/impeccable polish` global.
2. `/impeccable audit` final.
3. `npx impeccable detect` sobre el código y sobre las URL, a 1280 y 390 px.
4. Verificación manual de Anki contra tu instalación real (sincronizar, crear, actualizar y
   deshacer una tarjeta de prueba) y de la exportación (CSV y JSON, byte a byte contra `develop`).
5. `docs/ui-review/CHANGELOG.md` con el antes y el después por pantalla, lo resuelto y lo
   pendiente.
6. DESIGN.md actualizado con el sistema resultante (`/impeccable document`).
7. Resumen para el PR hacia `develop`.

## Fuera del plan (cambian reglas de negocio; ver AUDIT.md)

- Pedir la regla más tarde, al convertir en Anki, en lugar de al volcar.
- Una ventana fija para el DO NOW.
- Semanas vacías en el eje de RUOE.
- Crear una sesión de Writing desde `/writing` con una acción nueva.
