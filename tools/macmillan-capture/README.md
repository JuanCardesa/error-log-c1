# Copiar errores de Macmillan al Error Log C1

Userscript que lee un ejercicio ya corregido en Macmillan Education Everywhere y copia
la **cabecera de la tanda y solo tus fallos** en el JSON que acepta «Sesión y errores
para importar» en la raíz de Registrar. Una tanda de estudio crea una sesión.

Flujo previsto: haces **varios** ejercicios corrigiéndolos → al terminar pulsas «Copiar
todo» una vez → pegas en el error-log → revisas y guardas la tanda entera.

Los fallos se van guardando solos en una bandeja según corriges, así que no tienes que
parar a exportar después de cada actividad.

## Instalación (una vez)

Genera las dos versiones con `pnpm macmillan:build`. Hay dos formas de instalarla y **la
recomendada es la extensión**.

### Extensión de Chrome (recomendada)

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador**, arriba a la derecha.
3. Pulsa **Cargar descomprimida** y elige la carpeta `tools/macmillan-capture/extension`.

Es la recomendada por un motivo concreto, no por gusto. Un userscript solo entra donde
llega su `@match`, y `@match` no cubre los marcos `blob:` ni `about:blank`. Macmillan
sirve páginas del libro en marcos `blob:`, así que hay sitios del reproductor donde un
gestor de userscripts **no llega y no avisa**: no ves panel, ni error, ni pista. La
extensión declara `all_frames` y `match_origin_as_fallback`, que sí los cubren, y eso está
comprobado cargándola de verdad en el navegador (`e2e/extension.spec.mjs`).

### Userscript (alternativa)

