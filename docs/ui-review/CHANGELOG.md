# Rediseño de la interfaz · CHANGELOG

Rama `feature/ui-redesign`, sobre `develop` (42d77a1), 23 de septiembre de 2026. Punto
de partida: [AUDIT.md](AUDIT.md). Plan: [PLAN.md](PLAN.md), bloques 1 a 8; el 9, opcional, no se
aprobó. El bloque 4 lo implementó otro agente a partir de [BLOCK-4-SPEC.md](BLOCK-4-SPEC.md).

**Dirección: refinar, no sustituir.** Se conserva la identidad («El cuaderno corregido»: papel,
tinta, monoespaciada para datos, azul estudio y rojo ejecución). Lo que cambia es el flujo
principal, que es la tanda de Macmillan, y el acabado: contraste, foco, lenguaje y primitivas. El
sistema resultante está en [DESIGN.md](../../DESIGN.md).

**Límites respetados.** No cambia ninguna lógica de AnkiConnect, modelo de datos, consulta, regla,
exportador ni Server Action. En `src/lib` solo hay 30 líneas de texto con tildes, más las dos
etiquetas de Exportar que se ven en pantalla. El contenido de las tarjetas de Anki y las cabeceras
y datos de los CSV y el JSON son idénticos a `develop`.

## Cifras

| | Antes | Después |
|---|---|---|
| Tests unitarios | 584 | **593** |
| Tests e2e (5 omitidos siempre: generan capturas) | 55 | **65** |
| `detect` estático sobre `src/app` | 1 (borde lateral) | **0** |
| `detect` en páginas: contraste bajo (1280 / 390 px) | 64 / 64 | **0 / 0** |
| `detect` en páginas: longitud de línea (1280) | 18 | 14 · ver nota |
| `detect` en páginas: texto tapado (1280 / 390) | 4 / 3 | 22 / 9 · falsos positivos verificados |
| Colores literales en módulos CSS | 20 | **0** |
| Definiciones de botón primario / secundario / chip | 4 / 4 / 4 | **1 / 1 / 1** |
| Valores internos en crudo a la vista | en todas las vistas | **0** |
| Desbordamiento horizontal a 390 px | 1540 px con un error de categoría | **0** en todas las vistas |

**Notas sobre `detect`.** Salidas completas en `detect-after.txt`, `detect-after.json` y
`detect-after-urls.txt`.
- **Texto tapado:** todo sale de la tabla de las 7 reglas, que va plegada en un `<details>`. Sus
  celdas no se pintan (`checkVisibility()` = false). Con la tabla desplegada hay 0 celdas tapadas,
  medido con `elementFromPoint` a 1280 y 390 px.
- **Otros falsos positivos:**
  - `cream-palette` es el papel hueso de la identidad;
  - `repeating-stripes-gradient` es la celda «sin datos» de RUOE;
  - `cramped-padding` es la tabla a sangre dentro de su marco;
  - `clipped-overflow-container` (390 px) es el `thead` oculto a propósito en las tarjetas
    móviles.
- **Longitud de línea:** los 14 que quedan son el aviso de la demo (8, una línea de 116
  caracteres que solo existe en `pnpm demo`) y celdas de la tabla plegada de reglas (6). Los
  dos casos reales (la introducción del panel de Macmillan y la nota de reglas en cola) se
  limitaron a 70ch en el cierre.

**Auditoría final** (evaluación propia, en una sola pasada; no es la doble evaluación inicial):

| Dimensión | Antes | Después | Qué queda |
|---|---|---|---|
| Accesibilidad | 2 | 3 | Objetivos táctiles < 44 px (AAA); las tarjetas móviles pierden la semántica de tabla |
| Rendimiento | 3 | 3 | Sin problemas; `/anki` tiene pantalla de carga |
| Responsive | 2 | 3 | Algunas tablas del Informe y de Writing se desplazan en su marco a 390 px, a propósito |
| Theming | 3 | 3 | Todo sale de tokens; no hay modo oscuro (nadie lo pidió) |
| Integridad | 2 | 4 | Una primitiva por concepto; azul y rojo solo para la causa |
| **Total** | **12 / 20** | **16 / 20** | Banda «Buena» |

## Antes y después por pantalla

Capturas de página completa sobre la demo (`pnpm demo`), a 1280 px (`-desktop`) y 390 px
(`-mobile`), en `before/` y `after/`.

