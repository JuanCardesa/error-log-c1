---
name: Error Log C1
description: Registro personal de errores para el Cambridge C1, denso y orientado a datos.
colors:
  paper: "#f2efe6"
  sheet: "#fbf9f4"
  sheet-sunken: "#ebe7db"
  rule: "#d9d2c2"
  rule-strong: "#b9b09b"
  rule-field: "#8b8270"
  ink: "#1b1915"
  ink-soft: "#5b564b"
  ink-faint: "#6d6757"
  ink-hover: "#000000"
  on-color: "#ffffff"
  study-blue: "#1d4ed8"
  study-blue-wash: "#e3ecfd"
  study-blue-rule: "#b6ccf7"
  exec-red: "#b4231d"
  exec-red-wash: "#fbe7e5"
  exec-red-rule: "#f3c2bd"
  queued-ochre: "#7a5f17"
  queued-ochre-wash: "#faf0d6"
  watch-taupe: "#6b6352"
  watch-taupe-wash: "#efebe0"
  ok-green: "#2f6b43"
  ok-green-wash: "#e4f0e7"
  tier-high: "#dcefe2"
  tier-mid: "#eaf0d9"
  tier-low: "#faeed2"
  tier-bad: "#f8dcd8"
typography:
  page-title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  section:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  small:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.04em"
  data:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', 'Roboto Mono', Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  sm: "3px"
  pill: "999px"
spacing:
  sp-1: "2px"
  sp-2: "4px"
  sp-3: "6px"
  sp-4: "10px"
  sp-5: "14px"
  sp-6: "20px"
  sp-7: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  button-danger:
    backgroundColor: "{colors.exec-red}"
    textColor: "{colors.on-color}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-unavailable:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.sm}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  chip-study:
    backgroundColor: "{colors.study-blue-wash}"
    textColor: "{colors.study-blue}"
    rounded: "{rounded.pill}"
    padding: "0 6px"
  chip-exec:
    backgroundColor: "{colors.exec-red-wash}"
    textColor: "{colors.exec-red}"
    rounded: "{rounded.pill}"
    padding: "0 6px"
  state-good:
    backgroundColor: "{colors.ok-green-wash}"
    textColor: "{colors.ok-green}"
    rounded: "{rounded.pill}"
    padding: "0 6px"
  state-warn:
    backgroundColor: "{colors.queued-ochre-wash}"
    textColor: "{colors.queued-ochre}"
    rounded: "{rounded.pill}"
    padding: "0 6px"
  panel:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
    padding: "14px"
---

<!-- Sistema tras el rediseño de feature/ui-redesign (23-sep-2026). Los tokens viven en
     src/app/globals.css y las primitivas en src/app/_shared/ui.module.css. -->

# Design System: Error Log C1

## Overview

**Creative North Star: "El cuaderno corregido"**

Una hoja de ejercicios después de pasar por el profesor: papel claro, tinta negra para lo
escrito, azul y rojo para las correcciones. Todo lo visual sirve a dos cosas: volcar una
tanda deprisa y leer datos en columna. No hay imágenes, ilustraciones, sombras ni
movimiento más allá del foco.

La densidad es alta a propósito: el cuerpo va a 13 px y el espaciado en pasos de 2 a 28 px.
Los paneles llevan un borde fino. La monoespaciada lleva todo lo que se compara (fechas,
respuestas, cifras); la sans del sistema lleva la interfaz, la prosa y las etiquetas de las
taxonomías, que se leen como palabras («Preposición dependiente»), nunca como códigos. El
color es semántico y tiene dos escalas separadas:
- el **lado de la causa**: estudio en azul, ejecución en rojo;
- el **estado frente a un umbral**: bien en verde, pendiente en ocre, vigilar en topo.

**Key Characteristics:**
- Papel hueso con hojas algo más claras encima; la profundidad sale solo del tono y el borde.
- Monoespaciada tabular para todo dato comparable; texto legible para toda etiqueta.
- Azul y rojo reservados al lado de la causa; los umbrales usan la escala de estados.
- Negro de tinta para la acción primaria; sin color de marca.
- Esquinas casi rectas (3 px); píldoras para chips y estados.
- Todo texto de lectura pasa AA sobre las tres superficies; el foco es un contorno azul de
  2 px.

## Colors

Neutros cálidos de papel y tinta, con dos plumas de corrección y una escala de estados.

### Primary
- **Tinta** (`ink`): texto principal, botón primario, conmutadores activos. La acción
  principal no lleva color de marca: es tinta. Al pasar el ratón oscurece a `ink-hover`.

### Secondary
- **Azul de estudio** (`study-blue`, con `study-blue-wash` y `study-blue-rule`): causas que
  se arreglan estudiando (Desconocimiento, Confusión, Ortografía), sus chips y sus barras.
  También es el anillo de foco (`--accent`).

### Tertiary
- **Rojo de ejecución** (`exec-red` y sus derivados): causas de ejecución (Despiste,
  Formato, Tiempo), la respuesta equivocada tachada, errores de validación, borrado y
  «Haz esto».

