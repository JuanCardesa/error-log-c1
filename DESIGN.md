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
rounded:
  control: "4px"
  panel: "6px"
  overlay: "8px"
  float: "10px"
spacing:
  space-1: "4px"
  space-2: "8px"
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
- **Aviso** (`warning`): pendiente, incompleto, sesión abierta (rombo), muestra pequeña,
  «Siempre 30 días». Un campo pendiente de completar lleva el borde en este color.
- **Error / destructivo** (`danger`): validación, confirmación de borrado, tarjeta
  desactualizada, respuesta propia tachada.
- **Información** (`info`): ayuda contextual (qué genera una causa, cabecera que no suma).

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
- **Data** (Mono 13, tabular): fechas, ratios, respuestas en listas. **Kbd** (Mono 500 11/16).

Las fuentes se sirven desde el propio origen (`next/font/local`, ficheros en
`src/app/fonts/`, licencia OFL): ni el build ni el navegador piden nada a la red.

### Named Rules
**The Spoken Label Rule.** Ningún valor interno se muestra en crudo: `CONFUSION` se lee
«Confusión». Las etiquetas viven en `src/app/_shared/labels.ts`; lo guardado y lo exportado
sigue siendo el valor interno.

## Layout

- Página de 1200 px de contenido (1264 con márgenes), padding 32/32/96; 24 en tableta y 16
  en móvil. Cabecera fija de 56 px en cristal (dos filas en móvil).
- Navegación: **Sesiones · Errores · Progreso · Anki · Más ▾** (Writing, Exportar datos) y
  el botón Buscar con su atajo.
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

## Shapes

Radios de 4 px (controles), 6 px (paneles), 8 px (menús y dialogs) y 10 px (⌘K). Píldora solo
en el chip de filtro activo.

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
- **Tabs** (`ui.tabs`/`ui.tab`): enlaces con `aria-current`, subrayado de marca.
- **Segmentado** (`ui.segmented`): conmutador 30/60 días; conserva los demás parámetros.
- **Pills** (`ui.pills`) para Todas/Abiertas y **chip** (`ui.chip`) para un filtro activo.

### Datos
- **Tablas** reales (`<table>` con `caption`) y columnas fijas; fila clicable con un
  botón o enlace dentro para el teclado. Seleccionada: `selected` + barra de marca.
- **StatusText**: rombo «Abierta» en aviso, cuadrado «Cerrada» en tinta secundaria.
- **CorrectionPair**: en línea (mono) para listas; en detalle (serif, dos filas). Sin
  respuesta propia: «Mi respuesta no registrada», en cursiva y sin tachar.

### Capas
- **Toast** (`useToast`): abajo al centro, 5 s, «Deshacer» opcional; fuera de las filas que
  se desmontan. `role=status`.
- **ConfirmDialog**: `<dialog>` modal, foco en Cancelar, nombra el objeto y todas sus
  consecuencias.
- **Drawer**: derecha, 520 px, blanco sólido, no modal; Escape cierra y devuelve el foco.
- **Menu**: flechas, Escape y clic fuera.
- **CommandPalette** (Ctrl/⌘+K): errores (máx. 5) y sesiones (máx. 3) buscados en el
  servidor, y acciones con sus atajos.

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