### Registrar: entrada
[antes](before/01-registrar-lista-desktop.png) · [después](after/01-registrar-lista-desktop.png) ·
[sesión manual desplegada](after/01b-registrar-manual-desktop.png) ·
[móvil](after/01-registrar-lista-mobile.png)
- **Orden por uso:**
  1. las sesiones abiertas arriba, con «Continuar →», que lleva directamente a la captura;
  2. la tanda de Macmillan, con la acción primaria (antes era secundaria);
  3. «Nueva sesión a mano», plegada;
  4. el historial.
- Mientras se revisa una tanda, la página deja solo la revisión.
- Estados «Abierta» y «Cerrada» en lugar de OPEN y CLOSED; en móvil, la píldora ya no se estira.

### Registrar: tanda de Macmillan y «Pegar varios» (bloque 4)
[antes](before/03-registrar-pegar-desktop.png) · [revisión de 12 errores](after/11-revision-tanda-desktop.png) ·
[tras guardar](after/12-tanda-guardada-desktop.png) · [pegar varios](after/03-registrar-pegar-desktop.png)
- **Filas compactas:** cada error tiene un chip «Completo», «Falta: correcta, categoría, regla» o
  «Rechazado». A la vista quedan Correcta, Causa, Categoría, Confianza y Regla; el resto va
  plegado.
- **Barra fija:** «Faltan 7 de 12», «Ir al siguiente pendiente» y guardar. No se envía nada con
  filas incompletas.
- **Al guardar:** aviso «Sesión creada con 12 errores.» en la sesión, con el foco en él. No se
  repite al recargar.
- **Sin diálogo nativo:** `window.confirm` se sustituye por un segundo paso en la página.
- **Orden:** el área de pegado va antes que las instrucciones.

### Registrar: sesión y captura uno a uno
[antes](before/02b-registrar-sesion-abierta-desktop.png) · [después, tras guardar](after/02c-registrar-tras-guardar-desktop.png) ·
[validación antes](before/04b-registrar-error-zod-desktop.png) · [validación después](after/04-registrar-validacion-desktop.png) ·
[móvil](after/02-registrar-sesion-mobile.png)
- **Categoría es un desplegable** con etiquetas legibles. Se acabó el mensaje de Zod en inglés que
  ensanchaba la página a 1540 px.
- **Causa se lee entera** (antes «DESCON»). Los valores que pasan de un error al siguiente llevan
  la marca «heredada».
- **Foco:**
  - al entrar en la sesión va a Ítem;
  - tras un rechazo, al primer campo inválido;
  - al editar una fila entra en el formulario y vuelve a su botón Editar;
  - Esc cancela la edición y los borrados.
- **Pista de teclado correcta** (Ctrl+Enter en la regla). Un mensaje de error por línea y el campo
  marcado en rojo.
- «Al final de la sesión» solo aparece si la sesión está cronometrada.
- En móvil, los errores pasan a tarjetas etiquetadas; antes eran una tabla de 780 px que había que
  desplazar para llegar a Editar.

### Informe
[antes](before/05-informe-desktop.png) · [después](after/05-informe-desktop.png) ·
[móvil antes](before/05-informe-mobile.png) · [móvil después](after/05-informe-mobile.png)
- **«Qué hacer esta semana»** (antes «Que cambio esta semana»). La justificación va en palabras:
  «Errores convertidos en tarjeta de Anki: 40 % (umbral < 80 %, muestra de 27)», en vez de
  `pct_convertidos (Q5)`.
- **La acción enlaza a donde se hace** (por ejemplo, «Ir a la cola de Anki · 9 pendientes»).
- **Etiquetas:** estados de regla en español («Haz esto», «En cola», «Vigilar», «Bien», «Muestra
  corta», «Sin datos») y títulos sin códigos Q.
- «Cumplido / por debajo» pasan a la escala de estados.
- En móvil, las barras se ocultan (repiten el porcentaje) y Remedio ya no se parte palabra a
  palabra.

### Anki
[antes](before/06-anki-desktop.png) · [después](after/06-anki-desktop.png)
- **Con Anki no disponible:**
  - estado «No disponible» junto al título;
  - un solo aviso con el paso siguiente, en lugar de 10 botones grises con cursor de espera;
  - los botones siguen alcanzables por teclado y dicen por qué no funcionan.
- **Otros cambios:**
  - «—» en lugar de ceros antes de la primera sincronización;
  - la definición de fallo y lapso, plegada;
  - «Marcada a mano» se dice una vez para todo el grupo;
  - cada error de la cola enlaza a su sesión;
  - pantalla de carga mientras responde AnkiConnect;
  - «Sincronizar», que solo lee, pasa a secundario.

