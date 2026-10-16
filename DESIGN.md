---
name: Error Log C1
description: Registro personal de errores para el Cambridge C1. Herramienta para trabajar, papel para leer.
colors:
  paper: "#f6f5f1"
  surface: "#ffffff"
  surface-2: "#ecedea"
  skeleton: "#e4e5e0"
  selected: "#e6ece8"
  brand-tint: "#e3eae6"
  ink: "#20231f"
  ink-2: "#5b6259"
  ink-disabled: "#a5aba2"
  primary-hover: "#383c36"
  primary-blocked: "#8d928a"
  rule: "#daddd5"
  control: "#7c847a"
  brand: "#304f46"
  success: "#276544"
  warning: "#805509"
  warning-soft: "#e2c98f"
  danger: "#b23830"
  danger-soft: "#f7e9e7"
  info: "#315f83"
  viz-study: "#315f83"
  viz-exec: "#9aa396"
  viz-bar-past: "#9fbdb0"
  viz-acc-85: "#c9dcd3"
  viz-acc-70: "#dfe9e3"
  viz-acc-55: "#ecedea"
  viz-acc-low: "#f1e9da"
typography:
  page-title:
    fontFamily: "Source Serif 4"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: "36px"
    letterSpacing: "-0.01em"
  reco-title:
    fontFamily: "Source Serif 4"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: "38px"
  prompt:
    fontFamily: "Source Serif 4"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: "28px"
  prompt-lg:
    fontFamily: "Source Serif 4"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: "32px"
  correction:
    fontFamily: "Source Serif 4"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "26px"
  section:
    fontFamily: "IBM Plex Sans"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "24px"
  body:
    fontFamily: "IBM Plex Sans"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  field:
    fontFamily: "IBM Plex Sans"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
  label:
    fontFamily: "IBM Plex Sans"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  data:
    fontFamily: "IBM Plex Mono"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "tnum"
  kbd:
    fontFamily: "IBM Plex Mono"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "16px"
  meta:
    fontFamily: "IBM Plex Sans"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  entry-title:
    fontFamily: "Source Serif 4"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: "26px"
  quote:
    fontFamily: "Source Serif 4"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  metric:
    fontFamily: "IBM Plex Sans"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "32px"
    fontFeature: "tnum"
  figure:
    fontFamily: "IBM Plex Sans"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
    fontFeature: "tnum"
rounded:
  control: "4px"
  panel: "6px"
  overlay: "8px"
  float: "10px"
  paper: "2px"
spacing:
  space-1: "4px"
  space-1-5: "6px"
  space-2: "8px"
  space-2-5: "10px"
  space-3: "12px"
  space-4: "16px"
  space-5: "24px"
  space-6: "32px"
  space-7: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-blocked:
    backgroundColor: "{colors.primary-blocked}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.control}"
    rounded: "{rounded.control}"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.control}"
    rounded: "{rounded.control}"
    height: "40px"
  segmented-on:
    backgroundColor: "{colors.brand-tint}"
    textColor: "{colors.brand}"
  row-selected:
    backgroundColor: "{colors.selected}"
    borderLeft: "3px {colors.brand}"
  surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
---

<!-- Sistema del rediseño v5 (feature/ui-v5, 24-sep-2026), recreado desde
     «Error Log C1 v5.dc.html» de Claude Design. Los tokens viven en src/app/globals.css,
     las primitivas en src/app/_shared/ui.module.css y las capas en overlay.module.css. -->

# Design System: Error Log C1

## Overview

**Creative North Star: "Plex para trabajar, serif para leer"**

Un cuaderno de trabajo editorial, preciso y tranquilo. La interfaz es de herramienta
(IBM Plex Sans y Plex Mono, filas de 44 px, atajos de teclado visibles y búsqueda global
con Ctrl/⌘+K). Lo que se lee —títulos de página, la recomendación de Progreso, los
enunciados y la pareja «Tu respuesta → Corrección»— va en Source Serif 4.

La profundidad no sale de cajas: papel con grano, una zona de trabajo blanca con sombra
suave donde se edita, y **cristal solo en lo que flota** (cabecera fija, barra inferior de
la tanda, menús, la paleta ⌘K y avisos). Nunca en tablas ni datos.

**Key Characteristics:**
- Papel `#F6F5F1` con grano SVG al 7 %; superficie blanca para editar y para dialogs.
- Una acción primaria por tarea visible, en tinta; un verde de marca (`#304F46`) para foco,
  selección e identidad, no para la acción.
