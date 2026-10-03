# Error Log C1 — demo de producto con Recordly

**Duración objetivo: 104 segundos. Formato principal: 16:9.**

La historia: una corrección que se olvidaba se convierte en un error con contexto, un apunte conectado y una decisión de repaso. El espectador debe recordar **«mis errores pueden decirme qué estudiar después»**.

La UI está en español. La narración inglesa presenta esta versión real del producto; no presupone una interfaz traducida. Todos los ejemplos son ficticios y originales. No se promete aprobar C1, diagnosticar el nivel ni generar explicaciones con IA.

## 1. Preparar la toma

Desde la raíz del proyecto, PowerShell:

```powershell
pnpm demo:record:build
pnpm demo:record
```

El primer comando compila una versión de producción independiente en `.next-recording`. Hazlo una vez y repítelo si cambias código de la aplicación. El segundo arranca en **http://127.0.0.1:3002** y crea siempre una base nueva dentro de `data/recording/take-*/`. Ambos comandos usan una base de demostración, incluso si la terminal tenía `DB_FILE_OVERRIDE` configurada. No hace falta ejecutar migraciones ni seeds manualmente.

Mantén esa terminal abierta. En una **segunda terminal**, copia la tanda al portapapeles y obtiene la pantalla de inicio:

```powershell
Get-Content -Raw -Encoding utf8 data/recording/import.json | Set-Clipboard
$recordingState = Get-Content -Raw -Encoding utf8 data/recording/current.json | ConvertFrom-Json
"http://127.0.0.1:3002/errores?error=$($recordingState.historicalErrorId)"
```

Abre la URL que imprime el último comando. Usa una ventana de navegador privada dedicada a esta toma. Activa pantalla completa si necesitas quitar pestañas y barra de direcciones. El **área de contenido** recomendada es 1920 × 1080 a zoom 100 %; la resolución del monitor por sí sola no garantiza ese viewport. Comprueba el encuadre con la misma ventana que vas a grabar. Si necesitas verificar dimensiones, abre las herramientas del navegador antes de grabar, consulta `window.innerWidth` / `window.innerHeight` con las herramientas desacopladas, y ciérralas.

No abras Anki ni una herramienta de IA. La demo no necesita ninguna conexión externa. No uses `pnpm dev` para esta toma: abriría el registro personal y mostraría compilaciones de desarrollo.

### Reset de una toma

1. Detén **solo la terminal de la demo** con Ctrl+C.
2. Cierra **todas las ventanas privadas de esa sesión** para descartar borradores del navegador. Cerrar una única pestaña no limpia `localStorage`.
3. Ejecuta de nuevo `pnpm demo:record`. No necesitas recompilar.
4. Repite el comando de portapapeles y abre la nueva URL de inicio en una ventana privada nueva.
5. Comprueba que hay **23 resultados** en Errores. Tras importar debe haber 26.

Las tomas anteriores se conservan; no se borran bases ni se sobrescribe tu historial personal. `data/recording/current.json` señala la toma nueva y `import.json` se actualiza con su fecha. No cambies de día a mitad de una grabación: reinicia si has dejado el servidor abierto desde el día anterior.

## 2. Qué vamos a demostrar

| Hero moment | El espectador piensa | Evidencia visible |
| --- | --- | --- |
| El mismo fallo vuelve | «Esto me pasa a mí» | Error antiguo `made` → `carried out`; la tanda nueva contiene otro contexto |
| Una tanda, tres errores | «Me ahorra transcribirlo todo» | Sesión y 3 errores importados, 5/8 aciertos, revisión antes de guardar |
| Respuesta + regla + confianza | «Aquí conservo por qué me equivoqué» | Corrección, Confusión, Seguro y regla explicativa |
| Del error al apunte | «Mis notas y mis fallos dejan de estar separados» | Vínculo manual a Research; dos errores relacionados |
| El historial tiene forma | «Veo dónde se concentran mis fallos» | 14 sesiones, 90 ítems, categorías y causas |
| El progreso tiene contexto | «Puedo comprobar qué hay detrás de un porcentaje» | Part 3, 8/8, una sesión concreta |
| Una acción para esta semana | «Sé qué hacer después» | Recomendación de tarjetas pendientes y evidencia 0/25 |

