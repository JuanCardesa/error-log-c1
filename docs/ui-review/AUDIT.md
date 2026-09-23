# Auditoría de interfaz · error-log-c1

23 de septiembre de 2026, rama `feature/ui-redesign`, sobre `develop` en 42d77a1. Solo lectura: no
se ha cambiado código.

**Método.** Se hicieron dos evaluaciones por separado, siguiendo `/impeccable critique` y
`/impeccable audit`:

- **Revisión de diseño.** Se hizo con las 26 capturas de `before/`, el código de `src/app/**`
  y la demo, recorriendo con teclado el registro uno a uno y una tanda de Macmillan de 12 errores.
  Quien la hizo no vio la salida del detector, para no dejarse influir.
- **Evidencia técnica.** Se verificó el detector hallazgo a hallazgo, se midió en el navegador a
  390, 1024 y 1280 px, se recorrió todo con teclado, se calcularon los contrastes y se buscó en el
  código.

Las ubicaciones `archivo:línea` están comprobadas contra el código de 42d77a1.

**Escala de severidad.** Crítico (P0) impide terminar una tarea. Alto (P1) causa dificultad seria
o incumple WCAG AA. Medio (P2) es una molestia con alternativa. Bajo (P3) es acabado.

## Resumen

| Evaluación | Nota | Banda |
|---|---|---|
| Heurísticas de Nielsen (critique) | **23 / 40** | Aceptable |
| Salud técnica (audit) | **12 / 20** | Aceptable |
| `impeccable detect` en páginas renderizadas | 96 hallazgos a 1280 px, 77 a 390 px | 5 de sus 7 reglas resultan falsos positivos o intencionales al verificarlas (tabla más abajo) |

**No hay nada crítico:** todos los flujos se pueden completar, también solo con teclado. El
problema de fondo es otro. La app está pensada para la entrada que menos se usa y descuida la que
más se usa:

- El formulario uno a uno está muy trabajado: el foco vuelve al primer campo, conserva valores
  entre errores y responde bien a Tab y Enter.
- La tanda de Macmillan, que es la entrada diaria, se revisa como 12 formularios completos
  apilados, sin contador y sin confirmación al terminar.
- Encima, en `/registrar` la acción de Macmillan tiene estilo secundario, y la primaria es abrir
  una sesión a mano.

Lo demás son problemas de acabado repetidos por toda la interfaz:

- Un token de texto por debajo de AA.
- Anillos de foco recortados.
- Valores internos en crudo como texto de interfaz, además en inglés.
- Primitivas copiadas en cada módulo que ya no coinciden entre sí.

**Veredicto de identidad.** La identidad actual («El cuaderno corregido»: papel, tinta,
monoespaciada, azul estudio y rojo ejecución) es propia de este producto y funciona. Tres piezas
tienen voz propia: la tarjeta con la respuesta tachada, la matriz RUOE que distingue «vacío» de «cero»
y el DO NOW único. Lo que falla es la ejecución, no el lenguaje visual. Recomendación para el plan:
**refinar, no sustituir.**

## Los 10 problemas más graves