- Tablas abiertas: filete de tinta arriba, cabecera en tinta secundaria, filas separadas.
- Estados siempre con texto o forma, nunca solo color. Rojo reservado al daño y al error.
- Iconos Lucide (`lucide-react`), 16 px en controles y 18 en botones de icono.
- Todo el texto funcional pasa 4,5:1 sobre papel, superficie y superficie-2.

## Colors

### Primary
- **Tinta** (`ink`): texto y botón primario. Hover `primary-hover`; con `aria-disabled`,
  `primary-blocked` y el motivo en `aria-describedby`.

### Brand
- **Verde tinta** (`brand`): anillo de foco (2 px, desplazamiento 2), fila seleccionada
  (barra de 3 px sobre `selected`), pestaña activa (subrayado de 2 px), segmentado o filtro
  activo (`brand-tint` con texto `brand`) y el cuadrado de la marca.

### Estados
- **Éxito** (`success`): guardado, verificado, «Listo», «Disponible».
- **Aviso** (`warning`): lo que pide atención ahora: incompleto, sesión abierta (rombo),
  muestra pequeña, Anki no disponible. Un campo pendiente de completar lleva el borde en
  este color. No es para hechos neutros: el alcance de una descarga («Siempre 30 días») va
  en `ink-2`, y «Pendiente» en una lista va en tinta con su forma (`AnkiStateText`).
- **Deltas** en tinta con su signo (`signedDecimal`: «+0,5», «−0,5», «=»): el signo ya dice
  la dirección y el rojo queda para el daño.
- **Error / destructivo** (`danger`): validación, confirmación de borrado, tarjeta
  desactualizada, respuesta propia tachada.
- **Información** (`info`): ayuda contextual (qué genera una causa, cabecera que no suma).

### Marcador del Notebook
- `--mark-green`, `--mark-red` y `--mark-blue` son `success`, `danger` e `info`: una marca roja
  es el mismo rojo que un error. Solo `--mark-orange` y `--mark-highlight` (el amarillo de
  resaltar) son propios del marcador.

### Visualización
- **Causas**: `viz-study` las que se estudian, `viz-exec` las de protocolo de examen.
- **RUOE**: `viz-acc-*` como fondo de celda por tramo; el número y la ratio mandan.
- **Evolución por part**: semanas previas en `viz-bar-past`, la última en `brand`, sin
  práctica = 2 px de `rule`.

### Named Rules
**The Glass Rule.** El cristal es para lo que flota sobre la página. Lo que se lee o se
edita (tablas, editores, drawer, panel de detalle, dialogs) va en blanco sólido.

**The Readable Ink Rule.** `ink-disabled` solo para «—» o texto deshabilitado; nunca para
algo que haya que leer.

## Typography

- **Page title** (Serif 600, 30/36, −0,01 em): h1 de cada vista. 25/30 en móvil.
- **Reco title** (Serif 600, 30/38): la recomendación de Progreso.
- **Prompt** (Serif 400, 19/28; 22/32 en el editor de la tanda): enunciados.
- **Correction** (Serif 600, 18/26): la corrección; la respuesta propia en Serif 400
  tachada en `danger` (1,5 px).
- **Section** (Sans 600, 18/24) y **Subtitle** (Sans 600, 16/22).
- **Body** (Sans 400, 14/20). **Field** (15/22; 16 en móvil). **Label** (500, 13/18).
- **Data** (Mono 13, tabular): fechas, respuestas en listas, nombres de fichero. **Kbd**
  (Mono 500 11/16). **Meta** (Sans 12/16): atajos al pie, grupos de la paleta, la ratio bajo una cifra.
- **Entry title** (Serif 600, 19/26): título de una entrada en una lista. **Quote** (Serif 400,
  16/24): el tramo citado en una fila o una nota y la respuesta en la paleta. **Answer** (Serif
  400, 18/26): la respuesta propia junto a la corrección.
- **Cifras** en Plex Sans tabular, nunca en mono: **Metric** (600, 28/32) para la principal y
  **Figure** (600, 20/28) para las secundarias. Así «12,5/20» no abre huecos.

La escala vive en `globals.css`: estilos completos `--text-*` y, cuando solo cambia el tamaño,
los pasos `--fs-*` (11 · 12 · 13 · 14 · 15 · 16 · 18 · 19 · 20 · 22 · 25 · 28 · 30). Ningún
módulo escribe un tamaño en px; el Markdown del Notebook escala sus encabezados en `em`.

Las fuentes se sirven desde el propio origen (`next/font/local`, ficheros en
`src/app/fonts/`, licencia OFL): ni el build ni el navegador piden nada a la red.