No se enseñan configuración, exportación, backup, edición de Writing, sincronización Anki, recuperación de borradores ni todos los filtros. Son funciones reales, pero abrirían historias distintas. Tampoco se demuestra el rotulador: el vínculo entre error y apunte aporta más valor en este tiempo y necesita menos precisión con el cursor. Inventario y criterios completos: [auditoría](docs/DEMO_AUDIT.md).

## 3. Datos preparados y resultados esperados

El fixture `src/lib/db/recording.ts` crea cuatro semanas de práctica. Las semanas antiguas usan miércoles y la última usa la fecha del arranque; incluso un lunes o un cambio de año conservan cuatro semanas distintas dentro de los últimos 30 días.

| Dato | Antes de pegar | Después de guardar |
| --- | --- | --- |
| Sesiones | 13 cerradas | 14, la nueva abierta |
| Errores | 23 | 26 |
| Ítems contabilizados, sin Writing | 82 | 90 |
| Errores de colocaciones | 8 | 11 |
| Confianza Seguro | 4 | 5, si haces el cambio del guion |
| Elegibles para tarjeta / convertidos | 22 / 0 | 25 / 0 |
| Apuntes / carpetas | 5 / 3 | 5 / 3 |
| Errores vinculados al apunte de collocations | 1 | 2, tras guardar el vínculo |

Hay 11 sesiones de RUOE y dos de Writing (original con tres errores, reescritura con uno que reaparece). La sesión nueva suma otra de RUOE. Las categorías cubren colocaciones, word formation, estructuras, preposiciones y artículos/cuantificadores. Part 3 pasa por **5/8, 6/8, 7/8 y 8/8**; la última sesión sin errores se conserva en el denominador. No afirmes que esta secuencia ficticia prueba la eficacia de la app.

La nueva práctica, **Urban gardens · collocations**, contiene tres errores en ocho ítems. [Práctica completa y clave](docs/recording/PRACTICE.md). Solo se importan los fallos 1, 4 y 7: `made` → `carried out`, `arrived` → `reached`, `rise` → `raise`. Causa, regla y corrección vienen de la tanda preparada. El usuario revisa y confirma; la app no las inventa.

**El final real:** «Dedica una sesión a tus tarjetas pendientes de Anki». Hay 0 de 25 errores elegibles convertidos. Esa regla tiene prioridad sobre la concentración de colocaciones y las cinco falsas certezas. Mostrar esta acción es más honesto que fabricar tarjetas sincronizadas para forzar otra recomendación.

## 4. Guion de grabación — 104 segundos

Los tiempos son los del montaje final. Graba con 2–3 segundos de margen al principio y al final y algo más de aire entre escenas. Ajusta mediante trim; no aceleres la lectura. Hay **tres zooms manuales**: escenas 3, 4 y 7. Mantén el cursor quieto fuera del texto durante cada pausa.

### Escena 1 · 00:00–00:08 · El error que vuelve

- **Inicio:** `/errores?error=<historicalErrorId>`, detalle abierto del ejercicio sobre *local transport*. La lista tiene 23 resultados.
- **Acción:** deja el panel quieto. A los 6 s mueve el cursor hacia **Sesiones** sin hacer círculos; pulsa al terminar la frase.
- **Foco:** la pareja `made` → `carried out` y la regla debajo. No es necesario leer toda la lista.
- **Mensaje:** corregir y continuar no asegura recordar.
- **Recordly:** encuadre general, sin zoom nuevo. Anotación opcional breve «The same mistake, again» / «El mismo error, otra vez», en espacio libre a la izquierda del panel. Retírala antes del cambio de pantalla.
- **Pausa:** 2 s después de «the same mistake» / «el mismo error».
- **Voz EN:** “You correct an exercise. Two weeks later, you make the same mistake. Practising more isn't the whole answer.”
- **Voz ES:** “Corriges un ejercicio. Dos semanas después, vuelves a cometer el mismo error. Practicar más no siempre basta.”
- **Transición:** un clic en Sesiones; no mostrar la barra de direcciones.