| # | Sev. | Problema | Dónde |
|---|---|---|---|
| 1 | Alto | La revisión de una tanda (Macmillan o pegado) son N formularios completos: 12 errores dan 5.546 px y 143 controles, con 36 campos obligatorios vacíos. No hay contador de lo que falta, el botón de guardar está solo al final, no hay confirmación al guardar y el foco se pierde en `body` | [BulkImport.tsx:181-193](../../src/app/registrar/BulkImport.tsx#L181-L193), [SessionImport.tsx:23-24](../../src/app/registrar/SessionImport.tsx#L23-L24) |
| 2 | Alto | Categoría es texto libre con `datalist`, aunque solo admite 14 valores. Si escribes otro, el servidor devuelve el mensaje de Zod en inglés con los 14 valores. Ese mensaje no se parte, lleva la página a 1540 px de ancho y además lo tapa el chip de causa | [ErrorFields.tsx:157-176](../../src/app/registrar/ErrorFields.tsx#L157-L176), [formData.ts:30-39](../../src/app/_shared/formData.ts#L30-L39), captura `04b` |
| 3 | Alto | El anillo de foco no se ve en los conmutadores «Uno a uno / Pegar varios» y «30 d / 60 d», ni en las filas-enlace de sesiones y de exportar: el `overflow:hidden` del contenedor lo recorta (WCAG 2.4.7) | [capture.module.css:27](../../src/app/registrar/capture.module.css#L27), [report.module.css:22](../../src/app/_shared/report.module.css#L22), [page.module.css:96](../../src/app/registrar/page.module.css#L96), [exportar.module.css:8](../../src/app/exportar/exportar.module.css#L8) |
| 4 | Alto | El token `--ink-faint` da 3,0–3,5:1 y se usa en texto que hay que leer: el Remedio de Q1, las notas de decisión, los metadatos, las pistas y los nombres de fichero. `--queued` da 4,31:1 y el borde de los campos 2,05:1 (WCAG 1.4.3 y 1.4.11) | [globals.css:27](../../src/app/globals.css#L27), unos 20 usos en 8 módulos |
| 5 | Medio | La causa se corta: su columna mide 80 px, así que se lee «DESCON» y 4 de las 6 causas no caben. El chip «estudio · tarjeta» (124 px) sale de su columna | [capture.module.css:163](../../src/app/registrar/capture.module.css#L163) |
| 6 | Medio | El foco se pierde en `body` al abrir una sesión (hacen falta unos 14 Tab hasta Ítem), al revisar una tanda, al guardarla, al pulsar Editar una fila y tras un error del servidor. La pista dice «Enter para guardar», pero en Regla Enter hace un salto de línea | [SessionForm.tsx:44](../../src/app/registrar/SessionForm.tsx#L44), [ErrorList.tsx](../../src/app/registrar/ErrorList.tsx), [CaptureForm.tsx:66](../../src/app/registrar/CaptureForm.tsx#L66) |
| 7 | Medio | Valores internos como texto de interfaz, en mayúsculas y a menudo en inglés: `DESCONOCIMIENTO`, `DUDABA`, OPEN/CLOSED, `study/exec`, DO NOW/QUEUED/WATCH/ok, «needs n ≥ 15», títulos Q1/Q2/Q5 y `pct_convertidos (Q5)` en el DO NOW. Además faltan tildes en toda la app | Toda la app; [RulesTable.tsx:33,46](../../src/app/informe/RulesTable.tsx#L33), [informe/page.tsx:86](../../src/app/informe/page.tsx#L86) |
| 8 | Medio | Con Anki cerrado salen 10 botones primarios «Crear en Anki» al 55 % de opacidad y con cursor de carga. El motivo solo está en un `title`, al que no se llega porque el botón no recibe foco. «Repaso en Anki» muestra 0 en todas las cifras sin haber sincronizado nunca, cuando vacío no es cero | [anki.module.css:86-90](../../src/app/anki/anki.module.css#L86-L90), [QueueItem.tsx:52](../../src/app/anki/QueueItem.tsx#L52), [ReviewFailures.tsx:15](../../src/app/anki/ReviewFailures.tsx#L15) |
| 9 | Medio | La jerarquía de `/registrar` está al revés: Macmillan (la entrada principal) va con botón secundario y «Abrir sesion» con el primario. Hay dos formularios apilados antes de la lista y las sesiones abiertas no se destacan | [SessionImport.tsx:36](../../src/app/registrar/SessionImport.tsx#L36), [SessionForm.tsx:70](../../src/app/registrar/SessionForm.tsx#L70), [registrar/page.tsx:66-110](../../src/app/registrar/page.tsx#L66-L110) |
| 10 | Medio | El sistema se ha ido desviando: el botón primario está definido 4 veces, el secundario 4 veces con 4 rellenos distintos, y los chips 4 veces. El rojo de ejecución tiene 5 significados. La navegación no marca la página actual | ver «Problemas técnicos» |

## Problemas de UX por flujo

### A. Registrar pegando la tanda de Macmillan (entrada principal)

- **[Alto] La revisión son formularios completos apilados.** Cada error muestra sus 9 campos más
  la casilla de cronómetro. No se distingue lo que falta de lo que ya viene relleno.
  [BulkImport.tsx:181-193](../../src/app/registrar/BulkImport.tsx#L181-L193).
  *Propuesta:*
  - Una tabla de revisión compacta, con una fila por error. Enunciado y respuestas de solo
    lectura, y Correcta, Categoría y Regla editables.
  - El resto de campos se abre por fila.
  - Un contador fijo del estilo «Faltan 7 de 12» con salto al siguiente pendiente, y el botón de
    guardar siempre visible.
  - El `FormData` que se envía no cambia (campos `N.campo`), así que el servidor no se toca.
- **[Alto] No hay cierre.** `onSaved` descarta el mensaje ([SessionImport.tsx:23](../../src/app/registrar/SessionImport.tsx#L23))
  y `router.push` deja el foco en `body`. Tras 40 minutos de práctica, el ritual acaba en silencio.
  *Propuesta:* aviso «Sesión creada · 12 errores guardados» con `role=status` en la sesión de
  destino, y foco en su `h1`.
- **[Medio] El foco se pierde al pulsar «Revisar sesión y errores»**, porque el botón desaparece.
  *Propuesta:* llevar el foco a la cabecera propuesta.
- **[Medio] El placeholder de Regla parece contenido.** «call off lleva doble f…» se repite en
  las 12 filas ([ErrorFields.tsx:228](../../src/app/registrar/ErrorFields.tsx#L228)).
  *Propuesta:* un texto neutro, o ninguno en la revisión.
- **[Medio] Pantalla de más de 5.500 px.** Mientras se revisa, «Nueva sesion» y «Sesiones
  recientes» siguen debajo. *Propuesta:* en modo revisión, esconder lo que no sirve para revisar.
- **[Bajo] Diálogo nativo del navegador.** «Volver al texto pegado» usa `window.confirm`
  ([BulkImport.tsx:200](../../src/app/registrar/BulkImport.tsx#L200)), justo lo que
  [ErrorList.tsx:18-19](../../src/app/registrar/ErrorList.tsx#L18-L19) dice evitar.
  *Propuesta:* un segundo paso en la propia página.

### B. Registrar uno a uno

- **[Alto] Categoría libre y error ilegible.** Ver el problema 2 del resumen. *Propuesta:*
  - Un `<select>` con los 14 valores y etiquetas legibles («Preposición dependiente»). El `value`
    no cambia.
  - Mensaje en español en la capa de interfaz: traducir el código `invalid_value` en `collectIssues`
    o en `ErrorFields`. La validación de Zod no se toca.
  - `overflow-wrap: anywhere` en `.fieldError`.
- **[Medio] Causa ilegible** (problema 5). *Propuesta:*
  - Reordenar la rejilla: Ítem estrecho, Causa con al menos 9 rem, y el chip de lado dentro de su
    columna.
  - Alternativa: un control segmentado de 6 botones agrupados en estudio y ejecución.
- **[Medio] Valores heredados sin marcar.** La categoría se precarga con la última usada, también
  la de otra sesión ([registrar/page.tsx:138](../../src/app/registrar/page.tsx#L138)), y causa y
  confianza pasan de un error al siguiente. Lo pide la SPEC §6.1, así que se mantiene.
  *Propuesta:* marcar visualmente los campos heredados para que no se guarden sin mirarlos.
- **[Medio] La pista de teclado miente en el último campo.** En Regla, Enter hace un salto de
  línea y solo Ctrl+Enter guarda ([CaptureForm.tsx:66](../../src/app/registrar/CaptureForm.tsx#L66)).
  *Propuesta:* mencionar Ctrl+Enter en la pista.
- **[Medio] Foco perdido al abrir sesión.** Tras «Abrir sesion» el foco queda en `body`.
  *Propuesta:* poner el foco en Ítem cuando la sesión está abierta y el formulario está vacío.
- **[Medio] Mensajes concatenados y contradictorios.** «…15 caracteres La regla no puede ser la
  respuesta correcta» ([ErrorFields.tsx:74](../../src/app/registrar/ErrorFields.tsx#L74)).
  *Propuesta:* separar los mensajes y mostrar primero el más útil.
- **[Bajo] Casilla que nunca se puede usar.** «Al final de la sesion» sale deshabilitada, con su
  nota, en todas las sesiones sin cronómetro ([ErrorFields.tsx:233-248](../../src/app/registrar/ErrorFields.tsx#L233-L248)).
  *Propuesta:* no mostrarla si la sesión no está cronometrada.
- **[Bajo] El ítem no avanza solo.** Tras guardar, Ítem se vacía. *Propuesta:* proponer el
  siguiente número.
- **[Bajo] Esc no cancela nada.** No sirve en «Borrar…» ni al editar una fila.

### C. Pegar varios errores (IA u hoja de cálculo)

- **[Medio] El área de pegado queda por debajo.** Hay dos acordeones de instrucciones antes del
  área de pegado ([BulkImport.tsx:45-78](../../src/app/registrar/BulkImport.tsx#L45-L78)).
  *Propuesta:* el área de pegado primero y las instrucciones detrás.
- **[Medio] Botones que no se corresponden.** «Preparar vista previa» es primario y el mismo paso
  en Macmillan, «Revisar sesión y errores», es secundario.
- Hereda todos los problemas de la revisión del apartado A.

### D. Consultar y filtrar errores

- **[Medio] No hay forma de buscar un error sin saber su sesión.** Los errores solo se ven sesión
  a sesión, y la lista de sesiones es por fecha y de 12 en 12. Certezas, la cola de Anki y el DO NOW
  no enlazan al error ni a su sesión, así que corregir una errata antes de crear la tarjeta exige
  recordar la fecha.
  *Propuesta:*
  - Mínima: enlazar cada error a `/registrar?s=ID`.
  - Completa: una vista `/errores` con filtros de causa, categoría y confianza y búsqueda de texto.
    Se puede construir sobre `loadDataset`, que ya carga todas las filas, sin tocar consultas ni
    repositorio.
- **[Bajo] La ventana 30/60 no se conserva al navegar**, porque la barra superior no arrastra `?w=`.

### E. Anki: sincronizar, cola, convertidas y repasos (incluido AnkiConnect no disponible)

- **[Medio] Anki no disponible** (problema 8). *Propuesta:*
  - Un único aviso de estado encima de la cola que diga qué hacer.
  - Botones de la cola con `aria-disabled` que se puedan enfocar, o que no aparezcan, y cursor
    `not-allowed`.
  - Un indicador de estado en «Conexión con Anki».
- **[Medio] Ceros sin datos.** «Repaso en Anki» enseña 0 en todo antes de la primera
  sincronización. *Propuesta:* «—», o no mostrar cifras hasta la primera sincronización.
- **[Medio] Botones que no dicen lo que hacen.**
  - «Sincronizar» (solo lee) y «Crear en Anki» (escribe) comparten estilo.
  - «Actualizar en Anki» es un enlace subrayado junto a «Deshacer», que va en caja.
  - Hay un `style` en línea con `gap: .5rem`, fuera de la escala ([anki/page.tsx:138](../../src/app/anki/page.tsx#L138)).
- **[Bajo] Texto repetido en cada fila.** «Marcada a mano (version anterior)» sale en cada
  convertida antigua ([anki/page.tsx:135](../../src/app/anki/page.tsx#L135)).
- **[Bajo] Párrafo demasiado largo.** La explicación de «Repaso en Anki» tiene 365 caracteres en
  dos líneas de unos 183, en tinta tenue ([ReviewFailures.tsx:11](../../src/app/anki/ReviewFailures.tsx#L11)).
  *Propuesta:* plegarla y limitar la línea a 70ch.
- **[Bajo] Página en blanco mientras responde Anki.** `/anki` espera a AnkiConnect antes de pintar
  (hasta 5 s por llamada) y no tiene `loading.tsx`. *Propuesta:* un `loading.tsx` o `Suspense`
  alrededor del panel de conexión.

### F. Informe, RUOE y Falsas certezas

- **[Medio] El DO NOW no lleva a ninguna parte y habla en código.**
  - El título «Que cambio esta semana» no describe lo que muestra ([RulesTable.tsx:33](../../src/app/informe/RulesTable.tsx#L33)).
  - La justificación enseña el nombre de una variable ([RulesTable.tsx:46](../../src/app/informe/RulesTable.tsx#L46)).
  - *Propuesta:* «Qué hacer esta semana», el porqué en lenguaje natural y un enlace a donde se hace
    («Ir a la cola de Anki · 9 pendientes»).
- **[Medio] Estados en inglés y códigos Q.** *Propuesta:* etiquetas en español y fuera los códigos
  Q de los títulos (no son consecutivos: Q1, Q2, Q5).
- **[Medio] Rojo y azul fuera de su papel.** Q5 marca «cumplido» con el chip de estudio y «por
  debajo» con el de ejecución ([informe/page.tsx:204-208](../../src/app/informe/page.tsx#L204-L208)).
  *Propuesta:* usar la escala de estados.
- **[Medio] Informe en móvil.** En Q1 la columna Remedio queda aplastada y Q2 se corta («POR 100 I»).
- **[Medio] RUOE sin leyenda y con semanas que faltan.** No hay leyenda de tramos de color ni del
  rayado, y las semanas sin sesiones no aparecen, así que el eje salta.
- **[Bajo] Certezas.**
  - El recuento «12» no tiene etiqueta ([certezas/page.tsx:33](../../src/app/certezas/page.tsx#L33)).
  - El borde lateral rojo en cada tarjeta es el único hallazgo del detector estático
    ([certezas.module.css:14](../../src/app/certezas/certezas.module.css#L14)).

### G. Exportar

- **[Bajo] Las filas no parecen descargables.** Los nombres de fichero van en tinta tenue, por
  debajo de AA, y el anillo de foco se recorta. *Propuesta:* poner «Descargar CSV» visible y una
  etiqueta con el tamaño del periodo.

### H. Writing

- **[Medio] Callejón sin salida.** Sin una sesión de Writing libre no se puede añadir un texto, y
  la pantalla solo lo explica ([PieceForm.tsx:58-67](../../src/app/writing/PieceForm.tsx#L58-L67)).
  *Propuesta:* un enlace «Abrir sesión de Writing» que lleve a `/registrar` con el tipo y el paper
  precargados por URL. Es solo interfaz.
- **[Bajo] Detalles.**
  - «Editar» sale en el azul por defecto del navegador ([writing/page.tsx:135](../../src/app/writing/page.tsx#L135)),
    porque no hay estilo global para `a`.
  - La cabecera «C · CA · O · L» es críptica.
  - Los errores del formulario no se asocian a su campo (`aria-describedby`).

### Transversal

- **[Medio] La navegación no marca la página actual:** ni `aria-current` ni estilo activo
  ([layout.tsx:43-55](../../src/app/layout.tsx#L43-L55)).
- **[Medio] Faltan tildes** en la mayoría de los textos, incluida la meta `description`.
- **[Bajo] El aviso de demo** usa `role="status"` y se anuncia en cada carga
  ([layout.tsx:59](../../src/app/layout.tsx#L59)).

## Problemas técnicos

### Accesibilidad (2 / 4)

| Sev. | Problema | Ubicación | Criterio WCAG |
|---|---|---|---|
| Alto | Anillo de foco recortado por `overflow:hidden` | 4 contenedores (problema 3) | 2.4.7 |
| Alto | `--ink-faint` en texto de lectura: 3,23:1 sobre el fondo, 3,53:1 sobre la hoja, 3,01:1 sobre la hoja hundida | `globals.css:27` y unos 20 usos | 1.4.3 |
| Medio | El borde de los campos (`--rule-strong`) da 2,05:1 sobre la hoja y 1,87:1 sobre el fondo. Dentro de un panel es lo único que delimita el campo | [globals.css:138](../../src/app/globals.css#L138) | 1.4.11 |
| Medio | `--queued` sobre `--queued-bg` da 4,31:1: chip QUEUED y aviso de demo | `rules.module.css:148`, `layout.module.css:64-69` | 1.4.3 |
| Medio | Foco perdido tras 5 acciones clave | problema 6 | 2.4.3 |
| Medio | 5 `role=alert` a la vez al guardar una tanda con 3 filas inválidas | `ErrorFields.tsx:72`, `BulkImport.tsx:194` | 4.1.3 |
| Medio | Los errores de Writing no se asocian a su campo | [PieceForm.tsx:50](../../src/app/writing/PieceForm.tsx#L50) | 1.3.1 y 3.3.1 |
| Medio | El mensaje de Categoría en inglés rompe el reflujo (1540 px) | problema 2 | 3.3.3, 3.1.2 y 1.4.10 |
| Bajo | `aria-invalid` no cambia el aspecto del campo: el borde sigue igual | `globals.css` | — |
| Bajo | `<abbr title="obligatorio">*</abbr>`: el `title` no llega por teclado y no hay leyenda del asterisco | `ErrorFields.tsx:98,124,158,218` | 3.3.2 |
| Bajo | El foco depende solo de `box-shadow` con `outline:none`, así que desaparece en el modo de alto contraste de Windows | [globals.css:143-151](../../src/app/globals.css#L143-L151) | 2.4.7 |
| Bajo | `summary` no recibe el anillo del sistema | `globals.css:143` | — |
| Bajo | Significado solo por color: el umbral en Writing y el lado de la causa | `writing/page.tsx:122-131` | 1.4.1 |

**Lo que está bien:** enlace para saltar al contenido, `main` enfocable, landmarks, `caption` y
`th scope` en todas las tablas. Todos los campos tienen etiqueta. `aria-pressed` en el conmutador
de modo y `aria-current` en la ventana 30/60. `aria-invalid` y `aria-describedby` bien enlazados en
el registro. Borrado en dos pasos. Movimiento reducido respetado.

### Responsive (2 / 4)

- No hay scroll horizontal de página en ningún tamaño (390, 1024 y 1280 px), salvo con el error de
  Categoría: 1540 px de ancho con la ventana a 1280 y 1410 px con la ventana a 390.
- **[Medio]** A 390 px las tablas se desplazan por dentro sin ninguna pista visual, y Editar y
  Borrar quedan fuera de pantalla (tabla de errores 777/348 px). *Propuesta:* pasar la tabla de
  errores a tarjetas por debajo de 620 px.
- **[Bajo]** Casi todos los objetivos táctiles miden menos de 44 px (por ejemplo 26 de 27 en una
  sesión abierta). Es AAA, y el móvil es secundario en esta app. Casilla de 13×13 px.
- **[Bajo]** La navegación ocupa 3 filas (113 px) a 390 px y el filete vertical del grupo
  secundario cruza las filas.
- **[Bajo]** Tres puntos de ruptura distintos: 600, 620 y 760 px.

### Theming y consistencia (3 / 4)

- **[Medio] Primitivas duplicadas que ya divergen:**
  - Botón primario: `capture.module.css:115`, `session.module.css:71` (con `width:100%`),
    `writing.module.css` (sin `nowrap`) y `anki.module.css:67` (`.add`).
  - Botón secundario: cuatro rellenos distintos (4×10, 6×10, 6×14 y 6×14).
  - `chipStudy`/`chipExec`: 4 copias; en `anki.module.css` está partido entre las líneas 135 y 172.
  - Tablas: 3 implementaciones, y una sin borde.
  - `fieldError`, `label`, `hint`, `empty` y `panel`: 3 copias de cada uno.
  - `.actions` está definido dos veces en `session.module.css` (líneas 65 y 123).
- **[Medio] Se rompe la regla de las dos plumas.** El rojo de ejecución se usa para SEGURO, los
  errores de validación, DO NOW, «por debajo» en Q5 y «% repetido». El azul de estudio, para
  «cumplido».
- **[Bajo]** Colores literales (`#000` ×4 en los hover, `#fff` ×3, 4 fondos de nivel en
  `ruoe.module.css:58-67`), `999px` ×7 sin token y 11 estilos en línea (informe, anki, writing y
  exportar).
- **[Bajo]** La escala tipográfica es muy comprimida (11–19 px): entre sección y cuerpo hay 2 px.
  La jerarquía descansa en el peso y los bordes.
- **[Bajo] La navegación secundaria sale como no se pretendía.** `.link` anula `.secondary`
  ([layout.module.css:43-53](../../src/app/layout.module.css#L43-L53)), así que se ve en tinta
  suave y no en tinta tenue, como pretende el CSS. Por contraste es mejor así, pero es un
  accidente. Hay que corregir DESIGN.md.
- No hay modo oscuro. Solo lo anoto: no lo pide nadie.

### Rendimiento (3 / 4)

Sin problemas reales para una herramienta local:

- `force-dynamic` es correcto con SQLite.
- `/anki` bloquea la página mientras espera a AnkiConnect (apartado E).
- `ImportReview` monta un `ErrorFields` completo, con dos `datalist`, por cada fila. Con tandas
  normales no se nota.

### Integridad de implementación (2 / 4)

Pasa por poco: el sistema es propio del producto, pero la ejecución se ha desviado (primitivas
duplicadas, botones que no dicen lo que hacen, valores internos en crudo y el rojo sobrecargado).

## Verificación de `impeccable detect`

| Regla | Nº | Causa verificada | Veredicto |
|---|---|---|---|
| low-contrast (`#8b8474`) | la mayoría | `--ink-faint` sobre el fondo, la hoja y la hoja hundida | **Real** |
| low-contrast (`#8a6d1f`) | ×2 por página | Aviso de demo y chip QUEUED, 4,31:1 | **Real** |
| low-contrast «Crear en Anki» | ×11 | Botón deshabilitado al 55 %, 3,85:1 | **Falso positivo** (WCAG exime los controles inactivos), aunque el problema de fondo es real (apartado E) |
| line-length ~213 | cada página | Aviso de demo: 116 caracteres, solo en demo | **Falso** |
| line-length ~174 / ~188 | 2 | Introducción de «Pegar sesión» (104 caracteres) y explicación de «Repaso en Anki» (unos 183) | **Real**, leve |
| line-length ~90 | ×6 | Celdas de acción de las reglas dentro del `<details>` cerrado | **Falso** en la práctica |
| text-occlusion | ×4 | Hijos del `<details>` cerrado, que no se pintan. Con el `<details>` abierto hay 0 oclusiones y las barras de Q1 no tapan cifras | **Falso** |
| cramped-padding | ×2 | Tabla a sangre dentro del marco, con celdas de 6×10 px de relleno | **Falso** |
| cream-palette | ×8 | `--bg #f2efe6`, papel hueso documentado en DESIGN.md | **Intencional** |
| repeating-stripes-gradient | ×1 | Celdas «sin datos» de RUOE, con texto `sr-only` | **Falso**, es funcional |
| side-tab (estático) | ×1 | [certezas.module.css:14](../../src/app/certezas/certezas.module.css#L14) | **Real** |
| *(no detectado)* | — | El chip de causa tapa el mensaje de error de Categoría | **Real, el detector no lo ve** |

Salidas completas: `detect-before.txt`, `detect-before.json` y `detect-before-urls.txt`.

## Qué funciona y hay que conservar

1. **El registro uno a uno por teclado.** El orden de Tab sigue la rejilla, Enter guarda, el foco
   vuelve a Ítem, conserva los valores de la tanda y anuncia «Error registrado.». Un error se
   registra en unos 3 s.
2. **La tarjeta de corrección** (respuesta tachada en rojo → correcta) y **la matriz RUOE** que
   distingue «vacío» de «cero».
3. **El DO NOW único**, con las demás reglas en cola y la tabla completa plegada.
4. **Honestidad en los momentos delicados.** «Se borran también sus N errores», la importación que
   se guarda entera o no se guarda, y los mensajes de AnkiConnect con el paso siguiente.

## Fuera de alcance: decisiones que no son de interfaz

Estas ideas salieron en la revisión, pero tocan reglas de negocio o el modelo de datos. **No entran
en el rediseño sin tu aprobación expresa:**

- **Pedir la regla más tarde.** Hoy se exige al volcar, con 15 caracteres como mínimo. La idea es
  pedirla al convertir en Anki, lo que bajaría el volcado a Correcta y Categoría. Cambia la
  validación y la SPEC.
- **Ventana fija para el DO NOW.** Hoy puede cambiar al pasar de 30 a 60 días; la idea es dejar el
  conmutador solo para las cifras. Cambia el motor de reglas.
- **Semanas vacías en el eje de RUOE.** Cambia la consulta Q3.
- **Crear una sesión de Writing desde `/writing`.** Hace falta una acción nueva. La alternativa
  de solo interfaz, un enlace con el formulario precargado, sí entra.