### Named Rules
**The Spoken Label Rule.** Ningún valor interno se muestra en crudo: `CONFUSION` se lee
«Confusión». Las etiquetas viven en `src/app/_shared/labels.ts`; lo guardado y lo exportado
sigue siendo el valor interno.

## Layout

- Página de 1200 px de contenido (1264 con márgenes), padding 32/32/96; 24 en tableta y 16
  en móvil. Cabecera fija de 56 px en cristal (dos filas en móvil).
- Navegación en dos grupos, **Ritual | Biblioteca**: Sesiones · Errores · Progreso · Anki,
  un filete vertical, Notebook · Writing. **Más ▾** solo guarda Exportar datos y Ajustes.
  Al final, el botón Buscar con su atajo.
- **Cabecera de página** (`PageHeader`), la misma en todas las vistas y con los huecos fijos:
  «← Sección» arriba a la izquierda (`BackLink`, que hace de antetítulo: no hay otro), título
  serif con lo que vaya a su lado (el estado de una sesión), entradilla en `ink-2`, acciones
  a la derecha alineadas con el título (un primario como mucho, o el selector de periodo) y
  pestañas debajo. Las hojas de lectura (una redacción, un apunte) llevan su título en la
  hoja, pero el «volver» va en el mismo sitio.
- Listado + detalle: rejilla `minmax(0,1fr) 360px` con el panel pegado arriba. Con el
  panel abierto, la tabla retira columnas (Causa y Anki, o Contexto).
- **Puntos de ruptura:** < 640 móvil (dos filas de cabecera, controles de 44 px, detalle y
  editores a pantalla completa); 640–1023 una columna con el detalle como pantalla;
  ≥ 1024 listado y panel lado a lado. Nunca scroll horizontal de página: las tablas y
  matrices anchas se desplazan dentro de su contenedor (con `position: relative`, para que
  el `caption` accesible no escape).

## Elevation & Depth

- `--shadow-1` para superficies de trabajo (editor, panel de detalle, recomendación).
- Menús, dialog, paleta y drawer tienen su propia sombra.
- Cristal: cabecera y barra inferior `rgba(246,245,241,.74–.76)` con `blur(16px)`; menús y
  combobox en blanco al 84–92 %; paleta al 90 % con `blur(20px)`; avisos en tinta al 84 %.
  Fallback sólido con `@supports not (backdrop-filter)`.
- **Una sola escala de capas** (`--z-*`): `raised` 1 dentro de un componente · `bar` 5 barras
  pegajosas de la página · `float` 10 nota del lector y listas · `sticky` 20 cabecera y menús ·
  `scrim` 25 velo · `drawer` 30 drawer, detalle a pantalla completa y panel de Writing ·
  `toast` 40 · `dialog` 50 · `palette` 60. El aviso va por encima de cualquier panel.
  Ningún módulo escribe un `z-index` numérico.
- Un solo velo, `--scrim` (con `--scrim-blur` en dialog y paleta).

## Shapes

Radios de 2 px (la hoja de una redacción o un apunte), 4 px (controles), 6 px (paneles), 8 px
(menús y dialogs) y 10 px (⌘K). Sin píldoras: un filtro activo tiene la forma de un control.

Espaciado en pasos de 4 (`--space-1` a `--space-7`) más dos intermedios, `--space-1-5` (6) y
`--space-2-5` (10), solo para el relleno interior de controles: menú, opción, aviso.

## Components

Primitivas en `src/app/_shared/ui.module.css` (sin margen exterior) y capas en
`overlay.module.css`.

### Buttons
- **Primario** (`ui.primary`), **secundario** (`ui.secondary`), **ghost** (`ui.ghost`),
  **destructivo** (`ui.danger`, solo dentro de una confirmación); `ui.compact` a 36 px.
- **Icono** (`ui.iconButton`, 36×36, 44 en táctil) con `aria-label` específico.
- **Kbd** junto a la acción que tiene atajo; las etiquetas salen de `useShortcutLabels()`
  (⌘ en Mac, Ctrl en el resto) y el gestor acepta ambos modificadores.

### Navegación y filtros
- **BackLink**: «← Sección» en tinta secundaria; su nombre accesible es «Volver a Sección»,
  distinto del enlace de la navegación. Una pista detrás («· filtro conservado») si la hay.
- **Tabs** (`ui.tabs`/`ui.tab`): enlaces con `aria-current`, subrayado de marca.
- **Segmentado** (`ui.segmented`): conmutador 30/60 días; conserva los demás parámetros.
- **FilterBar**: búsqueda (`LiveSearch`), píldoras, menús y el recuento al final. **Todo se
  aplica al momento** y vive en la URL: no hay botón «Aplicar». Las búsquedas filtran al
  escribir (250 ms).