### Escena 2 · 00:08–00:22 · Conservar la práctica sin transcribirla

- **Inicio:** Sesiones, campo **Pegar correcciones** visible.
- **Acción:** clic dentro del campo → Ctrl+V → espera «Detectado: sesión + 3 errores» → clic **Revisar importación**.
- **Foco:** transformación del bloque pegado en cabecera **Urban gardens · collocations**, **5/8 aciertos** y lista de tres correcciones. No invites a leer JSON.
- **Mensaje:** una tanda conserva tanto errores como contexto de práctica.
- **Recordly:** encuadre general; auto zoom desactivado. Sin anotación: el antes/después ya explica el valor.
- **Cursor:** del centro del textarea al botón; después, aparcado en el margen de la lista.
- **Pausa:** 1 s después de detectar el bloque y 3 s cuando aparece la revisión.
- **Voz EN:** “Error Log keeps what practice usually leaves behind. Bring in a corrected session, with its results and mistakes, in one batch.”
- **Voz ES:** “Error Log conserva lo que suele perderse después de practicar. Importas una sesión corregida, con sus resultados y sus errores, en una sola tanda.”
- **Transición:** permanece en revisión; no abras Editar sesión.

### Escena 3 · 00:22–00:38 · Entender antes de guardar

- **Inicio:** **Error 1 de 3** seleccionado.
- **Acción:** cambia **Confianza → Seguro**. Mantén **Causa → Confusión**. Lee brevemente la regla. Pulsa **Crear sesión y guardar 3 errores**. En la sesión creada, pulsa la corrección **carried out** (botón accesible «Ver error 1: carried out»).
- **Foco:** `made` tachado, `carried out`, Confusión, Seguro y la regla «Con research usamos do, conduct o carry out…»; después, el mismo error ya guardado.
- **Mensaje:** no solo conservar la solución, también la regla y la confianza equivocada.
- **Recordly:** **zoom manual 1**, aproximadamente 1,25×, sobre respuesta/corrección y clasificación, de 00:23 a 00:32. Sal del zoom antes de guardar para que se entienda el cambio de pantalla. No seguir al cursor automáticamente.
- **Pausa:** 3 s tras elegir Seguro; 2 s al abrir el detalle guardado.
- **Voz EN:** “Keep the correction, but also the reason. Here, I chose ‘made’ with confidence. The useful lesson is the whole phrase: ‘carry out research’.”
- **Voz ES:** “Guardas la corrección, pero también el motivo. Aquí elegí ‘made’ convencido. Lo que necesito recordar es la expresión completa: ‘carry out research’.”
- **Transición:** desplaza el cursor hacia **Apuntes vinculados** en el mismo panel.

### Escena 4 · 00:38–01:06 · Conectar el fallo con el aprendizaje

