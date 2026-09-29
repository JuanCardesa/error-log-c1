# Notebook: arquitectura y plan de incorporación

> Plan aprobado el 29 de septiembre de 2026. Implementación iniciada en `feature/notebook`.
> Rama de trabajo: **feature/notebook**, creada desde **develop**, commit **b03b745**.
> Este documento conserva las decisiones, contratos y tareas del plan acordado.
> Estado: **9 de 27 tareas de implementación completadas**.
> Próximo paso: **TASK 3.1**, crear rutas y directorio.

## Cómo continuar

- Trabajar en feature/notebook; los cambios se integrarán mediante PR a develop.
- Seguir las tareas de la sección 21, respetando sus dependencias.
- Marcar una tarea solo cuando su implementación y sus comprobaciones estén completas.
- Anotar al final de este documento los commits, comprobaciones y cambios de decisión.
- Leer AGENTS.md y las guías pertinentes de node_modules/next/dist/docs/ antes de escribir código.
- Las migraciones se prueban primero sobre bases temporales; conservar el mecanismo de copia previa.
- No incorporar funciones aplazadas como parte de una tarea del MVP.

## 1. Executive summary

Notebook será un cuaderno personal de documentos Markdown, organizado mediante carpetas de hasta dos niveles, etiquetas opcionales y una tabla de contenidos automática.

Se integrará en Next.js App Router, Server Actions, SQLite, Drizzle, Zod y CSS Modules. No necesita otro backend, otro sistema de almacenamiento ni un editor complejo.

La primera versión incluirá:

- Crear, editar, mover y borrar apuntes.
- Lectura como experiencia principal.
- Markdown con tablas, listas, citas, enlaces y checkboxes.
- Editor de texto con vista previa.
- Índice automático y enlaces a apartados.
- Búsqueda en títulos, contenido y etiquetas.
- Autosave, recuperación de borradores y detección de conflictos.
- Relaciones manuales entre errores y apuntes.
- Importación básica de .md y exportación portable.

Decisiones confirmadas: vínculos manuales desde el MVP; contenido nuevo o pegado; imágenes aplazadas; dos niveles de carpetas; editor Markdown con vista previa.

La propuesta añade tres tablas de dominio y un índice FTS5, sin modificar la semántica de sesiones, errores, Anki ni las siete reglas de estudio.

Base analizada: develop, b03b745. En la revisión previa pasaron pnpm typecheck, pnpm lint y 614 pruebas de 37 archivos. No se ejecutaron build, cobertura ni E2E en esa revisión. Estas comprobaciones son la referencia histórica, no validación de una implementación de Notebook.

## 2. Current project architecture relevant to Notebook

### Stack y organización

| Área | Situación comprobada | Consecuencia |
| --- | --- | --- |
| Framework | Next.js 16.3.5, App Router, React 19.3 | Rutas dentro de src/app; páginas servidor e interactividad localizada |
| Lenguaje | TypeScript estricto, sin any | Tipos explícitos de apuntes, búsquedas y guardado |
| Persistencia | SQLite, better-sqlite3 y Drizzle | Misma base y transacciones |
| Validación | Zod y restricciones SQL | Validar acciones y proteger integridad |
| Escrituras | Server Actions | Sin API REST paralela |
| Lecturas | Server Components, repositorios y acciones de búsqueda | No descargar el cuaderno entero |
| Interfaz | CSS Modules, tokens propios y Lucide | Reutilizar el sistema visual |
| Estado | React local, contextos concretos y URL | Sin Redux, Zustand ni caché global nueva |
| Tests | Vitest y Playwright | Ampliar las suites existentes |
| Ejecución | Local, monousuario, 127.0.0.1 | Mantener ese perímetro |

El entorno de la revisión tenía Node 23.7.0. El repositorio y CI fijan Node 22 mediante .nvmrc; la entrega se debe validar también con esa versión.

Las guías del Next instalado confirman que params y searchParams son promesas, las Server Actions del cliente se despachan secuencialmente y el límite predeterminado de petición es 1 MB.

### Modelo real

Según [schema.ts](../src/lib/db/schema.ts):

- session representa la práctica y aporta los denominadores estadísticos.
- error_row pertenece a una sesión; borrar una sesión elimina sus errores.
- writing_piece guarda metadatos y bandas de Writing; admite una pieza por sesión y relaciones de reescritura.
- Las tablas anki_* contienen el espejo y la integración con Anki.
- session_import_receipt evita repetir determinadas importaciones.

Las categorías son un enum cerrado de 14 valores. subcategory y ruleNote son texto: no existen entidades persistentes Subcategory o Rule. Las reglas de src/lib/rules son reglas de decisión del informe, no reglas gramaticales.

Notebook no debe convertir estos conceptos en una taxonomía nueva por asociación implícita.

### Datos, búsqueda y recuperación

[repo.ts](../src/lib/db/repo.ts) ya proporciona CRUD, búsquedas paginadas, consultas de impacto de borrado, sugerencias y transacciones de importación.

La búsqueda combina subcadenas con FTS5 de trigramas: desde tres caracteres reduce candidatos mediante el índice; las consultas cortas recorren directamente los datos.

loadDataset() carga sesiones, errores y Writing para consultas puras. No debe ampliarse para cargar apuntes en todos los informes.

Los backups usan la API de SQLite e incluyen el WAL confirmado. El migrador dispone de copia previa, transacción y comprobación de integridad.

### Interfaz y despliegue

[DESIGN.md](../DESIGN.md) define Source Serif 4 para lectura, IBM Plex Sans y Mono para controles y datos, fondo de papel, superficies blancas para editar y navegación por teclado. Ya existe --reading-max.

No hay autenticación, despliegue remoto configurado, adjuntos, editor Markdown ni PWA. La integración externa relevante es AnkiConnect.

## 3. What Notebook should be

Notebook será una colección de documentos Markdown con organización ligera y relaciones explícitas con los errores.

| Alternativa | Evaluación |
| --- | --- |
| Archivos Markdown directamente en disco | Portables, pero complican relaciones con SQLite, autosave y atomicidad |
| Solo tags | Flexibles, pero orientan poco al estudiar |
| Categorías de errores | Clasificación demasiado específica y cerrada |
| Documentos dentro de documentos | Mezclan contenido y navegación; complican movimientos y borrados |
| Wiki completa | Añade resolución de títulos, aliases y ambigüedad prematuramente |
| Carpetas + documentos + tags opcionales | Elección recomendada y acordada |