- **FilterMenu**: un filtro como menú de enlaces; el botón dice el filtro y su valor
  («Causa: Todas»). Activo, el botón va en `brand-tint` con su × para quitarlo sin abrir el
  menú.
- **Pills** (`ui.pills`) para Todas/Abiertas y **chip** (`ui.chip`) para un filtro que no
  tiene menú (p. ej. «Solo sesiones con ítems», que llega desde Progreso).

### Datos
- **Tabla** (`ui.dataTable`, con `ui.dataTableFixed` si la vista fija anchos): `<table>` real
  con `caption`, filete de tinta arriba, filas de 44 px y dentro de `ui.scrollX`. Cada
  columna declara su tipo: `colNum` (cifras a la derecha, tabulares), `colDate`, `colStatus`
  (forma y texto, sin partir), texto (parte entre palabras; el ancho debe dejar caber la más
  larga) y `colLong`. La cabecera de fila es un `<th scope="row">`. Fila clicable con
  `data-clickable` y un botón o enlace dentro para el teclado; seleccionada con
  `data-selected`: `selected` + barra de marca.
- **EmptyState** (`ui.empty`): ocupa el sitio de lo que falta y arranca con su mismo filete.
  Causa en tinta, detalle en `ink-2` y el siguiente paso (un enlace). Título solo en un
  primer uso; `inset` lo deja sin filete dentro de un bloque que ya lo tiene. Nunca un «0»
  ni una caja punteada.
- **FileDrop**: elegir o soltar un archivo con los textos de la app, nunca el «Choose File»
  del navegador. `zone` cuando es la entrada principal (título, pista y el elegido en mono);
  `button` cuando es la alternativa a pegar el texto.
- **StatusText**: rombo «Abierta» en aviso, cuadrado «Cerrada» en tinta secundaria.
- **AnkiStateText**: el estado Anki en una fila. «Pendiente» en tinta con anillo hueco,
  «Convertida» en `success` con punto, «Marca manual» y «No aplica» en `ink-2`. En el panel
  de detalle, donde es la llamada a la acción, «Pendiente» sí va en aviso.
- **CorrectionPair**: en línea (mono) para listas; en detalle (serif, dos filas). Sin
  respuesta propia: «Mi respuesta no registrada», en cursiva y sin tachar.

### Capas
- **Toast** (`useToast`): abajo al centro, por encima de cualquier panel; fuera de las filas
  que se desmontan. 5 s, o 10 s si lleva «Deshacer», y se detiene mientras el ratón o el foco
  están en él. Ctrl/⌘+Z deshace fuera de un campo de texto, y el atajo se ve junto a la acción.
  La región `role=status` está siempre montada, para que el lector de pantalla lo anuncie.
- **ConfirmDialog**: `<dialog>` modal, foco en Cancelar, nombra el objeto y todas sus
  consecuencias.
- **Drawer**: derecha, 520 px, bajo la cabecera, blanco sólido, no modal; Escape cierra y
  devuelve el foco.
- **Capas a pantalla completa** (el drawer en móvil, el detalle de Errores y el panel de
  Writing bajo 1024 px): `useInertBehind` (`_shared/layer.ts`) deja inerte lo que hay detrás
  en `<main>`, así que Tab no se escapa. La cabecera y el aviso siguen vivos.
- **Menu**: flechas, Escape y clic fuera.
- **CommandPalette** (Ctrl/⌘+K): errores (máx. 5) y sesiones (máx. 3) buscados en el
  servidor, y acciones con sus atajos. La opción activa se ve como una fila seleccionada
  (`selected` y barra de marca) y el campo con foco se subraya en la marca.

### Revisión de tanda
Índice de 300 px (nº · corrección · Listo/Falta) + un solo editor para la fila elegida,
progreso segmentado y barra inferior en cristal. El borrador vive en el estado por fila y
en el navegador hasta que el servidor confirma; el envío mantiene el contrato de siempre.
Un fallo de transporte se dice como «No pudimos confirmar el guardado», nunca como «no se
ha guardado nada».

## Do's and Don'ts

### Do:
- **Do** usar Serif solo para leer y Plex para trabajar.
- **Do** dar a cada cifra su denominador y a cada vacío su «—» o su frase; vacío no es cero.
- **Do** confirmar con el servidor antes de anunciar éxito (guardar, importar, Anki).
- **Do** usar las primitivas de `ui.module.css` antes de crear una clase nueva.

