---
name: Error Log C1
description: Registro personal de errores para el Cambridge C1, denso y orientado a datos.
colors:
  paper: "#f2efe6"
  sheet: "#fbf9f4"
  sheet-sunken: "#ebe7db"
  rule: "#d9d2c2"
  rule-strong: "#b9b09b"
  ink: "#1b1915"
  ink-soft: "#5b564b"
  ink-faint: "#8b8474"
  study-blue: "#1d4ed8"
  study-blue-wash: "#e3ecfd"
  study-blue-rule: "#b6ccf7"
  exec-red: "#b4231d"
  exec-red-wash: "#fbe7e5"
  exec-red-rule: "#f3c2bd"
  queued-ochre: "#8a6d1f"
  queued-ochre-wash: "#faf0d6"
  watch-taupe: "#6b6352"
  watch-taupe-wash: "#efebe0"
  ok-green: "#2f6b43"
  ok-green-wash: "#e4f0e7"
typography:
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  section:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.45
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
    padding: "6px 20px"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-danger:
    backgroundColor: "{colors.exec-red}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
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
  panel:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
    padding: "14px"
---

<!-- Estado incumbente, documentado el 23-sep-2026 antes del rediseño (rama feature/ui-redesign).
     Describe lo que hay, no lo que debería haber: los problemas están en docs/ui-review/AUDIT.md. -->

# Design System: Error Log C1

## Overview

**Creative North Star: "El cuaderno corregido"**

Una hoja de ejercicios después de pasar por el profesor: papel claro, tinta negra para
lo escrito, azul y rojo para las correcciones. Todo lo visual sirve a leer datos en
columna y a volcar una tanda deprisa. No hay imágenes, ni ilustraciones, ni sombras, ni
movimiento más allá de una transición de foco.

La densidad es alta a propósito: cuerpo de 13 px, espaciado en pasos de 2 a 28 px y
paneles con borde fino. La monoespaciada lleva todo lo que se compara (fechas,
respuestas, categorías, cifras); la sans del sistema lleva la interfaz y la prosa. El
color es casi solo semántico: el lado de la causa (estudio en azul, ejecución en rojo)
y el estado de cada regla (DO NOW, QUEUED, WATCH, ok).

**Key Characteristics:**
- Papel hueso con hojas algo más claras encima; profundidad solo por tono y borde.
- Monoespaciada tabular para todo dato comparable.
- Azul estudio / rojo ejecución como única codificación cromática de la causa.
- Negro de tinta para la acción primaria; sin color de marca.
- Esquinas casi rectas (3 px) y píldoras para chips y etiquetas de estado.

## Colors

Neutros cálidos de papel y tinta, con dos plumas de corrección y una escala de estados.

### Primary
- **Tinta** (`ink`): texto principal, botón primario, conmutadores activos. La acción
  principal no lleva color de marca: es tinta.

### Secondary
- **Azul de estudio** (`study-blue`, con `study-blue-wash` y `study-blue-rule`): causas
  que se arreglan estudiando (DESCONOCIMIENTO, CONFUSION, ORTOGRAFIA), sus chips y sus
  barras. También es el anillo de foco (`--accent`).

### Tertiary
- **Rojo de ejecución** (`exec-red` y derivados): causas de ejecución (DESPISTE,
  FORMATO, TIEMPO), la respuesta equivocada tachada, SEGURO en la tabla, errores de
  validación, borrado y DO NOW. Hoy carga con cuatro significados distintos.

### Neutral
- **Papel** (`paper`): fondo de página.
- **Hoja** (`sheet`): paneles, tablas, campos.
- **Hoja hundida** (`sheet-sunken`): cabeceras de tabla, hover, campos deshabilitados.
- **Filete** (`rule`) y **filete marcado** (`rule-strong`): separadores y bordes de panel.
- **Tinta suave** (`ink-soft`): texto secundario y etiquetas.
- **Tinta tenue** (`ink-faint`): notas, metadatos, navegación secundaria. No llega a
  4,5:1 sobre ningún fondo del sistema (3,0–3,5:1).

### Estados del motor de reglas
- **DO NOW** reutiliza el rojo de ejecución; **QUEUED** ocre (`queued-ochre`, también el
  aviso de demo); **WATCH** gris topo; **ok** verde (`ok-green`, también sesión OPEN y
  mensajes de éxito).

### Named Rules
**The Two Pens Rule.** Azul y rojo pertenecen a la causa: estudio y ejecución. Cualquier
otro uso compite con esa lectura.

## Typography

**Display Font:** ninguna; no hay titular de exhibición.
**Body Font:** sans del sistema (`ui-sans-serif`, `system-ui`, Segoe UI en Windows).
**Label/Mono Font:** monoespaciada del sistema (`ui-monospace`, Cascadia Mono en Windows)
con cifras tabulares.

**Character:** tipografía de herramienta, sin voz propia; la personalidad la pone el
contraste entre la sans de la interfaz y la mono de los datos.