- **Inicio:** detalle del error nuevo; sección **Apuntes vinculados**.
- **Acción exacta:** **Vincular apunte** → escribe `research` en **Buscar apuntes** → pulsa **Collocations · research, conclusions, awareness** → en **Apartado**, elige **Research** → **Guardar vínculo** → pulsa el título del apunte guardado.
- **Foco:** primero el vínculo elegido explícitamente; luego el lector del Notebook, su regla y los errores relacionados. El apunte ya existía; el vínculo nuevo se crea durante la toma.
- **Mensaje:** convertir el error aislado en parte de un cuaderno reutilizable. El enlace es manual, no una recomendación automática de apuntes.
- **Cursor y scroll:** al escribir `research`, espera a que solo quede el resultado de collocations. Desplaza suavemente hacia abajo dentro del panel hasta verlo completo. Tras elegir Research, revela **Guardar vínculo** con otro desplazamiento corto si queda fuera. Estos dos movimientos del selector son previstos; no recorras el resto de la página. En el lector, deja terminar la navegación al apartado antes de continuar; la regla y las dos correcciones relacionadas caben en el viewport recomendado.
- **Recordly:** general durante la búsqueda y el guardado. **Zoom manual 2**, alrededor de 1,2×, centrado en Research y la frase, de 00:57 a 01:05. Anotación opcional «One rule. My own examples.» / «Una regla. Mis propios ejemplos.» Solo si no tapa texto ni vínculos.
- **Pausa:** 1 s tras guardar el vínculo; 5 s sobre el apunte. No editar ni subrayar durante esta toma.
- **Voz EN:** “Now I connect that mistake to the exact section of my notebook. The explanation and my own examples stay together. When this pattern comes back, I have somewhere useful to return.”
- **Voz ES:** “Ahora conecto ese fallo con el apartado exacto de mi cuaderno. La explicación y mis propios ejemplos quedan juntos. Cuando vuelve a aparecer, tengo un lugar útil al que regresar.”
- **Transición:** sal del zoom; pulsa **Progreso** en la cabecera.

### Escena 5 · 01:06–01:22 · Ver el historial con contexto

- **Inicio:** Progreso → Resumen, ventana de 30 días.
- **Acción:** deja cargar la vista; lleva el cursor despacio entre **Dónde se concentran los errores** y **Por qué ocurren**. No abras filtros ni despliegues la tabla de reglas.
- **Foco:** **14 sesiones**, **90 ítems contabilizados**, **26 errores**, colocaciones y causas. Se ve ya la recomendación, pero su lectura completa se reserva para el cierre.
- **Mensaje:** el historial ayuda a decidir dónde prestar atención.
- **Recordly:** general, sin zoom. No rotular «42 % de probabilidad de fallar»: esa cifra no existe aquí. Las tasas de categorías son por 100 ítems totales, no dentro de cada categoría.
- **Pausa:** 4 s con las dos columnas estables. No recorrer cada número con el cursor.
- **Voz EN:** “Across several weeks, the history becomes easier to read. I can see where errors cluster, and whether I was unsure, confused, or simply careless.”
- **Voz ES:** “Con varias semanas de práctica, el historial empieza a decirme algo. Veo dónde se concentran los fallos y si faltaba conocimiento, confundí una regla o fue un despiste.”
- **Transición:** pulsa la pestaña **Reading & Use of English**.

### Escena 6 · 01:22–01:34 · Un porcentaje que se puede comprobar

- **Inicio:** matriz **Precisión por part y semana**.
- **Acción:** pulsa la celda **100 % / 8/8 de P3** de la semana actual. Deja visible **Part 3 · 100 %**, «8/8 aciertos en 1 sesión» y la sesión Word formation lab.
- **Foco:** la progresión 5/8 → 6/8 → 7/8 → 8/8 y el denominador de la última celda.
- **Mensaje:** ver la evolución de la práctica, con la muestra que hay detrás.
- **Recordly:** general. Sin auto zoom ni anotación; conserva matriz y detalle en el mismo plano.
- **Cursor:** clic en 8/8 y reposo en el espacio libre bajo la matriz.
- **Pausa:** 4 s tras seleccionar la celda.
- **Voz EN:** “Progress stays attached to real attempts. Eight out of eight is one practice session, not a prediction of an exam result.”
- **Voz ES:** “El progreso conserva su contexto. Ocho aciertos de ocho son una sesión de práctica, no una predicción de la nota del examen.”
- **Transición:** pulsa **Resumen**. No abras la sesión de la celda.

### Escena 7 · 01:34–01:44 · Saber qué hacer después