### Don't:
- **Don't** escribir colores, radios o tamaños literales en los módulos: todo sale de `:root`.
- **Don't** poner cristal en tablas, listas, editores ni en el panel de detalle.
- **Don't** usar color como única señal de estado.
- **Don't** usar `window.confirm`: las confirmaciones son `ConfirmDialog`.
- **Don't** poner más de un primario por tarea visible.

## Writing

- Writing es un destino principal con Biblioteca, Reescrituras y Progreso. La biblioteca
  filtra redacciones por búsqueda, estado, tipo y orden; el lector presenta el texto en
  una hoja serif y las correcciones en un panel, con Drawer en móvil.
- El lector muestra en reposo solo los errores, con un subrayado rojo fino y sin fondo.
  Al pasar por un párrafo (o con foco o un toque) aparecen sus fondos y sus notas de
  párrafo, como marcas al margen. Pasar por un error abre una nota con «tu texto →
  corrección», el comentario y el tipo; con un clic se queda y trae sus acciones.
  La nota se puede recorrer con el ratón sin que desaparezca y Escape la cierra (WCAG 1.4.13).
- El panel de anotaciones está cerrado por defecto y se abre como columna al margen
  (bajo 1024 px, cajón bajo la cabecera, con velo y el fondo inerte). Anotar, corregir la transcripción en la propia hoja, editar
  los datos y exportar viven en «Más acciones». La pestaña Progreso muestra medidas, filtros, evolución
  ordinal y estadísticas por criterio; cada vacío conserva su significado y las fechas
  aproximadas se distinguen visualmente.
- La acción de exportación del lector descarga JSON reimportable con evaluación,
  anotaciones y anclajes. Exportar datos incluye esas anotaciones en el volcado v4.
  [Contrato JSON](docs/WRITING-JSON.md) y [plan](docs/WRITING-PLAN.md).

## Notebook

- Entrada en la cabecera, en el grupo de la biblioteca junto a Writing, y en la paleta. La
  portada abre con búsqueda, carpetas, modificados recientes, la acción «Nuevo apunte» y
  la secundaria «Importar .md». El estado vacío explica cómo crear el primero.
- Portada en `/notebook`, alta en `/notebook/nuevo`, importación en `/notebook/importar`,
  lector en `/notebook/<id>-<slug>` y editor en su subruta `/editar`. El sufijo describe
  el título; el ID conserva el enlace tras renombrar. Las descargas usan
  `/exportar/notebook.zip` y `/exportar/notebook-<id>.md`.
- Exportar ofrece el cuaderno completo en ZIP desde la pantalla Exportar y un `.md` suelto
  desde el lector. El aviso dice qué lleva el manifiesto, que los enlaces pasan a rutas
  relativas con anclas de GitHub y que los vínculos con errores no se restauran al importar.
- Importar analiza un `.md` sin guardar nada: propone título, carpeta y etiquetas
  editables, lista los avisos (frontmatter no interpretado, campos descartados, HTML,
  imágenes, destinos no resolubles) y enseña la vista previa con el renderizador del
  lector. Solo «Crear apunte» escribe, y siempre crea un apunte nuevo.
- La lectura usa Source Serif 4 y `--reading-max`; directorio e índice acompañan al
  texto en pantallas amplias. Bajo 1024 px, directorio e índice se despliegan y el
  contenido ocupa una columna. Las tablas Markdown desplazan dentro de su contenedor.
- La estrella de favoritos confirma con el servidor antes de cambiar. El directorio muestra
  hasta ocho y la vista Favoritos reúne todos; la marca no altera la fecha ni la revisión.
- El editor usa Plex, textarea nativo, toolbar pequeña y pestañas Editar/Vista previa.
  La vista previa comparte renderizador con el lector. Guardar ahora y Ctrl/⌘+S
  complementan autosave; un estado visible distingue pendiente, guardando, guardado,
  conflicto y error. El borrador local se escribe a los 250 ms y se puede recuperar o
  descargar. El envío al servidor empieza tras un segundo sin cambios; solo la respuesta
  confirmada muestra «guardado». Un conflicto conserva el borrador y permite cargar lo
  guardado o crear otro apunte.
- El índice usa enlaces reales, foco visible, teclado, scroll margin para la cabecera y
  movimiento reducido cuando lo pide el sistema. Enlaces externos abren con atributos
  seguros; imágenes se muestran como texto o aviso, sin peticiones de red.
- El detalle de error permite buscar y vincular un apunte o apartado, además de abrirlo.
  Si cambia un encabezado, se conserva el vínculo al documento y se muestra el aviso.
  Borrar un apunte o carpeta requiere la confirmación existente.