### Neutral
- **Papel** (`paper`): fondo de página.
- **Hoja** (`sheet`): paneles, tablas y campos.
- **Hoja hundida** (`sheet-sunken`): cabeceras de tabla, hover, página actual en la barra y
  campos deshabilitados.
- **Filete** (`rule`) y **filete marcado** (`rule-strong`): separadores y bordes de panel,
  que son decorativos.
- **Borde de campo** (`rule-field`): el único borde que delimita un control. Da 3,3:1
  (WCAG 1.4.11).
- **Tinta suave** (`ink-soft`) y **tinta tenue** (`ink-faint`): texto secundario. La tenue
  da 4,56–5,35:1 sobre las tres superficies.

### Estados
- **Bien** (`ok-green`): umbral cumplido, sesión abierta, mensajes de éxito, «Disponible».
- **Pendiente** (`queued-ochre`, 5,32:1): por debajo de un umbral, «En cola», marca de valor
  heredado, Anki no disponible.
- **Vigilar** (`watch-taupe`): reglas en vigilancia y marcas neutras (reescritura de).
- **Tramos de RUOE** (`tier-*`): solo como fondo de celda; el número manda y hay leyenda.

### Named Rules
**The Two Pens Rule.** Azul y rojo pertenecen a la causa: estudio y ejecución. Un umbral
cumplido o no cumplido usa la escala de estados, nunca las plumas.

**The Readable Ink Rule.** Ningún texto que haya que leer baja de 4,5:1. Un control
inactivo que tenga que explicarse no se atenúa con opacidad: pasa a tinta tenue.

## Typography

**Display Font:** ninguna; no hay titular de exhibición.
**Body Font:** sans del sistema (`ui-sans-serif`, `system-ui`, Segoe UI en Windows).
**Label/Mono Font:** monoespaciada del sistema (`ui-monospace`, Cascadia Mono en Windows)
con cifras tabulares.

**Character:** tipografía de herramienta, sin voz propia. La personalidad sale del
contraste entre la sans de la interfaz y la mono de los datos.

### Hierarchy
- **Page title** (600, 22 px, 1,25): h1 de cada vista.
- **Section** (600, 16 px, 1,3): h2 de panel.
- **Body** (400, 13 px, 1,45): texto base, celdas y campos.
- **Small** (400, 12 px): notas, pistas, tablas y navegación secundaria.
- **Label** (400, 11 px, mayúsculas, +0,04 em): etiquetas de campo, cabeceras de tabla y
  etiquetas de dato en las tarjetas móviles.
- **Data** (mono, 13 px, tabular): fechas, respuestas y cifras.

### Named Rules
**The Column Rule.** Si un valor se compara en vertical, va en monoespaciada tabular y, si
es un número, alineado a la derecha. Una etiqueta de taxonomía es una palabra, no un dato,
y va en la sans.

**The Spoken Label Rule.** Ningún valor interno se muestra en crudo: `CONFUSION` se lee
«Confusión» y `DO NOW`, «Haz esto». Las etiquetas viven en `src/app/_shared/labels.ts`; lo
guardado y lo exportado sigue siendo el valor interno.

## Layout

Una columna central de hasta 1200 px con 20 px de margen, bajo una barra superior. La
navegación va en dos grupos, uso diario y detalle, y marca la página actual. Las vistas se
componen apilando paneles con 20 px entre ellos. No hay rejilla de página ni barra lateral.

**Orden por uso.** Cada vista abre con lo que se hace más a menudo: Registrar empieza por
las sesiones abiertas y la tanda de Macmillan, con la sesión manual plegada; el Informe,
por la acción de la semana.

**Captura:** rejilla de cinco columnas con áreas nombradas. Ítem es estrecho y Causa ocupa
dos columnas. **Revisión de tanda:** filas compactas con los cuatro campos que hay que
completar a la vista y el resto plegado; una barra fija al pie cuenta lo pendiente.

**Puntos de ruptura:** dos.
- **760 px:** los formularios pasan a una columna.
- **620 px:**
  - la navegación ocupa una fila con desplazamiento;
  - las filas de sesión pasan a dos líneas;
  - la tabla de errores se convierte en tarjetas etiquetadas;
  - las barras del Informe se ocultan.

## Elevation & Depth

Plano. No hay sombras. La profundidad se expresa con tres tonos (papel, hoja, hoja hundida)
y bordes de 1 px; el recuadro de «Haz esto» es el único borde de 2 px. La barra fija de la
revisión de tanda se separa con un filete superior, no con sombra.

### Named Rules
**The Flat Sheet Rule.** Nada flota. Lo que tiene que destacar cambia de tono o de borde,
no de altura.

## Shapes

Esquinas casi rectas (3 px) en paneles, campos y botones; píldora completa (`rounded.pill`)
en chips de causa, chips de estado y barras de proporción. Bordes continuos de 1 px, y
discontinuos solo para estados vacíos y la sesión cerrada.

## Components

Todas las primitivas se definen una sola vez en `src/app/_shared/ui.module.css` y no llevan
margen exterior: el espacio alrededor lo decide cada vista.