- **Inicio:** Progreso → Resumen, recomendación principal.
- **Acción:** reposo sobre **Dedica una sesión a tus tarjetas pendientes de Anki** y su evidencia. No pulses Ver pendientes en la demo principal: el siguiente trabajo queda claro sin cambiar de contexto.
- **Foco:** una acción para esta semana; 0 de 25 errores elegibles convertidos en tarjeta.
- **Mensaje:** la práctica termina en un siguiente paso concreto, no en una cifra decorativa.
- **Recordly:** **zoom manual 3**, 1,2×–1,3×, centrado en título + evidencia de 01:36 a 01:44. Cursor en el margen inferior derecho del bloque, quieto. Caption de cierre en el padding: **“Turn mistakes into your next study step.”** / **“Convierte tus errores en tu siguiente paso.”**
- **Pausa:** 3 s finales con la acción completamente legible. No cortes la última palabra.
- **Voz EN:** “And the next step is clear: turn the pending mistakes into review cards. Error Log. Turn your mistakes into your next study step.”
- **Voz ES:** “Y el siguiente paso está claro: convertir los errores pendientes en tarjetas de repaso. Error Log. Tus errores, convertidos en tu siguiente paso.”
- **Transición:** final limpio; trim de la parada de grabación. Sin pantalla de configuración ni outro largo.

## 5. Narración completa

Lee con voz tranquila, sin énfasis publicitario. Graba la voz después del ensayo de pantalla y deja silencios de lectura. No intentes rellenar los 104 segundos hablando. Si una versión necesita más aire, se permite llegar a 110 s manteniendo los mismos siete momentos.

### English

You correct an exercise. Two weeks later, you make the same mistake. Practising more isn't the whole answer.

Error Log keeps what practice usually leaves behind. Bring in a corrected session, with its results and mistakes, in one batch.

Keep the correction, but also the reason. Here, I chose “made” with confidence. The useful lesson is the whole phrase: “carry out research”.

Now I connect that mistake to the exact section of my notebook. The explanation and my own examples stay together. When this pattern comes back, I have somewhere useful to return.

Across several weeks, the history becomes easier to read. I can see where errors cluster, and whether I was unsure, confused, or simply careless.

Progress stays attached to real attempts. Eight out of eight is one practice session, not a prediction of an exam result.

And the next step is clear: turn the pending mistakes into review cards. Error Log. Turn your mistakes into your next study step.

### Español

Corriges un ejercicio. Dos semanas después, vuelves a cometer el mismo error. Practicar más no siempre basta.

Error Log conserva lo que suele perderse después de practicar. Importas una sesión corregida, con sus resultados y sus errores, en una sola tanda.

Guardas la corrección, pero también el motivo. Aquí elegí “made” convencido. Lo que necesito recordar es la expresión completa: “carry out research”.

Ahora conecto ese fallo con el apartado exacto de mi cuaderno. La explicación y mis propios ejemplos quedan juntos. Cuando vuelve a aparecer, tengo un lugar útil al que regresar.

Con varias semanas de práctica, el historial empieza a decirme algo. Veo dónde se concentran los fallos y si faltaba conocimiento, confundí una regla o fue un despiste.

El progreso conserva su contexto. Ocho aciertos de ocho son una sesión de práctica, no una predicción de la nota del examen.

Y el siguiente paso está claro: convertir los errores pendientes en tarjetas de repaso. Error Log. Tus errores, convertidos en tu siguiente paso.

## Recordly setup

Los valores siguientes son una **dirección de arte propuesta**, no un preset importado ni ajustes ya aplicados a tu instalación. Parte del preset **Focused**, como has indicado, si está disponible en tu versión. No he verificado sus valores internos. Ajusta buscando estas sensaciones, sin asumir que todos los controles usan las mismas unidades.