La unidad de conocimiento es el apunte. Sus apartados son encabezados Markdown, no registros independientes. Un tema completo, como Past modal verbs, puede contener must have, might have y can't have en un solo documento.

## 4. Information architecture

~~~text
Notebook
├── Grammar                       carpeta
│   ├── Modal verbs               subcarpeta opcional
│   │   ├── Present deduction     apunte
│   │   └── Past deduction        apunte
│   └── Inversion                 apunte
├── Vocabulary
│   └── Collocations              apunte
└── Sin carpeta                   agrupación virtual
~~~

Los nombres son ejemplos, no carpetas que deban crearse automáticamente.

| Elemento | Regla |
| --- | --- |
| Título | Obligatorio |
| Contenido | Markdown; puede estar vacío al crear |
| Carpeta y tags | Opcionales |
| Subcarpetas | Un nivel bajo una raíz |
| Apuntes hijos | No |
| Categoría de Error Log | No obligatoria ni copiada automáticamente |

NotebookFolder.parentId representa la jerarquía; el apunte solo tiene folderId.

Operaciones: crear y renombrar carpetas; mover apuntes; mover carpetas sin subcarpetas entre raíz y segundo nivel; rechazar ciclos y tercer nivel; borrar solo carpetas vacías; confirmar el borrado de apuntes.

No habrá drag-and-drop ni orden manual. Carpetas por nombre; apuntes de carpeta por título e ID; portada por modificación reciente. Tags como part4, past-modals y formal-writing permiten cruces sin duplicar documentos.

## 5. UX proposal

### Entrada

Añadir Notebook a Más y a la paleta global, conservando la cabecera de cuatro destinos y su comportamiento móvil.

La portada tendrá buscador, carpetas, modificados recientemente, Nuevo apunte, importación/exportación y aviso de borradores locales pendientes.

### Lector

| Pantalla | Disposición |
| --- | --- |
| Desde 1280 px | Directorio izquierdo, lectura central e índice derecho |
| 1024–1279 px | Directorio y lectura; índice desplegable |
| Menos de 1024 px | Una columna; directorio mediante panel y TOC desplegable |
| Móvil | Controles táctiles y tablas con scroll interno |

Breadcrumbs, título, tags, modificación, Editar, Copiar enlace y menú secundario. Lectura en Source Serif 4, alrededor de 18 px, limitada por --reading-max; controles Plex. Scroll principal de página.

Directorio mediante listas anidadas y expansión accesible; no construir un widget ARIA de árbol complejo.

### Editor

Ruta propia con título, carpeta, tags, textarea, toolbar básica (encabezado, negrita, cursiva, lista, cita, enlace), pestañas Editar/Vista previa, estado persistente de guardado, Guardar ahora, Ctrl/⌘+S y Volver a lectura.

Preview y lector comparten renderizador.

### Flujos

1. Crear: Nuevo apunte → título y metadatos opcionales → creación confirmada → editor → autosave → lector.
2. Consultar: Notebook o paleta → carpeta/búsqueda → lector → índice o apartado encontrado.
3. Relacionar: detalle del error → Relacionar apunte → buscar documento → seleccionar documento o apartado inequívoco → guardar → Ver apunte.

| Función | Clasificación |
| --- | --- |
| Lectura, TOC, búsqueda, breadcrumbs, última modificación, errores relacionados | MVP |
| Concentración, anterior/siguiente, vistos recientemente, favoritos | Useful later |
| Favoritos y fijados como dos sistemas distintos | Not worth implementing inicialmente |
| Pantalla completa mediante API del navegador | Not worth implementing inicialmente |

## 6. Markdown strategy

### Formato y dependencias

Guardar el Markdown original en TEXT; metadatos en columnas independientes.

- react-markdown: renderizado React.
- remark-gfm: tablas, tareas y extensiones GFM.
- unified y remark-parse: análisis reutilizable.
- github-slugger: identificadores de encabezados.

Un módulo compartido analizará encabezados, texto de búsqueda y enlaces. Análisis y renderizado usarán las mismas reglas y generador de anchors. No interpretar Markdown con expresiones regulares.

