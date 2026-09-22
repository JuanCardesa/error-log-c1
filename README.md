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
- **Conectar el repaso.** Crea tarjetas en Anki y consulta los fallos por categoría con
  AnkiConnect, mediante sincronización manual.
- **Llevarte tus datos.** Exporta las siete consultas a CSV, las filas a JSON o una
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

Para actualizar una base existente, detén la app y ejecuta `pnpm db:migrate`. Antes de
tocar nada guarda una copia verificada en `data/backups/previa-a-migrar-<fecha>.db`; si
esa copia falla, no migra. Usa este comando también para las migraciones que reconstruyen
tablas: conserva las relaciones y verifica la integridad antes de confirmar los cambios.
No hay migraciones inversas: para volver atrás se restaura esa copia con `pnpm db:restore`.

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
La cola de Anki incluye desconocimiento, confusión y ortografía. **Crear en Anki**
crea una nota y comprueba que tiene tarjeta antes de marcar la conversión. **Marcar
a mano** sigue disponible y se distingue como una conversión sin verificar.

## Conectar con Anki

1. En Anki, abre **Herramientas → Complementos → Descargar complementos** e instala
   [AnkiConnect, código 2055492159](https://ankiweb.net/shared/info/2055492159).
2. Reinicia Anki y deja abierto el perfil que contiene tu colección.
3. En esta app abre **Anki → Sincronizar**. Puedes seguir usando la app con Anki cerrado;
   los datos de la última sincronización siguen disponibles.
4. **Crear en Anki** envía el enunciado, tu respuesta, la solución y la regla a una nota
   propia. El botón solo marca la conversión tras verificarla. Si se corta la conexión,
   vuelve a pulsarlo: la identidad del error permite recuperar la nota ya creada.

Por defecto lee `English B2 to C1 Practice` y sus submazos, y crea las notas en
`English B2 to C1 Practice::Error Log`, con el tipo **Error Log C1**. No modifica el
tipo de 18 campos ni las notas anteriores. Deshacer una conversión devuelve el error
a la cola y conserva la nota de Anki; crearla otra vez recupera esa misma nota.
Editar después el error en la app no actualiza automáticamente la nota ya creada.

La sincronización comprueba los vínculos aunque hayas movido las notas a otro mazo.
Si Anki confirma que una nota vinculada ya no existe, el error vuelve a estar pendiente.
Las conversiones manuales no se pueden comprobar. La regla de deuda conserva su umbral
y cuenta ambos tipos de conversión; el informe no supone que toda marca manual esté verificada.

**Repaso en Anki** muestra repasos, porcentaje de aciertos, fallos y cartas distintas
en 30/60 días. `Again` es fallo; `Hard`, `Good` y `Easy` son aciertos. Los pasos de
aprendizaje también cuentan; las reprogramaciones manuales no. Las notas con varios
`cat::` se asignan a una categoría principal; las etiquetas originales se conservan.
El historial antiguo se importa, pero no llena artificialmente la ventana reciente.
El informe compara cantidades de ambas fuentes; sus denominadores no son equivalentes.

Se usa el día civil local, no el cambio de día de Anki a las 04:00. Los datos son un
espejo del historial de las cartas que están actualmente en los mazos configurados:
deshacer un repaso en Anki lo retira del espejo al sincronizar, y las cartas borradas
o movidas fuera de esos mazos dejan de entrar en sus estadísticas.

Configuración opcional del servidor (variables de entorno):

| Variable | Valor por defecto |
| --- | --- |
| `ANKI_CONNECT_URL` | `http://127.0.0.1:8765` (solo direcciones locales) |
| `ANKI_SOURCE_DECK` | `English B2 to C1 Practice` |
| `ANKI_TARGET_DECK` | `<mazo origen>::Error Log` |
| `ANKI_CONNECT_API_KEY` | sin clave; configúrala si tu AnkiConnect la requiere |
| `ANKI_ROLLOVER_HOUR` | sin declarar; se supone `4` |

`ANKI_ROLLOVER_HOUR` es la hora a la que empieza el día en tu colección («next day starts
at» en las preferencias de Anki). Los repasos se agrupan por ese corte, no por medianoche:
uno de la 1:30 pertenece al día anterior. AnkiConnect no expone ese dato —comprobado
contra una instalación real—, así que si tu colección no usa el 4 por defecto, decláralo
aquí. La pantalla de Anki dice siempre si la hora que está usando la sabe o la supone.

La primera sincronización o creación vincula esta base al perfil, dirección y mazos
configurados. Un cambio de perfil/configuración se rechaza para no mezclar colecciones
ni devolver deuda por notas de otro perfil. Para otra colección usa otra base mediante
`DB_FILE_OVERRIDE`. Requiere una versión reciente de AnkiConnect con `getActiveProfile`.
La demo y las pruebas desactivan el acceso a la colección personal. No hay llamadas
automáticas para borrar notas, cambiar el planificador o responder tarjetas.

Q7 se exporta a CSV. El JSON incluye también notas, cartas, repasos y estado de
sincronización; la copia SQLite incluye el vínculo y la identidad de recuperación.
[Decisiones de implementación y límites](docs/ANKI.md).

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