La documentación del [repositorio oficial de Recordly](https://github.com/webadderallorg/Recordly#core-features) confirma zooms manuales, controles de cursor, edición por regiones, padding, esquinas, sombras y exportación MP4. La disponibilidad y los nombres de presets/captions dependen de la versión instalada.

| Ajuste | Propuesta |
| --- | --- |
| Captura | Solo ventana de Error Log; contenido 1920 × 1080; sin webcam, notificaciones ni audio del sistema |
| Lienzo/exportación | 16:9; MP4 1920 × 1080 de alta calidad. 60 fps si la captura es fluida; si no, 30 fps estables |
| Fondo | Color sólido `#ecedea`, tomado de la superficie secundaria del producto; sin wallpaper ni degradado llamativo |
| Padding | Aproximadamente 48 px en el lienzo 1080p. Revisa que al reducir la ventana los textos sigan legibles |
| Esquinas | Radio visual de unos 12 px |
| Sombra | Negra muy suave, opacidad aparente 10–12 %, desenfoque ~24 px; apenas separar la ventana del fondo |
| Movimiento | Focused como punto de partida; transiciones contenidas de aproximadamente 0,45–0,65 s, sin sobrepasar el destino ni rebote de cámara |
| Cursor | 1,15×–1,2×, smoothing activado moderado; que llegue al botón antes del clic |
| Motion blur | Sutil: solo durante desplazamientos, nunca convertir letras en una estela |
| Click bounce | Mínimo perceptible; sin sonido, ondas grandes ni efectos juguetones |
| Zooms | Solo los tres manuales del guion, 1,2×–1,3×; centro fijo en contenido, sin perseguir el ratón |
| Voz | Clara y cercana; nivel consistente; música opcional casi imperceptible o ninguna |

**Manual zoom:** corrección/clasificación, explicación del Notebook y acción final. Conserva siempre la pareja respuesta/corrección completa y el denominador de cualquier cifra que destaques.

**Auto zoom:** desactivado para la toma principal. Úsalo, como mucho, para proponer posiciones durante un borrador; revisa y elimina los que sigan al cursor entre controles. No superpongas regiones automáticas y manuales.

**Annotation:** solo el hook o una relación difícil de ver. Una anotación por momento; sin flechas redundantes sobre botones evidentes. Son edición de vídeo, nunca capacidades añadidas a la app.

**Caption:** subtítulos de la narración en una o dos líneas, sin efecto palabra a palabra. Sitúalos en una banda reservada del marco; verifica que no cubran Guardar, la regla ni evidencia. Revisa manualmente “carry out research”, “Anki” y “Reading & Use of English”. Si tu versión no ofrece captions, añade texto por regiones o subtítulos en el editor final; no cambies la app.

**Speed region:** prescindible. Solo para un tramo mecánico claramente separable, máximo ~1,25×. Nunca acelerar regla, confianza, números, lectura del apunte ni la acción final. Un trim de espera suele quedar mejor.

**Trim:** elimina el arranque/parada de Recordly, el cambio a terminal, esperas vacías y movimientos de preparación. Conserva las pausas marcadas y aproximadamente medio segundo de estabilidad después de cada navegación. No encadenes pantallas como si el guardado hubiera sido instantáneo si no lo fue.

Antes de la toma completa, exporta 10 s de prueba con texto pequeño y un zoom. Comprueba fluidez, cursor y legibilidad del archivo exportado; el preview de Recordly no sustituye esta comprobación. Guarda el proyecto como `error-log-c1-launch.recordly` y exporta versiones EN/ES por separado.

## 6. Teaser vertical — 26 segundos

Es una edición independiente derivada de la misma toma. No grabes el producto en móvil para forzar el recorte. El diseño de escritorio reparte información entre columnas; un recorte central automático perdería el detalle del error.

| Tiempo vertical | Material de la toma principal | Encuadre / texto |
| --- | --- | --- |
| 00–05 | Escena 3, respuesta/corrección | Recorte del par `made` → `carried out`; “The same mistake. Again.” |
| 05–12 | Escena 4, Research | Recorte del folio, con regla y ejemplo; “Keep the reason.” |
| 12–20 | Escena 7, recomendación | Mantén título + evidencia; “Choose your next study step.” |
| 20–26 | Fotograma estable del cierre | Error Log C1 y CTA editorial “See the full demo” / “Ver demo completa” |

Lienzo 1080 × 1920, fondo neutro. Si el título completo de la recomendación no cabe con una tipografía legible, coloca el bloque horizontal como inserto sobre el fondo en lugar de cortar palabras. No uses el 100 % como gancho: fuera de su 8/8 sería engañoso. Omite el JSON, la búsqueda y la matriz. Reencuadra cada escena individualmente y prueba en un teléfono. El 16:9 sigue siendo el archivo principal para README, portfolio, LinkedIn y landing.

## 7. Verificación y checklist final

El recorrido automatizado está en `demo-e2e/recording.spec.ts` y usa la aplicación compilada, sin mock de acciones ni de Anki, en el puerto 3212. Ejecuta dos tomas sobre bases nuevas y contextos de navegador limpios:

```powershell
pnpm demo:record:build
pnpm demo:verify
pnpm typecheck
pnpm lint
pnpm exec vitest run --coverage --maxWorkers=2 --testTimeout=60000 --hookTimeout=30000
```

La verificación comprueba importación por UI, confianza guardada, vínculo a Research, dos errores relacionados, cifras 14/90/26, recomendación 0/25, celda 8/8 y regreso al cierre. Captura errores de consola, excepciones de página, respuestas HTTP fallidas y desbordamiento horizontal. Los PNG se guardan en `test-results/recording-Recordly-story-fresh-take-1/` y en la carpeta equivalente de la segunda toma. El test no mide el ritmo de la voz ni sustituye el ensayo humano de Recordly.

**Resultado de la verificación (1 de octubre de 2026):** build de grabación, TypeScript y ESLint correctos; 851 tests unitarios pasan y cobertura global de líneas 99,46 % / ramas 92,4 %. Las pruebas grandes de Notebook agotaron inicialmente sus límites de tiempo; con dos workers y el margen indicado arriba pasan sin cambiar su implementación ni los umbrales de cobertura. Dos recorridos de navegador completos pasan sobre bases distintas, sin errores de consola, excepciones ni respuestas HTTP fallidas.

**Revisión visual:** se descartó 1600 × 900 por el espacio justo en revisión y enlaces. A 1920 × 1080, revisión, guardado, matriz y recomendación son legibles; el apunte se abrevia para mostrar también los dos errores relacionados. El historial y Progreso continúan naturalmente bajo el pliegue: en esta toma se leen solo los bloques señalados, y la evolución se abre desde la pestaña superior. El selector de apuntes requiere los desplazamientos previstos en la escena 4. No se ha probado una exportación desde tu instalación de Recordly; la prueba de 10 s sigue siendo el último paso antes de grabar.

Antes de pulsar Record:

- [ ] Servidor de grabación en 3002; 23 errores y panel histórico abiertos.
- [ ] Portapapeles actualizado, ventana privada nueva, sin aviso de borrador recuperable.
- [ ] Viewport y navegador coinciden con el encuadre probado; cursor y zoom del navegador estables.
- [ ] El texto «Demo con datos inventados» se conserva visible en planos generales.
- [ ] Se entiende que la práctica y la corrección se hicieron fuera de la app.
- [ ] Se ve el cambio de Confianza a Seguro y el guardado real.
- [ ] El vínculo se crea antes de abrir el apunte; no presentar vinculación automática.
- [ ] Las cifras y el denominador 8/8 están completos; sin proclamaciones de dominio C1.
- [ ] Terminas con la acción y dejas 3 s de aire.
- [ ] Has exportado y revisado 10 s de prueba en Recordly.

Para publicar después: usa MP4 como pieza principal y una imagen de portada legible del bloque de recomendación. Lo que se grabó y cómo se publicó está en la sección 8.

## 8. Grabación del 1 de octubre de 2026

Master horizontal grabado y exportado en inglés y español: 1920 × 1080, 60 fps, **1:51**. Es la
segunda versión del día; la primera (1:27, sin Notebook editado ni Anki) se conserva como
`error-log-demo-1080p-v1.mp4`. Cambios respecto al guion:

- **Sin voz.** No había micrófono ni una voz sintética de calidad. Los subtítulos reproducen la
  narración en bloques de una línea y conservan sus tiempos para grabarla después.
- **Viewport 1600 × 900** en lugar de 1920 × 1080: el texto sale un 20 % más grande en el vídeo.
  Revisión, guardado, selector de apuntes, matriz y recomendación caben sin cortes.
- **Escena 4, apunte con mis palabras.** Tras leer el apunte: Editar → una línea bajo Research
  («Mi error (1 oct): *made research* → **carry out research**.») → «Guardado» → volver a la
  lectura, con la línea nueva y los dos errores relacionados en pantalla.
- **Escena 7, la tarjeta de verdad.** Tras la recomendación: Ver pendientes → `carried out` del
  1 oct → vista previa de la tarjeta → Crear en Anki → «Tarjeta «carried out» creada y verificada
  en Anki». Plano de Anki (resumen del mazo, anverso, reverso con la regla) y vuelta a Progreso,
  que ya dice **1 de 25** y 24 pendientes. Así el vídeo termina con la acción hecha, no solo
  propuesta. Sustituye a «No pulses Ver pendientes» y a «No abras Anki» de las secciones 1 y 4.
- **Anki aislado.** No se toca la colección personal: un Anki aparte (`-b C:\tmp\error-log-demo-anki`,
  perfil «Error Log demo», sin AnkiWeb) y una opción nueva de la app solo para la grabación:
  `ERRORLOG_RECORDING_ANKI_URL` + `ERRORLOG_RECORDING_ANKI_PROFILE` (ver [docs/ANKI.md](docs/ANKI.md)).
  Con otro perfil abierto, la app lo da por no disponible y no escribe nada.
- **Cuatro zooms manuales a 1,25×:** revisión (confianza y regla), la línea escrita, el apunte con
  sus errores y la recomendación. La tarjeta de Anki no lo necesita: su texto ya es grande.
- **Tres recortes invisibles** en pausas quietas (lectura del apunte, Progreso y primera vista de
  la recomendación), 3,2 s en total, para quedar en ~110 s sin acelerar nada.
- **Anotación «← The same mistake, again»**, en dos líneas, en el margen derecho del panel.
- **Preset Smooth** en lugar de Focused (Focused arranca los zooms de golpe), fondo `#dedcd4`
  (`#ecedea` apenas se distingue del papel de la app) y subtítulos en una banda bajo el marco.
- **Narración de las partes nuevas** (subtítulos):
  - EN: “The explanation and my own examples stay together. I add the mistake in my own words.” ·
    “Each card keeps the question, my answer and the rule. One click, and it’s created and
    checked in Anki. Now it comes back for spaced review until ‘carry out research’ comes
    naturally.”
  - ES: «La explicación y mis propios ejemplos quedan juntos. Y apunto el error con mis
    palabras.» · «Cada tarjeta guarda la pregunta, mi respuesta y la regla. Un clic, y queda
    creada y comprobada en Anki. Ahora vuelve en repaso espaciado hasta que “carry out research”
    salga solo.»
  - Escena 5, EN: “…whether I didn’t know, mixed something up, or was careless”, más fiel a
    Desconocimiento · Confusión · Despiste que “unsure, confused”.
- **Publicación (2 de octubre).** Copias de 9 MB para GitHub, a 30 fps y en dos pasadas
  ([docs/DEMO.md](docs/DEMO.md#vídeo-completo)): `error-log-demo-github-es.mp4` y `-en.mp4`.
  El README reproducía la española y enlazaba la inglesa, bajo la animación de 57 s. Desde su
  rediseño en inglés (el mismo día), la cabecera es una miniatura de esta toma que enlaza con
  la versión inglesa, con un enlace aparte a la española
  ([cambiar el vídeo](docs/DEMO.md#cambiar-el-vídeo-del-readme)).