Fuentes: [react-markdown](https://github.com/remarkjs/react-markdown), [remark-gfm](https://github.com/remarkjs/remark-gfm), [github-slugger](https://github.com/Flet/github-slugger).

### Soporte MVP

H1–H6, párrafos, énfasis, listas, citas, tablas con scroll interno, código inline y bloques sin resaltado de lenguajes, checkboxes deshabilitados en lectura, enlaces y anchors.

Callouts mediante citas estándar, por ejemplo > **Regla:**. No renderizar HTML. Conservar sintaxis de imágenes sin cargar recursos. LaTeX aplazado.

### Tabla de contenidos

- Extraer encabezados del AST, incluidos sus textos con formato inline.
- Ignorar aparentes encabezados dentro de código.
- Conservar orden y profundidad; ante saltos de nivel, usar el precedente de menor profundidad.
- IDs con prefijo nb-, sufijos de github-slugger para duplicados y fallback determinista para slugs vacíos.
- Enlaces reales, scroll-margin-top para la cabecera e IntersectionObserver para el apartado activo.
- Respetar prefers-reduced-motion.
- Probar hash inicial y navegación atrás/adelante.
- Si el primer H1 reproduce exactamente el título, evitar duplicarlo visualmente conservando su anchor y el Markdown original.

~~~text
## Past deduction → #nb-past-deduction
### Must have     → #nb-must-have
### Must have     → #nb-must-have-1
~~~

### Editor elegido y alternativas

| Alternativa | Decisión |
| --- | --- |
| Textarea + preview propio | MVP: diseño coherente, entrada nativa, pocas dependencias |
| CodeMirror 6 | Evolución si se necesita edición avanzada |
| @uiw/react-md-editor | Válido, pero añade interfaz/configuración que el proyecto puede cubrir |
| Tiptap | Fuera de alcance; conversión entre modelo propio y Markdown |
| Monaco | Desproporcionado |

No fijar cifras de bundle sin medir. Cargar editor y preview solo al editar. Referencias: [CodeMirror](https://codemirror.net/), [UIW](https://github.com/uiwjs/react-md-editor), [Tiptap](https://tiptap.dev/docs/editor/markdown); la documentación consultada de Tiptap identificaba Markdown como beta.

## 7. Data model

Tipos de dominio separados de Drizzle.

### notebook_folder

| Campo | SQLite | Condición |
| --- | --- | --- |
| id | INTEGER | PK AUTOINCREMENT |
| parentId | INTEGER NULL | FK propia, ON DELETE RESTRICT |
| name | TEXT | 1–80 caracteres |
| nameKey | TEXT | Nombre normalizado |
| createdAt | TEXT | Timestamp ISO UTC |
| updatedAt | TEXT | Timestamp ISO UTC |

Índice parentId; unicidad de nameKey en raíces y de (parentId, nameKey) en subcarpetas. CHECK parentId != id. Validación transaccional y triggers impiden tercer nivel. Una carpeta con subcarpetas no puede pasar a segundo nivel. nameKey se calcula en servidor con normalización Unicode, trim y minúsculas.

### notebook_note

| Campo | SQLite | Condición |
| --- | --- | --- |
| id | INTEGER | PK AUTOINCREMENT |
| uid | TEXT | UUID único e inmutable |
| folderId | INTEGER NULL | FK a carpeta, ON DELETE RESTRICT |
| title | TEXT | 1–160 caracteres |
| contentMarkdown | TEXT | Obligatorio, admite vacío |
| tags | TEXT JSON | Array de strings, default [] |
| revision | INTEGER | Desde 1; concurrencia |
| createdAt | TEXT | Timestamp ISO UTC |
| updatedAt | TEXT | Timestamp ISO UTC |

Índices UNIQUE(uid), (folderId, title, id), (updatedAt, id).

Límites: revision >= 1; contenido máximo 256 KiB UTF-8; 12 tags de 40 caracteres como máximo; tags normalizados, sin vacíos ni duplicados. SQLite protege JSON válido de tipo array y límites estructurales; Zod valida elementos. Rechazar NUL y controles incompatibles con texto, conservando tabulaciones y saltos de línea.

UID identifica borradores, reconcilia altas inciertas y conserva identidad en exportaciones. ID entero mantiene coherencia con el resto del repositorio.

No almacenar slug: se deriva del título y la identidad depende del ID.

### notebook_error_link

| Campo | SQLite | Condición |
| --- | --- | --- |
| errorId | INTEGER | FK error_row, ON DELETE CASCADE |
| noteId | INTEGER | FK notebook_note, ON DELETE CASCADE |
| headingSlug | TEXT NULL | Apartado opcional |
| headingText | TEXT NULL | Texto del encabezado al vincular |
| createdAt | TEXT | Timestamp ISO UTC |

PK(errorId, noteId), índice(noteId, errorId). headingSlug y headingText presentes o ausentes conjuntamente. Un error admite varios apuntes; cada par error–apunte tiene como máximo un apartado.

Borrar error elimina vínculos, no apuntes. Borrar apunte elimina vínculos, no errores.

### Índice derivado

notebook_note_fts: rowid = notebook_note.id; columnas title, body, tags; tokenizer trigram. Reconstruible, no fuente de verdad.

No crear entidades Notebook, NotebookTag, NotebookNoteTag, NoteSection, Rule o NotebookLink.

## 8. Routing and URLs

~~~text
/notebook
/notebook/nuevo
/notebook/importar
/notebook/42-past-modal-verbs
/notebook/42-past-modal-verbs/editar
/notebook/42-past-modal-verbs#nb-must-have
~~~

Ruta dinámica [noteKey]. Extraer ID entero positivo y resolver por él. El sufijo es descriptivo: renombrar cambia enlaces generados, pero las URLs antiguas siguen funcionando sin tabla de aliases ni redirección obligatoria. Mover carpetas no afecta. Títulos repetidos no colisionan.

Enlaces internos Markdown convencionales, por ejemplo [Conditionals](/notebook/57-conditionals). Ofrecer copiar/insertar enlaces generados. No implementar wikilinks.

Renombrar documentos no rompe identidad. Renombrar encabezados puede cambiar anchors; no prometer estabilidad permanente de secciones sin IDs persistentes.

## 9. Search architecture

FTS5 de trigramas, dentro de SQLite. [Referencia](https://www.sqlite.org/fts5.html#the_trigram_tokenizer).

Al guardar: analizar Markdown → extraer texto visible sin sintaxis → normalizar Unicode, caja, espacios y apóstrofos → actualizar documento e índice en la misma transacción.

Buscar must have debe encontrar must **have**.

Contrato:

- Consulta máxima 200 caracteres; frase normalizada como subcadena.
- FTS desde tres caracteres; recorrido directo del índice normalizado para uno o dos.
- Parámetros SQL y escape de comillas FTS.
- Prioridad: título exacto, título parcial, tags, contenido; desempate por modificación e ID.
- Páginas de 20 y una fila adicional para hasMore.
- Filtros por carpeta y tag; una raíz incluye sus subcarpetas al buscar.
- No alterar la semántica de búsqueda de sesiones/errores.

Resultados con breadcrumb, snippet y apartado. Analizar solo documentos de la página de resultados y elegir el encabezado precedente al primer match. Sin tabla de secciones ni parseado global. Resaltado mediante nodos React, nunca HTML del índice.

Ampliar PaletteResults con notes; máximo tres apuntes en la paleta, reutilizando debounce y descarte de respuestas antiguas.

Escala:

- 50: consultas locales sencillas.
- 500: paginar y cargar cuerpos solo al abrir o mostrar resultados.
- 5.000: mantener el modelo; no árbol de todos los documentos, exportación global en memoria ni parseado global.

Medir búsqueda, render y exportación en fixtures de 50, 500 y 5.000 documentos. Objetivo inicial de búsqueda indexada: menos de 200 ms en equipo local con tamaños representativos; no test temporal rígido de CI ni promesa universal.

## 10. Error Log integration

Error → vínculo explícito → Apunte → apartado opcional.

Una relación N:M evita limitar cada error a un documento. No introducir NoteSection ni asumir relevancia a través de Category.

Añadir ErrorNotebookLinks dentro de ErrorDetailPanel, alcanzando Sesiones, Errores y Falsas certezas. Cargar vínculos al abrir el error; selector con búsqueda de documentos y encabezados.

- Revalidar error, documento y encabezado en servidor.
- Permitir solo apartados inequívocos.
- Si el encabezado cambia, desaparece o se vuelve ambiguo, conservar vínculo al documento.
- Mostrar Apartado cambiado y permitir elegir otro.
- No eliminar relaciones al editar Markdown.

El lector tendrá errores relacionados paginados, CorrectionPair y enlaces al explorador.

ruleNote sigue siendo obligatorio. Vincular no cambia causa, categoría, Anki, denominadores ni recomendaciones. Se permite vincular desde sesiones cerradas: no añade errores de práctica.

## 11. Security considerations

### Renderizado

skipHtml activo; sin MDX, rehype-raw, ejecución de código ni dangerouslySetInnerHTML. Lista explícita de elementos; componentes sin propagar atributos arbitrarios. Checkboxes deshabilitados. IDs propios con prefijo.

Plugins cerrados y comprobados. [Seguridad de react-markdown](https://github.com/remarkjs/react-markdown#security).

No añadir DOMPurify sin un paso de inyección HTML. Si se habilita HTML en el futuro, revisar el pipeline y sanitizar antes de activarlo.

### URLs y contenido externo

Admitir anchors, rutas internas y https/http/mailto. Rechazar protocolos activos, data:, file:, rutas de red y relativas que escapen del origen. Enlaces inválidos como texto. Externos con noopener noreferrer.

Sin previews remotas, descargas automáticas ni peticiones de imágenes. Mostrar texto alternativo o aviso y conservar la sintaxis original.

### Acciones

Validar todo en servidor y comprobar relaciones dentro de la operación. No confiar en revisiones, IDs ni metadatos del navegador. Mantener loopback y protección de origen de Server Actions. Un ID de acción no es autorización. Añadir TODO(auth) como en el proyecto sin construir usuarios ficticios.

### Adjuntos futuros

Cuando se necesiten: archivos gestionados, IDs propios, límites, referencias por AST y backup conjunto. Entonces diseñar huérfanos. No crear ahora almacenamiento ni tablas vacías.

## 12. Import / Export

### Frontmatter

No almacenarlo dentro de contentMarkdown. Generarlo al exportar:

~~~yaml
---
title: Past modal verbs
tags:
  - past-modals
  - part4
notebook_uid: "..."
created_at: "..."
updated_at: "..."
---
~~~

Carpetas representadas por ZIP y manifiesto; cuerpo Markdown estándar.

### Importación

Un .md por operación, con preview. Comprobar extensión, tamaño y UTF-8; frontmatter opcional; título propuesto desde metadata, primer H1 o archivo; tags; carpeta elegida; avisos de HTML, imágenes y destinos no resolubles; confirmación de nuevo apunte.

No sobrescribir por título o UID importado. Usar yaml, sin tags personalizados y rechazando aliases; frontmatter máximo 8 KiB. Mostrar campos desconocidos antes de descartarlos; nunca eliminar silenciosamente YAML inválido. Conservar enlaces relativos sin fingir que sus destinos fueron importados. [YAML](https://eemeli.org/yaml/).

### Exportación

Descarga individual .md, cuaderno ZIP y Notebook dentro del dump JSON. Backup SQLite para recuperación íntegra.

~~~text
Notebook/
  grammar--1/
    modal-verbs--3/
      42-past-modal-verbs.md
  manifest.json
~~~

Nombres seguros para Windows y colisiones resueltas con IDs. Manifiesto versionado con identidades, rutas, carpetas, metadata y vínculos con errores/apartados.

Reescribir enlaces internos a rutas relativas y fragments a la convención GitHub. Markdown no estandariza anchors universales: no garantizar idéntico comportamiento en todos los visores.

Usar yazl en servidor para ZIP en stream. [Referencia](https://github.com/thejoshwolfe/yazl).

Exportar desde snapshot temporal SQLite mediante backup existente, leer progresivamente y limpiar el temporal al finalizar/cancelar.

JSON conserva exportedAt, rows y anki, y añade formatVersion: 2 y notebook. Escribir progresivamente las colecciones Notebook.

Importar un .md no restaura vínculos con errores de otra base. No emparejar IDs locales entre bases distintas. Restauración completa mediante backup SQLite.

## 13. Architecture diagram

~~~mermaid
flowchart TD
    H[AppHeader y CommandPalette] --> P[Notebook: páginas servidor]
    P --> R[NotebookReader]
    P --> E[NotebookEditor: cliente]
    P --> N[Directorio y búsqueda]
    R --> M[MarkdownRenderer]
    R --> T[TableOfContents]
    R --> RE[Errores relacionados]
    E --> MD[Textarea y preview]
    E --> AS[Autosave y borrador local]
    MD --> M
    EP[ErrorDetailPanel existente] --> EL[ErrorNotebookLinks]
    N --> A[Server Actions y consultas]
    AS --> A
    EL --> A
    P --> Q[Repositorios Notebook]
    A --> Q
    Q --> DB[(SQLite: carpetas, apuntes y vínculos)]
    Q --> FTS[(Índice FTS5)]
    CORE[Análisis Markdown y validación puros] --> M
    CORE --> Q
    DB --> EX[Exportación y backups existentes]
~~~

- src/lib/notebook/: tipos, schemas, Markdown, URLs y lógica pura.
- src/lib/db/notebook*.ts: SQL, transacciones y archivos.
- src/app/notebook/: rutas, acciones y componentes.
- Reutilizar componentes compartidos existentes.

Lector servidor; pequeñas islas cliente para TOC activo y controles; preview cargado con el editor.

## 14. MVP

### NEEDED NOW

CRUD, carpetas de dos niveles, tags opcionales, navegación/búsqueda paginadas, Markdown seguro, TOC, editor/preview, autosave/recuperación/conflictos, vínculos manuales, importación individual, exportaciones y backups/migraciones actualizados.

### Autosave

1. Estado controlado React.
2. Borrador local con debounce 250 ms y vaciado al ocultar/abandonar.
3. Guardado servidor tras 1 segundo sin cambios.
4. Una escritura en vuelo; cambios posteriores quedan pendientes.
5. Guardar ahora y Ctrl/⌘+S fuerzan envío.
6. Guardado solo después de confirmación servidor.

Borrador por UID y pestaña: formato versionado, revisión base y contenido pendiente. Avisar de cuota agotada; mantener edición en memoria y permitir descargar borrador.

### Conflictos y fallos

Guardar con expectedRevision y comprobar ID, UID y revisión. Si coincide, actualizar e incrementar; si no, conflicto conservando local. Si se borró, detener autosave sin recrear.

Respuesta perdida: consultar versión actual antes de reintentar. Si coincide con el snapshot enviado, confirmar ese envío. Nunca sustituir escritura posterior por una respuesta antigua.

Conflicto: cargar versión guardada o conservar trabajo como nuevo apunte. Sin merge automático ni sobrescritura silenciosa.

Altas con UID conservado. Ante incertidumbre comprobar UID; no recrear automáticamente si no se distingue de un borrado.

### Navegación y caché

Autosave sin revalidatePath global. Páginas dinámicas; devolver confirmación sin refrescar ruta entera. Al terminar, acción de finalización invalida lector/listado antes de navegar.

Navegación general conserva borrador y ofrece recuperación al regresar. beforeunload con cambios sin confirmar, sin depender de él para escribir en servidor.

Criterio de utilidad: escribir una explicación, recuperarla tras interrupción, buscar must have, llegar al apartado desde un error y exportar Markdown utilizable fuera.

## 15. Future capabilities

| Capacidad | Preparación actual | Añadir después |
| --- | --- | --- |
| Backlinks | Enlaces analizables por AST | Índice derivado |
| Sugerencias | Relaciones explícitas | Recurrencia y presentación contextual |
| Borradores desde errores | ruleNote, ejemplos y vínculos | Generador puro de Markdown revisable |
| Asociación por categoría | Enum separado | Tabla puente si hace falta |
| Study Mode | IDs y consultas | Preguntas, ejercicios o tarjetas |
| Versiones | Identidad y revisión | Snapshots con retención limitada |
| Favoritos | ID estable | Preferencia persistente |
| Offline | Documentos y rutas independientes | Caché/service worker |
| Editor avanzado | Markdown string | Sustituir textarea por CodeMirror |
| Imágenes | Referencias Markdown | Almacenamiento y backups conjuntos |

Primera generación asistida determinista: seleccionar errores → construir borrador → revisar → crear/añadir → conservar procedencia. No necesita IA ni debe modificar apuntes sin revisión.

revision es concurrencia, no historial. Si se añaden versiones, usar hitos/intervalos, no cada pulsación.

Uso local sin Internet con servidor encendido no equivale a PWA sin servidor. Borradores no son sincronización offline.

## 16. What NOT to build yet

DO NOT BUILD YET:

- Embeddings, semántica, bases vectoriales e IA permanente.
- CRDT, colaboración, usuarios, permisos por documento y espacios compartidos.
- Plugins, bloques propietarios, wikilinks y aliases por título.
- Identidad persistente de secciones, historial completo y event sourcing.
- Adjuntos, almacenamiento remoto e importación ZIP.
- OCR y conversión PDF/Word.
- Sincronización de carpetas, grafos de conocimiento y taxonomías genéricas.
- Reescritura de informes actuales.

PREPARE ARCHITECTURE FOR LATER significa mantener Markdown, IDs, revisiones, relaciones y módulos adecuados; no crear tablas/servicios sin uso.

## 17. Files/components affected

### Reutilización

| Pieza | Uso |
| --- | --- |
| AppHeader, Menu, CommandPalette | Entrada y búsqueda |
| ui.module.css, overlay.module.css y tokens | Controles y estados |
| Drawer | Carpetas y selección de destinos |
| ConfirmDialog | Borrados y descartes explícitos |
| Toast, Kbd y atajos | Confirmaciones y teclado |
| CorrectionPair, formatos y etiquetas | Errores relacionados |
| collectIssues, isValidId | Validación |
| getDb, transacciones, getError | Persistencia |
| Backup y migrador | Recuperación |
| Patrón tandaDraft | Recuperación local versionada |

No reutilizar CategoryCombobox para tags ni usePreservedForm para el cuerpo controlado del editor. Adaptar LiveSearch haciendo explícitos parámetros reiniciados y sincronización URL.

### Archivos existentes

- src/lib/db/schema.ts, backup.ts y seedSafe.ts.
- src/lib/export/dump.ts.
- src/app/exportar/page.tsx y [file]/route.ts.
- src/app/_shared/AppHeader.tsx, CommandPalette.tsx y searchActions.ts.
- src/app/_shared/errors/ErrorDetailPanel.tsx.
- src/app/_shared/LiveSearch.tsx.
- src/app/globals.css si hacen falta tokens.
- package.json, pnpm-lock.yaml, documentación y pruebas afectadas.

### Nuevos

- src/lib/notebook/: tipos, schemas, Markdown, anchors, URLs, búsqueda, import/export.
- src/lib/db/notebookRepo.ts, notebookSearch.ts y notebookExport.ts.
- src/app/notebook/: rutas, acciones, lector, editor, TOC, directorio y vínculos.
- Migraciones y tests.

No modificar Dataset, Q1–Q7 ni el motor de reglas para este MVP.

## 18. Database/API changes

Lecturas servidor directamente a repositorio; operaciones interactivas mediante Server Actions. Sin CRUD REST duplicado.

| Acción | Entrada | Resultado |
| --- | --- | --- |
| createNoteAction | uid, título, carpeta, tags, Markdown | Creado o existente por UID |
| saveNoteAction | id, uid, expectedRevision, título, carpeta, tags, Markdown | Revisión y metadata confirmadas |
| getNoteAction | ID y UID esperado cuando corresponda | Documento actual o inexistente |
| deleteNoteAction | ID, UID, revisión | Borrado o conflicto |
| finishEditingAction | ID | Invalidación lector/listado |
| createFolderAction | Nombre, padre opcional | Carpeta |
| updateFolderAction | ID, nombre, padre | Carpeta actualizada |
| deleteFolderAction | ID | Borrado o no vacía |
| searchNotesAction | Consulta, carpeta, tag, página | Resultados y hasMore |
| getNoteOutlineAction | ID | Encabezados y revisión |
| getErrorNoteLinksAction | Error ID | Vínculos y estado de apartados |
| setErrorNoteLinkAction | Error, apunte, anchor opcional | Relación validada |
| removeErrorNoteLinkAction | Error, apunte | Desvinculación |
| previewMarkdownImportAction | FormData con archivo | Borrador y avisos |
| importMarkdownAction | Archivo y metadata confirmadas | Nuevo apunte |

Reanalizar archivo en servidor al confirmar; no confiar en preview cliente.

Respuesta éxito: ok: true y data. Fallo: ok: false, code, message, fieldErrors y current cuando proceda. Códigos: VALIDATION, NOT_FOUND, CONFLICT, INVALID_PARENT, FOLDER_NOT_EMPTY, PERSISTENCE. Tipos y constantes fuera de módulos use server.

Descargas: GET /exportar/notebook.zip, GET /exportar/notebook-42.md y GET /exportar/dump.json.

### Migraciones

1. 0008_notebook_core: tablas, índices, restricciones, jerarquía.
2. 0009_notebook_search: FTS5 y eliminación de entradas al borrar documentos.
3. Revisar snapshots y journal Drizzle.

Contenido e índice en la misma transacción. Analizar Markdown antes de adquirir escritura y comprobar revisión dentro. Añadir herramienta de reconstrucción del índice.

Migraciones aditivas sin reconstruir error_row. Conservar IDs, estadísticas, Anki y secuencias. Sin apuntes/carpetas iniciales en base personal; ejemplos solo seed/demo. Actualizar validación actual de backup conservando restauración antigua. Rollback mediante copia previa y aplicación anterior, no borrando tablas.

## 19. Testing strategy

### Unit tests — Vitest

Validaciones y límites; URLs repetidas/Unicode; H1–H6, duplicados, vacíos y código; anchors idénticos en lector/preview/análisis; texto buscable con formato; URLs e imágenes; frontmatter válido/inválido/excesivo; enlaces exportados; autosave con reloj simulado.

### Integration — SQLite temporal real

Migraciones actuales/antiguas; profundidad y movimientos; relaciones/cascadas; una sola escritura ganadora por revisión; atomicidad índice/contenido y rollback; FTS tras CRUD; consultas cortas, comillas, %, _, acentos y apóstrofos; backup WAL; seed con solo Notebook; exportaciones consistentes y temporales limpiados al cancelar.

### Frontend — Playwright

Preview equivalente al lector; foco/teclado; TOC y scroll; hash inicial; móvil y tablas; externos sin cargas de imágenes; selector de vínculos; estados de guardado/conflicto. No añadir jsdom o Testing Library solo para esta función.

### E2E

1. Crear carpeta/apunte.
2. Escribir, autosave y recargar.
3. Recuperar borrador interrumpido.
4. Fallos antes/después de commit.
5. Dos pestañas sin pérdida.
6. Buscar frase y llegar al apartado.
7. Relacionar error, renombrar y mover apunte.
8. Cambiar heading y degradar a documento.
9. Borrar error, sesión y apunte verificando consecuencias.
10. Importar .md, exportar ZIP y verificar contenido, metadata y enlaces.

Mantener 90 % de cobertura en src/lib y regresiones de Anki, informes y captura.

## 20. Implementation phases

| Fase | Entregable | Estado |
| --- | --- | --- |
| 1. Contrato y núcleo | Tipos, validación, Markdown y enlaces | Completada |
| 2. Persistencia | Migraciones, repositorios, concurrencia y FTS | Completada |
| 3. Consulta | Navegación, lector, TOC y búsqueda | Pendiente |
| 4. Edición fiable | Editor, preview, autosave y recuperación | Pendiente |
| 5. Integración | Vínculos con errores | Pendiente |
| 6. Portabilidad | Importación, exportaciones y recuperación | Pendiente |
| 7. Entrega | E2E, rendimiento, demo y documentación | Pendiente |

Rama feature/notebook desde develop. Commits por unidad verificable. PR a develop conforme a CONTRIBUTING.md.

## 21. Detailed ordered task list

Los archivos nuevos indicados son destinos propuestos, no archivos ya creados. Marcar cada casilla después de implementar y verificar.

### PHASE 1 — Contrato y núcleo

- [x] **TASK 1.1 — Incorporar el contrato Notebook.**
  Registrar alcance, límites, enlaces y decisiones.
  **Files affected:** docs/SPEC.md, PRODUCT.md, DESIGN.md.
  **Dependencies:** ninguna. **Tests:** coherencia con invariantes actuales.
  **Difficulty:** LOW. **Risk:** LOW.

- [x] **TASK 1.2 — Crear tipos y validación.**
  Definir inputs, resultados, límites y normalización.
  **Files affected:** src/lib/notebook/types.ts, schemas.ts y tests.
  **Dependencies:** 1.1. **Tests:** límites, UUID, tags, tamaños y revisiones.
  **Difficulty:** LOW. **Risk:** MEDIUM.

- [x] **TASK 1.3 — Preparar análisis Markdown y anchors.**
  AST, encabezados, texto buscable, URLs y dependencias Markdown.
  **Files affected:** markdown.ts, urls.ts, package.json, lockfile.
  **Dependencies:** 1.2. **Tests:** H1–H6, duplicados, Unicode, código y anchors.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

### PHASE 2 — Persistencia y búsqueda

- [x] **TASK 2.1 — Añadir tablas y migración de dominio.**
  Tres tablas, índices y protección de jerarquía.
  **Files affected:** schema.ts, migración 0008 y metadata Drizzle.
  **Dependencies:** 1.2. **Tests:** migración, unicidad, FK, niveles y cascadas.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

- [x] **TASK 2.2 — Implementar operaciones de carpetas.**
  Crear, renombrar, mover y borrar solo vacías.
  **Files affected:** notebookRepo.ts y tests.
  **Dependencies:** 2.1. **Tests:** movimientos, ciclos, tercer nivel y nombres.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

- [x] **TASK 2.3 — Persistir apuntes y revisión.**
  Creación UID, lectura, guardado condicional, listado y borrado.
  **Files affected:** notebookRepo.ts y tests.
  **Dependencies:** 2.1. **Tests:** altas repetidas, revisión obsoleta, UID incorrecto, borrado.
  **Difficulty:** MEDIUM. **Risk:** HIGH: riesgo de sobrescribir trabajo de otra pestaña.

- [x] **TASK 2.4 — Crear y mantener FTS5.**
  Índice transaccional y reconstrucción.
  **Files affected:** migración 0009, notebookSearch.ts y utilidad .run.ts.
  **Dependencies:** 1.3, 2.3. **Tests:** sincronización, rollback, borrado y reconstrucción.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

- [x] **TASK 2.5 — Proteger seed y backups.**
  Reconocer Notebook sin invalidar copias antiguas.
  **Files affected:** seedSafe.ts, backup.ts y tests.
  **Dependencies:** 2.1, 2.4. **Tests:** solo apuntes, WAL y restauración antigua/nueva.
  **Difficulty:** MEDIUM. **Risk:** HIGH: evitar mezclar ejemplos o impedir recuperación.

- [x] **TASK 2.6 — Exponer Server Actions tipadas.**
  Validación, errores y contratos.
  **Files affected:** src/app/notebook/actions.ts, tipos y tests.
  **Dependencies:** 2.2–2.4. **Tests:** entradas manipuladas, borrados y conflictos.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

### PHASE 3 — Lectura y navegación

- [ ] **TASK 3.1 — Crear rutas y directorio.**
  Portada, rutas ID, carpetas y estados vacíos.
  **Files affected:** src/app/notebook y AppHeader.tsx.
  **Dependencies:** 2.6. **Tests:** acceso directo, ID inexistente, renombrado y movimiento.
  **Difficulty:** MEDIUM. **Risk:** LOW.

- [ ] **TASK 3.2 — Implementar renderizador seguro.**
  Elementos/URLs permitidos, estilos e imágenes.
  **Files affected:** MarkdownRenderer.tsx, CSS y política de enlaces.
  **Dependencies:** 1.3, 3.1. **Tests:** XSS, protocolos, HTML, tablas, tareas y red.
  **Difficulty:** MEDIUM. **Risk:** HIGH: contenido importado no confiable.

- [ ] **TASK 3.3 — Implementar TOC y navegación interna.**
  Índice responsive, activo y hashes.
  **Files affected:** TableOfContents.tsx, lector y CSS.
  **Dependencies:** 3.2. **Tests:** hash inicial, teclado, duplicados y movimiento reducido.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

- [ ] **TASK 3.4 — Añadir búsqueda Notebook.**
  Filtros, paginación, snippets y apartados.
  **Files affected:** notebookSearch.ts, componentes de búsqueda, LiveSearch.tsx.
  **Dependencies:** 2.4, 3.3. **Tests:** título, cuerpo, tags, consultas cortas y filtros.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

- [ ] **TASK 3.5 — Integrar paleta global.**
  Resultados/acciones Notebook conservando errores y sesiones.
  **Files affected:** searchActions.ts, CommandPalette.tsx y textos.
  **Dependencies:** 3.4. **Tests:** navegación, límites y respuestas antiguas.
  **Difficulty:** LOW. **Risk:** LOW.

### PHASE 4 — Edición fiable

- [ ] **TASK 4.1 — Crear editor y preview.**
  Campos, toolbar y pestañas.
  **Files affected:** /editar, NotebookEditor.tsx y auxiliares.
  **Dependencies:** 2.6, 3.2. **Tests:** teclado, selección y equivalencia preview.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

- [ ] **TASK 4.2 — Implementar borradores recuperables.**
  UID/pestaña, recuperación, descarte y descarga.
  **Files affected:** módulo de borradores, hook y portada.
  **Dependencies:** 4.1. **Tests:** recarga, dos pestañas, cuota y formato inválido.
  **Difficulty:** MEDIUM. **Risk:** HIGH: conservar trabajo sin mezclarlo.

- [ ] **TASK 4.3 — Implementar autosave y reconciliación.**
  Debounce, cola, revisión, respuesta incierta y guardado manual.
  **Files affected:** estado autosave, hook y acciones.
  **Dependencies:** 2.3, 4.2. **Tests:** cambios en vuelo, pérdida de respuesta, conflictos y borrados.
  **Difficulty:** HIGH. **Risk:** HIGH: concurrencia, transporte y estado local.

- [ ] **TASK 4.4 — Cerrar navegación y edición.**
  Finalización, invalidación específica y recuperación al volver.
  **Files affected:** editor, finishEditingAction, listado y lector.
  **Dependencies:** 4.3. **Tests:** salir, regresar, recargar y lector ya visitado.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

### PHASE 5 — Relaciones con errores

- [ ] **TASK 5.1 — Implementar repositorio de vínculos.**
  Relación, eliminación, consulta inversa y apartados.
  **Files affected:** repositorio Notebook, acciones y tests.
  **Dependencies:** 2.6, 3.3. **Tests:** extremos borrados, apartados obsoletos y cascadas.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

- [ ] **TASK 5.2 — Integrar selector en detalle del error.**
  Búsqueda, apartado y Ver apunte.
  **Files affected:** ErrorDetailPanel.tsx, ErrorNotebookLinks.tsx y selector.
  **Dependencies:** 3.4, 5.1. **Tests:** Sesiones, Errores y Falsas certezas.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

- [ ] **TASK 5.3 — Mostrar errores relacionados en lector.**
  Correcciones y enlaces reutilizados.
  **Files affected:** lector y componente de relaciones.
  **Dependencies:** 5.1. **Tests:** paginación, desvinculación y conservación del apunte.
  **Difficulty:** LOW. **Risk:** LOW.

### PHASE 6 — Portabilidad

- [ ] **TASK 6.1 — Añadir importación individual.**
  Archivo, frontmatter, preview y confirmación.
  **Files affected:** src/lib/notebook/import.ts, /importar y dependencia YAML.
  **Dependencies:** 1.3, 2.6, 4.1. **Tests:** UTF-8, tamaños, YAML, campos desconocidos y títulos.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

- [ ] **TASK 6.2 — Exportar un apunte.**
  Markdown y frontmatter preservando el cuerpo.
  **Files affected:** exportador y descarga.
  **Dependencies:** 6.1. **Tests:** contenido y metadata.
  **Difficulty:** LOW. **Risk:** LOW.

- [ ] **TASK 6.3 — Exportar cuaderno y JSON.**
  Snapshot, streams, manifiesto, enlaces relativos y JSON ampliado.
  **Files affected:** notebookExport.ts, dump.ts, descargas y dependencia ZIP.
  **Dependencies:** 2.5, 5.1, 6.2. **Tests:** consistencia, relaciones, nombres, enlaces y cancelación.
  **Difficulty:** HIGH. **Risk:** HIGH: evitar perder relaciones o mezclar revisiones.

### PHASE 7 — Validación y entrega

- [ ] **TASK 7.1 — Completar responsive, accesibilidad y fallos.**
  Cubrir recorridos de la sección 19.
  **Files affected:** e2e/notebook*.spec.ts.
  **Dependencies:** fases 3–6. **Tests:** escritorio, tableta, móvil, teclado, pestañas y transporte.
  **Difficulty:** MEDIUM. **Risk:** MEDIUM.

- [ ] **TASK 7.2 — Medir y cerrar rendimiento.**
  50, 500, 5.000 documentos y bundle lector/editor.
  **Files affected:** fixtures y comprobaciones de rendimiento.
  **Dependencies:** 7.1. **Tests:** carga acotada, latencia y memoria de exportación.
  **Difficulty:** MEDIUM. **Risk:** LOW.

- [ ] **TASK 7.3 — Actualizar demo, documentación y entrega.**
  Ejemplos ficticios, instrucciones, limitaciones y changelog.
  **Files affected:** seed/demo, README, docs y tests.
  **Dependencies:** 7.1–7.2. **Tests:** tipos, lint, cobertura, build y E2E con Node 22.
  **Difficulty:** LOW. **Risk:** LOW.

## 22. Architectural risks

### CURRENT ARCHITECTURAL ISSUE — Invalidación global

**Problem:** acciones actuales invalidan el layout raíz.
**Impact on Notebook:** autosave refrescaría trabajo innecesario y complicaría el editor.
**Recommended change:** confirmación local e invalidación específica al terminar.
**Must fix before Notebook:** YES para el nuevo flujo; sin refactor general.

### CURRENT ARCHITECTURAL ISSUE — Seed

**Problem:** solo comprueba sesiones, errores y Writing.
**Impact on Notebook:** una base con apuntes parecería vacía.
**Recommended change:** incluir carpetas y documentos.
**Must fix before Notebook:** YES.

### CURRENT ARCHITECTURAL ISSUE — Backup y dump

**Problem:** enumeran entidades conocidas.
**Impact on Notebook:** las nuevas tablas no se validan/exportan automáticamente.
**Recommended change:** ampliar contratos/tests manteniendo copias antiguas.
**Must fix before Notebook:** YES.

### CURRENT ARCHITECTURAL ISSUE — Sin control de revisión

**Problem:** CRUD actual sin protocolo general de documentos concurrentes.
**Impact on Notebook:** sobrescrituras entre pestañas.
**Recommended change:** revisión optimista para apuntes.
**Must fix before Notebook:** YES para Notebook.

### CURRENT ARCHITECTURAL ISSUE — Datasets completos

**Problem:** informes cargan datos en memoria.
**Impact on Notebook:** añadir documentos multiplicaría memoria/trabajo.
**Recommended change:** consultas independientes y paginadas.
**Must fix before Notebook:** NO como refactor general; evitar extender el patrón.

### CURRENT ARCHITECTURAL ISSUE — Sin autenticación

**Problem:** sin usuarios/autorización.
**Impact on Notebook:** no permite exposición remota segura.
**Recommended change:** mantener ejecución local; auth solo al cambiar uso.
**Must fix before Notebook:** NO para el contexto acordado.

Riesgos nuevos: anchors derivados cambian con headings; cuota de borradores; índice transaccional; diferencias de anchors entre visores; compatibilidad de dependencias con React 19, Next instalado y Node 22.

## 23. Decisions required before implementation

No hay preguntas de producto bloqueantes. Tras guardar el plan y crear la rama, el usuario pidió comenzar la implementación siguiendo las tareas en orden.

| Decisión | Elección |
| --- | --- |
| Integración | Vínculos manuales desde MVP |
| Contenido | Nuevo/pegado e importación básica |
| Imágenes | Aplazadas |
| Organización | Dos niveles de carpetas |
| Editor | Markdown + preview |
| Identidad | ID estable y sufijo descriptivo |
| Guardado | Autosave, borrador y revisión optimista |
| Historial | Aplazado |
| Búsqueda | FTS5 local |
| Portabilidad | .md, ZIP, JSON; SQLite para restaurar |

Ya instaladas para TASK 1.3: react-markdown, remark-gfm, unified, remark-parse, github-slugger y tipos mdast. `yaml` y `yazl` siguen previstos para la fase de portabilidad.

## 24. Final recommended architecture

Notebook es un módulo de conocimiento permanente dentro de Error Log: Markdown en SQLite, carpetas poco profundas y relaciones manuales con errores.

Mantener stack, ejecución local, Server Actions/repositorios, diseño, categorías/reglas y mecanismos de prueba/recuperación.

Añadir lo necesario para escribir con confianza, leer, encontrar apartados y conectarlos con errores reales:

~~~text
Errores reales
→ conocimiento organizado
→ repaso y práctica
→ nueva evidencia de aprendizaje
~~~

La primera versión entrega el cuaderno y sus conexiones. Recomendaciones automáticas y Study Mode quedan para después.

---

## Registro de continuidad

| Fecha | Trabajo | Validación / siguiente paso |
| --- | --- | --- |
| 2026-09-29 | Análisis y plan acordado; rama feature/notebook creada desde develop b03b745; documento y checklist guardados | Implementación no iniciada. Continuar por TASK 1.1 |
| 2026-09-29 | TASK 1.1–1.3 y 2.1–2.5: contrato, esquemas, AST/URLs, migraciones, repositorios, FTS, seed y backups. Commits: `f2458f6` (contrato) y `feat(notebook): persist notes and protect recovery` (persistencia). | `pnpm typecheck`, `pnpm lint`, `pnpm test` (674 pruebas), `pnpm test:coverage` (92,59 % ramas) y `pnpm build` correctos con Node 23.7.0; validar también con Node 22 antes de entregar. Siguiente TASK 2.6. |
| 2026-09-29 | TASK 2.6: acciones tipadas de apuntes y carpetas, lectura, índice y búsqueda filtrada/paginada. Los vínculos e importación tienen tareas propias en fases 5 y 6. Commit: `feat(notebook): expose validated server actions`. | `pnpm typecheck`, `pnpm lint`, `pnpm test` (684 pruebas), `pnpm test:coverage` (92,62 % ramas) y `pnpm build` correctos con Node 23.7.0. Siguiente TASK 3.1. |

TASK 1.1 se cerró al actualizar SPEC, PRODUCT y DESIGN; el plan por sí solo no completaba esa tarea.