### RUOE
[antes](before/07-ruoe-desktop.png) · [después](after/07-ruoe-desktop.png)
- Leyenda de los tramos de color y del rayado «sin práctica esa semana».

### Falsas certezas
[antes](before/08-certezas-desktop.png) · [después](after/08-certezas-desktop.png)
- Fuera el borde lateral rojo, que era el único hallazgo del `detect` estático.
- El recuento dice «12 falsas certezas».
- Causa y categoría con su etiqueta, y cada una enlaza a su sesión.

### Writing
[antes](before/09-writing-desktop.png) · [después](after/09-writing-desktop.png)
- Sin sesiones libres, «Abrir una sesión de Writing» lleva a Registrar con Writing preseleccionado
  y te devuelve aquí.
- Género y corrector con etiqueta.
- «% repetido» en la escala de estados, y con texto cuando supera el umbral.
- Los errores del formulario quedan enlazados a su campo.

### Exportar
[antes](before/10-exportar-desktop.png) · [después](after/10-exportar-desktop.png)
- Cada fila acaba en «Descargar». Los ficheros no cambian.

### En toda la app
- **Contraste AA:** tinta tenue a 4,56–5,35:1, ocre a 5,32:1 y borde de campo a 3,3:1.
- **Foco:** contorno visible en todo, que sobrevive al alto contraste de Windows; ya no lo
  recortan los contenedores.
- **Navegación:** marca la página actual; en móvil, una sola fila.
- **Tildes** en toda la interfaz y en los mensajes del servidor.
- **Primitivas:** una sola definición de cada una en `_shared/ui.module.css`. Etiquetas en
  `_shared/labels.ts`.

## Los 10 problemas de la auditoría

| # | Problema | Estado |
|---|---|---|
| 1 | La revisión de una tanda eran N formularios completos | **Resuelto** (bloque 4) |
| 2 | Categoría en texto libre y error de Zod en inglés | **Resuelto** (bloques 3 y 6) |
| 3 | El foco se recortaba en conmutadores y filas-enlace | **Resuelto** (bloque 1) |
| 4 | Contraste por debajo de AA | **Resuelto** (bloque 1) |
| 5 | Causa cortada («DESCON») | **Resuelto** (bloque 3) |
| 6 | El foco se perdía en cinco acciones clave | **Resuelto** (bloques 3 y 4) |
| 7 | Valores internos en crudo, jerga, códigos Q, tildes | **Resuelto** (bloque 6 y commit de tildes) |
| 8 | Anki no disponible: botones grises, ceros falsos | **Resuelto** (bloque 7) |
| 9 | Jerarquía invertida en `/registrar` | **Resuelto** (bloque 5) |
| 10 | Primitivas duplicadas, rojo sobrecargado, sin página actual | **Resuelto** (bloques 2 y 8) |

## Pendiente

- **Verificación manual contra tu Anki real.** Hay que sincronizar, crear una tarjeta de prueba,
  actualizarla y deshacerla. Solo se ha probado contra el AnkiConnect simulado de los e2e (10
  tests en verde). La exportación sí está verificada: el código de exportación es idéntico a
  `develop` salvo las dos etiquetas de pantalla, y sus tests unitarios pasan.
- **Vista «Errores» para consultar y filtrar** (bloque 9): no aprobada. Hoy los errores se
  consultan sesión a sesión, con enlaces desde Anki y Falsas certezas.
- **Fuera de alcance**, porque cambian reglas de negocio (ver AUDIT.md):
  - pedir la regla al convertir en Anki y no al volcar;
  - una ventana fija para «Haz esto»;
  - semanas vacías en el eje de RUOE;
  - crear una sesión de Writing con una acción nueva.
- **Menores:**
  - objetivos táctiles de menos de 44 px (AAA);
  - el ítem no se autoincrementa;
  - los ficheros de exportación se llaman `q1…q7`;
  - las instrucciones para la IA (`IMPORT_PROMPT`) siguen sin tildes, a propósito, por ser un
    texto técnico que se copia;
  - no hay modo oscuro.
- **Test intermitente previo:** `src/lib/db/toolchain.test.ts` lanza un subproceso de Drizzle con
  un límite de 15 s que a veces no alcanza con todos los workers en paralelo. No tiene relación
  con la interfaz.
