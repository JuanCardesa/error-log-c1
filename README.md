# Error Log C1

**Convierte tus errores del C1 en un plan concreto de estudio.**

[![CI](https://github.com/JuanCardesa/error-log-c1/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JuanCardesa/error-log-c1/actions/workflows/ci.yml)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)

Un registro personal para preparar Cambridge C1 Advanced: guarda qué fallaste y por qué,
revisa tus patrones y elige **una acción para esta semana**. Funciona en tu equipo,
sin cuenta y con tus datos en SQLite.

![Demo: abrir una sesión, pegar correcciones, revisarlas, guardarlas y consultar el informe](docs/media/demo.gif)

La demo usa datos ficticios. [Ver el recorrido en imágenes estáticas](docs/DEMO.md).

## Qué puedes hacer

- **Registrar sin repetir trabajo.** Captura individual por teclado o importación de
  hasta 100 errores desde una tabla o un JSON, con vista previa y control de duplicados.
- **Entender el origen del fallo.** Distingue desconocimiento, confusión, ortografía,
  despiste, formato y tiempo; relaciona los errores con los ítems intentados.
- **Decidir qué estudiar.** Siete reglas priorizan una sola acción, con la cifra que
  la dispara y un mínimo de muestra para las reglas de porcentaje.
- **Cerrar el ciclo.** Revisa las tarjetas pendientes de Anki, las falsas certezas y
  los errores que reaparecen al reescribir un texto.
- **Llevarte tus datos.** Exporta las seis consultas a CSV, las filas a JSON o una
  copia SQLite restaurable.

| Informe semanal | Evolución de Reading & Use of English |
| --- | --- |
| ![Informe con la acción prioritaria y sus reglas](docs/screenshots/informe.png) | ![Precisión por part y semana, con celdas sin datos diferenciadas](docs/screenshots/ruoe.png) |

## Empezar

Necesitas **Node.js 22** (la versión de `.nvmrc` y CI) y **pnpm 10.33.2**.
Instala las dependencias desde la carpeta del proyecto:

```bash
git clone https://github.com/JuanCardesa/error-log-c1.git
cd error-log-c1
pnpm install --frozen-lockfile
```

### Probar con ejemplos

```bash
pnpm demo
```

Abre **http://127.0.0.1:3001**. El comando prepara automáticamente una base nueva
con ejemplos en `data/demo/`. Cada arranque empieza de nuevo; las bases anteriores
se conservan y la base personal no se modifica. Sal con `Ctrl+C`.

La demo lleva un aviso en pantalla: los datos son inventados y lo que escribas ahí
no pasa a tu registro. Para tus datos reales, usa `pnpm dev`.

### Empezar con mis datos

```bash
pnpm db:migrate
pnpm dev
```

Abre **http://127.0.0.1:3000**. Tus datos se guardan en `data/errorlog.db`, fuera de Git.
Para ejecutar la versión compilada: `pnpm build` y después `pnpm start`.

Para actualizar una base existente, detén la app, ejecuta `pnpm db:backup` y después
`pnpm db:migrate`. Usa este comando también para las migraciones que reconstruyen
tablas: conserva las relaciones y verifica la integridad antes de confirmar los cambios.

`pnpm db:seed` sigue disponible para cargar ejemplos en una base **vacía y migrada**.
Si encuentra datos, se detiene sin cambiarlos. Para probar la app, usa `pnpm demo`.

**Uso local y monousuario.** No hay autenticación. Los comandos de arranque escuchan
solo en `127.0.0.1`; la app no está preparada para exponerse directamente a Internet.

## Pegar correcciones

1. Abre una sesión en **Registrar** y pulsa **Pegar varios errores**.
2. Pega celdas con las cabeceras de la plantilla o un JSON de errores. Si partes de
   correcciones en texto o fotos, copia las instrucciones de **Convertir mis correcciones
   con IA** y úsalas en la herramienta que prefieras.
3. Prepara la vista previa, comprueba cada respuesta y ajusta causa y confianza.
4. Guarda la tanda. Un error repetido en la misma sesión no se duplica ni modifica el anterior.

La app no conecta con una IA ni lee fotos directamente. Si utilizas una herramienta
externa, las correcciones se las facilitas tú. Revisa su respuesta: puede interpretar mal
el ejercicio. Cuando faltan causa y confianza se proponen `DESCONOCIMIENTO` y `DUDABA`.

Una sesión con cero errores también cuenta: es parte del denominador. Las ventanas
del informe son de 30 y 60 días; Falsas certezas usa siempre 30 días.
En Registrar, **Más antiguas** y **Más recientes** permiten recorrer todas tus sesiones.

Para ejercicios del libro que no siguen una tarea de Cambridge, elige **Sin formato de
examen** en Paper. No tendrás que indicar Part; sí los ítems y aciertos. Indica unidad,
página y ejercicio en Referencia. Estas sesiones cuentan en el informe general y Anki,
y quedan fuera de la precisión RUOE. Un ejercicio del libro con formato de examen
puede seguir usando su paper y part correspondientes.

Los CSV incluyen la marca UTF-8 para conservar los acentos en Excel. Lo que Excel
evaluaría como fórmula sale con un tabulador protector dentro del campo entrecomillado;
las respuestas normales no se tocan, sufijos como `-ing` o `-ed` incluidos. Si necesitas
el contenido literal para procesarlo, usa el JSON.

## Copias y recuperación

### Crear una copia

```bash
pnpm db:backup
# También puedes elegir un nombre nuevo:
pnpm db:backup data/backups/antes-de-actualizar.db
```

El comando usa la API de backup de SQLite, comprueba la integridad y genera un fichero
independiente, también con la app abierta. Incluye los datos confirmados que aún estén
en el WAL. Nunca sobrescribe una copia existente. Guarda otra copia fuera del equipo.

**No copies solo `errorlog.db` mientras la app esté abierta:** los últimos cambios pueden
estar en `errorlog.db-wal`. [Detalles de SQLite](https://www.sqlite.org/wal.html).

### Recuperar una copia

Detén la app con `Ctrl+C` y restaura a un nombre nuevo:

```bash
pnpm db:restore data/backups/antes-de-actualizar.db data/restored.db
```

La restauración comprueba la copia y rechaza cualquier destino existente, incluidos sus
archivos WAL. Conserva la base anterior hasta comprobar tus sesiones y errores.

Activa el fichero restaurado **en la misma terminal** antes de migrar y arrancar.

PowerShell (Windows):

```powershell
$env:DB_FILE_OVERRIDE = "data/restored.db"
pnpm db:migrate
pnpm dev
```

Bash (macOS/Linux):

```bash
export DB_FILE_OVERRIDE="$PWD/data/restored.db"
pnpm db:migrate
pnpm dev
```

Mantén esa variable en los siguientes arranques para seguir usando el fichero recuperado;
`db:backup` también la respeta. Sin ella se utiliza `data/errorlog.db`.
Si esa ruta predeterminada no existe, puedes restaurar directamente a ella omitiendo
el segundo argumento. Una exportación JSON sirve para portabilidad; aún no hay importación
del volcado completo ni restauración desde la interfaz.

## Cómo decide el informe

| Consulta | Para qué sirve |
| --- | --- |
| Reparto de causas | Distinguir conocimiento y ejecución |
| Categorías por tasa | Comparar errores por ítems intentados |
| Precisión RUOE | Seguir cada part por semana ISO |
| Falsas certezas | Revisar fallos cometidos con `SEGURO` |
| Deuda de Anki | Ver qué errores siguen sin convertirse en tarjetas |
| Eficacia del rewrite | Comprobar si reaparecen errores del original |

Las reglas de porcentaje necesitan al menos 15 observaciones en **su propio denominador**.
`needs n ≥ 15` indica muestra insuficiente y `n/a`, ausencia de datos aplicables.
La cola de Anki incluye desconocimiento, confusión y ortografía; marcar una tarjeta
como añadida es manual, sin sincronización con Anki.

## Desarrollo

Next.js (App Router), TypeScript strict, SQLite con Drizzle, Zod, Vitest y Playwright.
CSS Modules, sin librería de componentes. El dominio, las consultas y las reglas son
funciones puras con el reloj inyectado; `src/lib/db/` contiene los adaptadores de persistencia.

```bash
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

La suite prueba también que el seed respeta los datos existentes y que una copia con WAL
se restaura conservando filas, relaciones y migraciones. La cobertura de `src/lib/` exige
un mínimo del 90 % en líneas, sentencias, funciones y ramas.

[Contribuir](CONTRIBUTING.md) · [Contrato del producto](docs/SPEC.md) ·
[Plan de implementación](docs/PLAN.md) ·
[Regenerar la demo y las capturas](docs/DEMO.md) · [Licencia MIT](LICENSE)