### Hierarchy
- **Title** (600, 19 px): h1 de cada vista.
- **Section** (600, 15 px): h2 de panel.
- **Body** (400, 13 px, 1,45): texto base, celdas, campos.
- **Small** (400, 12 px): notas, pistas, tablas, navegación secundaria.
- **Label** (400, 11 px, mayúsculas, +0,04 em): etiquetas de campo, cabeceras de tabla,
  términos de listas de definición.
- **Data** (mono, 13 px, tabular): fechas, respuestas, cifras, categorías.

La escala es muy comprimida (11–19 px): entre sección y cuerpo hay 2 px, así que la
jerarquía descansa sobre todo en el peso y en los bordes de panel.

### Named Rules
**The Column Rule.** Si un valor se va a comparar en vertical, va en monoespaciada
tabular y alineado a la derecha cuando es número.

## Layout

Una columna central de hasta 1200 px con 20 px de margen, bajo una barra superior con la
navegación en dos grupos (uso diario / detalle). Las vistas se componen apilando paneles
con borde; no hay rejilla de página ni barra lateral.

El formulario de captura es una rejilla de cuatro columnas con áreas nombradas (ítem,
enunciado, mi respuesta, correcta / causa, categoría, subcategoría, confianza / regla /
marcas y guardar) que cae a una columna por debajo de 760 px. La cabecera de sesión usa
`auto-fit` con mínimo de 8,5 rem.

Puntos de ruptura usados: 600, 620 y 760 px, según el módulo. Espaciado en siete pasos
(2, 4, 6, 10, 14, 20, 28 px) sin múltiplo común.

## Elevation & Depth

Plano. No hay sombras salvo el anillo de foco (2 px de papel y 2 px de azul). La
profundidad se expresa con tres tonos (papel, hoja, hoja hundida) y bordes de 1 px;
el DO NOW del informe es el único borde de 2 px.

### Named Rules
**The Flat Sheet Rule.** Nada flota. Si algo necesita destacar, cambia de tono o de
borde, no de altura.

## Shapes

Esquinas casi rectas (3 px) en paneles, campos y botones; píldora completa (999 px) en
chips de causa, etiquetas de estado y barras de proporción. Bordes continuos de 1 px;
discontinuos para estados vacíos y la sesión cerrada.

## Components

### Buttons
- **Shape:** esquina casi recta (3 px).
- **Primary:** tinta sobre texto hoja, 6 × 20 px; hover a negro puro; deshabilitado al
  55 % de opacidad con cursor de progreso. Definido por separado en captura, sesión,
  Writing y Anki («Crear en Anki»).
- **Secondary / quiet:** hoja con filete marcado, 4 × 10 px, texto 12 px; hover a hoja
  hundida. Tres definiciones con rellenos distintos (4×10, 6×10, 6×14).
- **Danger:** rojo de ejecución con texto blanco; solo en el segundo paso de un borrado.
- **Link-button** («Actualizar en Anki»): subrayado sin caja.

### Chips
- **Causa:** píldora mono 11 px, lavado del color de su lado con filete y texto del
  mismo tono. Definido cuatro veces.
- **Estado de regla:** misma forma, con la escala de estados; DO NOW relleno sólido.
- **Estado de sesión:** OPEN en verde, CLOSED en neutro.

### Cards / Containers
- **Corner Style:** 3 px.
- **Background:** hoja sobre papel.
- **Shadow Strategy:** ninguna (ver Elevation & Depth).
- **Border:** 1 px filete marcado.
- **Internal Padding:** 14 px.

### Inputs / Fields
- **Style:** hoja, borde de filete marcado, 3 px, relleno 6 × 10 px (4 × 6 en la rejilla
  de captura, con texto de 12 px).
- **Focus:** sin contorno; anillo doble papel + azul.
- **Error / Disabled:** `aria-invalid` sin estilo propio; mensaje rojo de 12 px debajo.
  Deshabilitado en hoja hundida con tinta tenue.

### Navigation
- Enlaces de 13 px en tinta suave con relleno 4 × 10 px; hover en hoja hundida. El grupo
  secundario baja a 12 px en tinta tenue, separado por un filete vertical. No hay
  estado activo: la página actual no se marca.

### Tabla de datos
- Cabecera en etiqueta de 11 px sobre hoja hundida, celdas de 12 px con relleno 6 × 10 px,
  filete entre filas y hover de fila. Implementada tres veces (registro, informes,
  reglas) con pequeñas diferencias.

### Tarjeta de cola de Anki
- Metadatos en 11 px, enunciado en 12 px, par «mi respuesta tachada en rojo → correcta
  en negrita» en mono de 15 px, y la regla debajo; acción primaria a la derecha.

## Do's and Don'ts

### Do:
- **Do** usar monoespaciada tabular para fechas, cifras, respuestas y categorías.
- **Do** reservar azul y rojo para el lado de la causa.
- **Do** expresar profundidad con tono y filete, nunca con sombra.
- **Do** dejar las celdas sin datos vacías y diferenciadas, no a cero.

### Don't:
- **Don't** escribir colores o tamaños literales en los módulos: todo sale de `:root`
  en `src/app/globals.css`.
- **Don't** usar la tinta tenue para texto que haya que leer: no llega a AA.
- **Don't** añadir un color de marca a la acción primaria.