Instala [Tampermonkey](https://www.tampermonkey.net/) o
[Violentmonkey](https://violentmonkey.github.io/), crea un script nuevo, **vacía el editor
del todo** y pega el contenido de `tools/macmillan-capture/dist/errorlog-macmillan.user.js`.
Si dejas la plantilla que trae Tampermonkey, el fichero acaba con dos cabeceras, manda la
primera, y el script no se ejecuta nunca en Macmillan.

No uses las dos a la vez o verás dos paneles.

Ninguna de las dos pide permisos de red, ni lee cookies ni tokens. Todo ocurre en la
página que ya tienes abierta.

## Uso

El panel aparece abajo a la derecha, dentro del marco del ejercicio.

1. **Abre el ejercicio antes de responder.** En las actividades de arrastrar y soltar tu
   respuesta sigue visible después de corregir, así que el guion la lee igual. En las de
   escribir, si el ejercicio sustituye tu respuesta por la solución, solo se conserva si
   el guion ya estaba activo. No recupera lo que se sobrescribió antes de cargarlo.
2. Responde y pulsa el botón de corregir de Macmillan. Los fallos entran solos en la
   bandeja. El botón flotante lleva la cuenta: «Errores (7)».
3. Sigue con los demás ejercicios de la unidad. La bandeja acumula y aguanta cambios de
   actividad y recargas.
4. Al terminar, abre el panel y pulsa **Copiar todo**.
5. Pega el bloque en **Registrar → Pegar sesión y errores**, revisa la cabecera y los
   errores y guarda. La sesión y todas sus filas se crean juntas; si algo no valida,
   no se crea nada y se conserva la vista previa.

El panel muestra **respuestas comprobadas y aciertos de toda la tanda**, también de
actividades perfectas. Cada hueco cuenta una vez, con el primer veredicto observado;
recargar o reintentar no mejora artificialmente ese recuento. Los reintentos siguen
sirviendo para que Macmillan confirme la solución de un fallo.

El bloque es `{ "session": { ... }, "errors": [...] }`. Propone la fecha local del
inicio de la tanda, tipo `DRILL`, fuente `LIBRO`, `paper` y `part` nulos («Sin formato
de examen») y `timed: false`. Todo se puede revisar en la cabecera. **La duración no
viaja en el bloque**: escribe los minutos a mano si has cronometrado.

La referencia agrupa los datos legibles, por ejemplo «Ready for C1 Advanced · págs.
6-7 · actividades 1-5». El visor y el reproductor comparten el contexto por origen,
aislado por pestaña; si no se lee libro, página o actividad, ese dato se omite. No se
deducen números de los identificadores internos. Los selectores nuevos de estos
metadatos están probados con fixtures; falta contrastarlos en una sesión real de
Macmillan (los selectores que no coincidan simplemente omitirán esos datos).

Si ya tienes sesiones abiertas, puedes crear otra con esta tanda o elegir una para
añadir los errores. Al añadir **se conserva su cabecera y no se suman los recuentos**;
la vista previa lo avisa. El cuadro dentro de una sesión sigue aceptando arrays y TSV.

### Qué copia y qué deja pendiente

| Campo | De dónde sale |
| --- | --- |
| `itemRef` | número de la pregunta; con varios huecos, `7.2` para el segundo |
| `prompt` | enunciado completo con los huecos numerados |
| `myAnswer` | tu respuesta, guardada al escribirla |
| `correctAnswer` | si la plataforma la muestra, o si la confirma al reintentar; si no, vacío |
| `ruleNote` | solo si la plataforma da una explicación; si no, vacío |
| `category`, `subcategory` | siempre vacíos: los eliges tú |

No envía `cause` ni `confidence`: el importador propone DESCONOCIMIENTO y DUDABA y los
revisas tú. No marca tarjetas de Anki; paper y part van como null en la cabecera.

### La bandeja

Cada fallo se identifica por actividad, item, enunciado y tu respuesta. Con eso:

- No entra dos veces, ni al recorregir ni al reintentar el ejercicio.
- Si fallas, reintentas y aciertas, el fallo **se conserva**: pasó y es lo que registras.
- Si después de corregir aparece la solución, la fila que ya estaba guardada se completa
  con ella en vez de quedarse a medias.
- **Si fallas, reintentas y aciertas, la solución entra sola.** Macmillan marca ese mismo
  hueco como correcto con el valor bueno dentro, y eso es su veredicto, no una deducción
  nuestra. El hueco se reconoce por `data-rcfid`, que no cambia entre intentos. Si vuelves
  a fallar, no se rellena nada.
- **Vaciar la bandeja** descarta errores y recuentos y no los vuelve a recoger solos.
- **Olvidar lo exportado** hace lo contrario: permite que vuelva a entrar lo ya copiado.

«Copiar todo» entrega toda la tanda en un solo sobre y reinicia errores y recuentos.
El tope de la bandeja son trescientos fallos; al llenarse avisa. Si el texto supera
200 000 caracteres se conserva la bandeja y se avisa, sin entregar un bloque truncado.
Una tanda perfecta se puede copiar con `errors: []`: también cuenta en los informes.

Al actualizar desde una versión anterior, una bandeja guardada puede carecer de los
recuentos de actividades previas. En ese caso se entrega el array de errores antiguo
y se avisa para que completes la cabecera manualmente; no se inventan esos totales.

### Lo que de verdad cuesta tiempo

No es copiar y pegar. El error-log exige por cada error una `correctAnswer`, una
`category` y una `ruleNote` de quince caracteres o más.

De esos tres, la respuesta correcta se puede resolver sin inventar nada: reintenta el
ejercicio y acierta el hueco, y la plataforma te la confirma. La categoría y la regla
siguen siendo tuyas a propósito, porque un mismo fallo puede ser colocación o léxico
según por qué lo fallaste, y escribir la regla con tus palabras es lo que enseña. Lo que
sí se ha quitado es la ida y vuelta por ejercicio: una sola ronda de revisión por sesión.

Lo que **no** hace la herramienta es deducir la solución por eliminación, aunque a veces
se pueda (seis palabras, seis huecos, cuatro confirmados). Eso sería presentar una
conjetura nuestra como si viniera de Macmillan.

### Sin instalar nada

Si no quieres Tampermonkey, puedes pegar el contenido de `dist/errorlog-macmillan.user.js`
en la consola del navegador. Tienes que cambiar el contexto al marco `rcf-player.html` en
el desplegable de DevTools, y Chrome te pedirá escribir «allow pasting» la primera vez.
Funciona igual, pero hay que repetirlo en cada ejercicio.

## Cuando no funciona

El panel distingue tres cosas que no son lo mismo:

- **«El ejercicio no está corregido»**: aún no has pulsado corregir. No exporta nada.
- **«Todo correcto»**: has acertado todo. No genera errores, pero puedes copiar la
  cabecera de la tanda para que esos aciertos cuenten.
- **«No reconozco cómo marca la corrección»** o **«está a medio corregir»**: no se ha
  podido leer con garantías. No exporta nada para no dejarse fallos fuera.

Si el panel no aparece, el ejercicio se sirve desde un origen que el guion no cubre.
Mira la URL del marco del ejercicio y añade su host como `@match` en la cabecera.

### Muestra técnica

Para añadir un formato nuevo hace falta ver su HTML. Con el ejercicio **ya corregido**,
pulsa **Copiar muestra técnica**: genera el contenedor de una pregunta, el estado de sus
controles y la cadena de ancestros. Ese texto es lo único que hace falta para escribir el
adaptador.

Lleva la estructura del ejercicio y tus respuestas, que es justo lo que hay que mirar. No
lleva cookies ni la query de la URL, y **nada sale sin pasar por un enmascarado**: ni los
atributos, ni el texto visible, ni las respuestas. Se ocultan los atributos que se llaman
token, auth, session, key o parecido, y en cualquier valor se enmascara lo que tenga forma
de credencial: un JWT, una cadena larga con pinta de clave, o un parámetro sensible dentro
de una URL, reconocido por su forma y no por una lista cerrada de nombres. Los identificadores de contenido de Macmillan sí se conservan,
porque sin ellos el adaptador no se puede escribir.

## Cómo lee el ejercicio

Hay dos caminos y los dos fallan en cerrado.

**Adaptador de Macmillan.** Los ejercicios se reproducen en `/rcf-player.html`, un iframe
del visor del libro. La plataforma envuelve cada hueco así:

```html
<span data-rcfid="CAPE_ID_15" data-rcfinteraction="complexDroppable">
  <span class="markable dev-markable-container incorrectAnswer" aria-invalid="true">
    <span class="dragTarget populated" title="drag and drop gap 5, challenge, Incorrect">challenge</span>
    <span class="mark wrong" aria-label="Incorrect"></span>
  </span>
</span>
```

De ahí sale todo: el veredicto por dos señales independientes (`aria-invalid` y la clase
`correctAnswer` / `incorrectAnswer`), tu respuesta, el número de item (`li[value]`) y la
identidad de la actividad (`data-rcfxmlid`). La actividad lleva la clase `marked` cuando
está corregida; sin ella no se exporta nada. Si las dos señales se contradicen, tampoco.

**Detector genérico**, para páginas que no son el reproductor. Observa qué cambia en el
DOM al corregir y acepta ese cambio solo si reparte en dos grupos coherentes todo lo que
contestaste. Lee `aria-invalid`, atributos de estado y clases cuyo nombre diga acierto o
fallo, sobre `input`, `textarea`, `select`, grupos de `radio` y `checkbox` y campos
editables.

En ningún caso se usa **el color** como señal, ni se decide comparando tu texto con la
solución: puede haber variantes aceptadas.

### Estado de cada formato

| Formato | Estado |
| --- | --- |
| `rcfDroppable` (arrastrar y soltar del libro) | comprobado contra Macmillan |
| Otras interacciones del reproductor RCF | se leen por la misma capa de marcado, pero el panel avisa de que no están comprobadas |
| Huecos, desplegables, opción múltiple fuera del reproductor | probados solo con ejercicios sintéticos |
| Emparejar sobre imagen, lienzo | no soportado; el panel lo dice y no exporta |

Muchas actividades del libro no muestran la solución al corregir, solo si acertaste.
En ese caso `correctAnswer` queda vacío para que lo completes tú. No se deduce.

## Desarrollo

```
pnpm macmillan:build   # genera dist/errorlog-macmillan.user.js
pnpm macmillan:test    # lógica pura, incluido el contrato real del importador
pnpm macmillan:e2e     # ejercicios sintéticos en Chromium
```

`src/core/` es lógica pura y sin DOM: vocabulario de corrección, veredictos, enunciados,
duplicados y paso al contrato del importador. `src/dom/` lee la página y pinta el panel,
con `macmillan.js` como adaptador del reproductor RCF. `build.mjs` los concatena en un
`.user.js` sin bundler.

Como todo acaba en el mismo ámbito, `build.mjs` rompe la compilación si dos módulos
declaran el mismo nombre arriba del todo. Esa comprobación existe porque `segmentsOf`
estaba duplicado y el fallo solo se vio al probar contra Macmillan de verdad.

Las pruebas de `e2e/` interceptan el dominio de Macmillan y sirven HTML propio: no sale
ninguna petición del equipo y no tocan tu base de datos. `rcf-fixture.mjs` replica la
estructura real del reproductor (clases, atributos y anidamiento) con contenido
inventado: aquí no se guarda material del libro.

La prueba de la extensión la carga de verdad en Chromium y comprueba el panel en
marcos normales y `blob:`. Se ejecuta también en CI, sin ventana, usando el
[canal `chromium` de Playwright](https://playwright.dev/docs/chrome-extensions).