### Buttons
- **Primario** (`ui.primary`): tinta sobre hoja, 6 × 14 px. Es la acción que avanza la
  tarea; uno por formulario o por tarjeta. Un enlace que lleva a hacer algo («Ir a la cola
  de Anki», «Abrir una sesión de Writing») usa la misma forma.
- **Secundario** (`ui.secondary`): hoja con filete marcado, para acciones de apoyo,
  cancelar o cambiar de estado. Lo que solo lee («Sincronizar») es secundario; lo que
  escribe («Crear en Anki») es primario.
- **Peligro** (`ui.danger`): rojo de ejecución, solo en el segundo paso de un borrado.
- **Compacto** (`ui.small`): 4 × 10 px y 12 px, para acciones dentro de filas.
- **Estados:**
  - `disabled`: al 55 % de opacidad y cursor de prohibido;
  - `aria-busy`: cursor de espera;
  - `aria-disabled`: sigue enfocable, en tinta tenue y sin opacidad, con `aria-describedby`
    hacia el aviso que explica el motivo.

### Chips
- **Causa** (`ui.chipStudy`, `ui.chipExec`): píldora mono de 11 px con el lavado del color
  de su lado.
- **Estado** (`ui.stateGood`, `ui.stateWarn`): la misma forma, con la escala de estados.
  Se usa para umbrales, la disponibilidad de Anki y el estado de cada fila de una tanda.

### Cards / Containers
- **Panel** (`ui.panel`): hoja sobre papel, 1 px de filete marcado, 14 px de relleno.
- **Vacío** (`ui.empty`): discontinuo, 64ch como máximo. Vacío no es cero: sin datos se
  escribe «—», no 0.
- **Avisos** (`ui.noticeOk`, `ui.noticeError`): el resultado de una acción, con su fondo.
  Un aviso que sigue a una navegación recibe el foco.

### Inputs / Fields
- **Estilo:** hoja, borde de campo (3,3:1), 3 px; la etiqueta (`ui.label`) va encima.
- **Foco:** contorno azul de 2 px con desplazamiento de 2 px. Funciona en el modo de alto
  contraste de Windows. Donde un contenedor con desplazamiento lo recortaría, va hacia
  dentro.
- **Error:** borde rojo con `aria-invalid` y un mensaje por línea debajo (`ui.fieldError`),
  enlazado con `aria-describedby` y sin `role="alert"`. El foco va al primer campo
  rechazado.
- **Heredado:** un valor que pasa de un error al siguiente lleva la marca «heredada» en ocre
  junto a su etiqueta hasta que se toca.
- **Taxonomías cerradas:** siempre desplegable, nunca texto libre.

### Navigation
- Enlaces de 13 px en tinta suave; el grupo de detalle, a 12 px en tinta tenue, separado
  por un filete vertical.
- **Página actual:** `aria-current="page"`, tinta plena, peso 600 y hoja hundida.
- A 620 px, una sola fila con desplazamiento.

### Tabla de datos
- `ui.table`: cabecera en etiqueta de 11 px sobre hoja hundida, celdas de 12 px y filete
  entre filas. Suelta sobre el papel lleva marco (`ui.framed`); dentro de un panel, no.
- A 620 px, la tabla de errores de una sesión pasa a tarjetas con cada dato etiquetado
  (`data-label`).

### Tarjeta de corrección (firma del sistema)
- La respuesta equivocada tachada en rojo, una flecha y la correcta en negrita, en mono de
  15 px, con la regla debajo.
- Se usa en la cola de Anki y en Falsas certezas.
- La fecha enlaza a la sesión del error.

### Revisión de tanda
- **Filas:** cada error es un `fieldset` con su chip de estado («Completo», «Falta: …» o
  «Rechazado») y un resumen de solo lectura.
- **A la vista:** Correcta, Causa, Categoría, Confianza y Regla. El resto va plegado.
- **Barra fija:** «Faltan N de M», «Ir al siguiente pendiente» y guardar. No se envía nada
  mientras quede algo por completar.

## Do's and Don'ts

### Do:
- **Do** usar monoespaciada tabular para fechas, cifras y respuestas, y la sans para
  etiquetas.
- **Do** mostrar cada valor de taxonomía con su etiqueta de `labels.ts`.
- **Do** usar la escala de estados para umbrales y disponibilidad.
- **Do** expresar profundidad con tono y filete, nunca con sombra.
- **Do** escribir «—» donde no hay datos.
- **Do** dar a cada vista su orden por uso: lo diario, primero; lo demás, plegado o a un
  clic.
- **Do** usar las primitivas de `ui.module.css` antes de crear una clase nueva.

### Don't:
- **Don't** escribir colores, radios o tamaños literales en los módulos: todo sale de
  `:root`.
- **Don't** usar azul o rojo para decir «bien» o «mal» frente a un umbral.
- **Don't** mostrar un valor interno en mayúsculas en la interfaz.
- **Don't** usar `overflow: hidden` en un contenedor de controles: recorta el foco.
- **Don't** usar bordes laterales de color, sombras ni `window.confirm`.
- **Don't** añadir un color de marca a la acción primaria.
