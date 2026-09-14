# Error Log C1 — plan de implementación

Estado: **aprobado el 2026-09-14.** Las cuatro decisiones abiertas se resolvieron por la
recomendación de cada una, y las dependencias quedaron autorizadas.

Acompaña a [`SPEC.md`](SPEC.md), que es el qué. Esto es el cómo y el en-qué-orden.

---

## 0. Decisiones tomadas

Cinco cuestiones. **P1–P4 resueltas por la opción recomendada** (confirmadas 2026-09-14);
se dejan escritas con su porqué porque cada una condiciona código que ya está escrito.
P5 sigue abierta y es externa.

| # | decisión | efecto |
|---|---|---|
| P1 | `UNIQUE(session_id)` en `writing_piece` | una pieza por sesión; Q6 puede atribuir errores |
| P2 | Q4 y regla 2 clavadas a 30 días | el conmutador 30/60 no las toca |
| P3 | regla 5 se mide solo sobre sesiones cronometradas | `n/a` si no hay ninguna en la ventana |
| P4 | `kind = WRITING` → `paper = WRITING` (implicación, no ⟺) | el Writing de un `SIMULACRO` se puede registrar |

### P1 · Q6: a qué texto pertenece un error (bloquea Fase 5)

`error_row` cuelga de `session_id`, no de `writing_piece_id`. `writing_piece` también
cuelga de `session_id`. Para Q6 («de los errores del texto original, cuántos reaparecen en
su rewrite») hay que ir *pieza → sesión → errores*, y eso **solo es correcto si una sesión
tiene exactamente una `writing_piece`**. Nada en §2 lo garantiza: si una sesión tiene el
original y su reescritura, los errores de ambos caen en el mismo saco y Q6 mide ruido.

§9 prohíbe inventar campos, así que no añado `error_row.writing_piece_id` por mi cuenta.
Opciones:

- **(a)** `UNIQUE(session_id)` en `writing_piece`: una pieza por sesión, la reescritura es
  su propia sesión. No toca §2, solo añade una constraint. **Es la que recomiendo.**
- **(b)** Añadir `error_row.writing_piece_id` nullable. Más exacto, pero es un campo nuevo.

### P2 · La ventana de 30/60 días contra los umbrales fijos (bloquea Fase 1 y 2)

§4 abre con «ventana por defecto 30 días, conmutable a 60» para las seis queries, pero Q4
dice «últimos 30 días» y la regla 2 dice «≥ 5 en 30 d». Si el usuario pone la ventana en
60, ¿Q4 y la regla 2 siguen mirando 30?

El problema no es de estilo: la regla 2 es un **conteo absoluto** calibrado para 30 días.
Si la ventana pasa a 60 y el umbral sigue en 5, se dispara con la mitad de intensidad real.

- **(a)** Q4 y regla 2 siguen la ventana activa, umbral 5 fijo. Simple, pero el umbral se
  ablanda a 60 días.
- **(b)** Q4 y regla 2 quedan clavadas a 30 días siempre, ignorando el conmutador. Respeta
  la calibración; el informe mezcla dos ventanas. **Es la que recomiendo** — el texto de
  ambas dice «30 d» explícitamente.

### P3 · Regla 5: el denominador (bloquea Fase 2)

«Errores con `late_in_session = 1` (solo sesiones `timed`) > 35%». ¿Porcentaje sobre qué?

- **(a)** Sobre **todos** los errores de la ventana. Entonces una persona que casi nunca
  cronometra nunca llega al 35% y la regla queda muerta.
- **(b)** Sobre los errores **de sesiones cronometradas** únicamente — el paréntesis
  restringe el universo entero, no solo el numerador. Mide fatiga dentro de las sesiones
  donde el dato significa algo (§3.4 del spec original: «si no hubo cronómetro, el dato no
  significa nada»). **Es la que recomiendo.** Si no hay ninguna sesión cronometrada en la
  ventana, la regla es `n/a`.

### P4 · `kind = WRITING` ⟺ `paper = WRITING` deja fuera el simulacro completo

El bicondicional de §2 implica que una sesión con `paper = WRITING` **solo** puede tener
`kind = WRITING`. Es decir: no se puede registrar el Writing de un `SIMULACRO` ni de una
`CLASE`. El spec original describía un simulacro como cuatro sesiones, una por paper —
con este invariante, la del Writing no se puede dar de alta como `SIMULACRO`.

- **(a)** Dejar el ⟺ literal tal como está escrito. Se pierde el Writing dentro de un
  simulacro.
- **(b)** Relajarlo a una implicación: `kind = WRITING` → `paper = WRITING`, y que
  `paper = WRITING` admita cualquier `kind`. `items_total` sigue siendo nullable cuando
  `paper = WRITING`, que es lo que de verdad hace falta. **Es la que recomiendo.**

Cambiar esto es alterar un invariante de §2, así que no lo toco sin respuesta.

### P5 · `Error Log C1.dc.html` no se ha podido descargar

La referencia visual vive en el proyecto de Claude Design
`f56fdcf6-a9e2-4818-b12a-2d26d4a6a327`. El MCP exige autorización de design-system y el
flujo `/design-login` no se puede completar en una sesión no interactiva.

Lo que hace falta, cualquiera de estas: ejecutar `/design-login` una vez desde una sesión
interactiva de Claude Code en esta máquina (después las sesiones headless reutilizan la
autorización), o exportar el `.dc.html` y dejarlo en `docs/reference/`.

`support.js` sí se localizó, pero es el runtime genérico de Claude Design (`dc-runtime`),
no contenido del diseño: no aporta nada a la reimplementación.

**Esto no bloquea las Fases 1 y 2**, que no tienen UI. Bloquea la Fase 3 en adelante si
para entonces no está el fichero. Sin él, las Fases 3–6 se harían contra la descripción
escrita de §6 (densidad alta, monoespaciada para datos, chips `study` azul / `exec` rojo,
fondo hueso), que es bastante menos preciso que el prototipo.

---

## 1. Dependencias a aprobar

§9 pide autorización para cualquier dependencia no listada en §1. Estas son todas las que
pienso instalar; las marcadas **(+)** no aparecen en el briefing y necesitan el visto bueno.

**Producción**

| paquete | por qué |
|---|---|
| `next`, `react`, `react-dom` | el stack de §1 |
| `drizzle-orm` | §1 |
| `zod` | §1 |
| `better-sqlite3` **(+)** | Drizzle no habla con SQLite sin driver. Síncrono, prebuilds oficiales, es el driver de referencia de Drizzle para SQLite local |

**Desarrollo**

| paquete | por qué |
|---|---|
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom` | §1, modo strict |
| `drizzle-kit` **(+)** | genera y aplica las migraciones versionadas de `/drizzle` que pide §1 |
| `@types/better-sqlite3` **(+)** | sin él no hay forma de tipar el driver sin `any`, y §8 exige cero `any` |
| `vitest` | §1 |
| `@vitest/coverage-v8` **(+)** | §8 exige >90% de cobertura en `/src/lib/`; hay que poder medirla |
| `@playwright/test` | §1 |
| `eslint`, `eslint-config-next`, `typescript-eslint` **(+)** | §8 exige `pnpm lint` en verde; hace falta un linter |

Nada más. Sin librería de componentes (§1), sin librería de fechas (la semana ISO de Q3
son doce líneas propias), sin librería de CSV (el escapado de comillas es de manual y va
con test).

---

## 2. Decisiones técnicas

**Las queries son funciones puras sobre datos en memoria, no SQL.** §4 dice «función pura
con fixtures deterministas», y una función que abre una conexión no es pura ni testeable
con fixtures. La separación:

```
src/lib/db/          acceso a datos: Drizzle, carga filas crudas
src/lib/queries/     Q1–Q6: (rows, options) => resultado    ← puro, testeado
src/lib/rules/       motor de reglas: (resultados) => estados ← puro, testeado
src/lib/csv/         serialización CSV                       ← puro, testeado
```

La carga es un `SELECT` ancho por ventana; el volumen de una herramienta personal
(centenares de filas al año) no justifica empujar la agregación a SQL, y a cambio se gana
que toda la lógica de negocio sea testeable sin base de datos. Es lo que permite el >90%
de cobertura de §8 sin montar fixtures de SQLite.

**El reloj se inyecta.** Toda función que dependa de «hoy» recibe `now: Date` como
parámetro. Sin esto los tests de ventana caducan y la suite empieza a fallar sola. Ningún
`new Date()` dentro de `src/lib/`.

**Semana ISO 8601 propia para Q3.** `strftime('%W')` de SQLite no es ISO (no cuadra en el
cambio de año). Se implementa y se testea contra los casos frontera conocidos
(2026-01-01, 2024-12-30).

**Estilos: CSS Modules + un fichero de tokens.** §1 deja elegir. El prototipo es una UI
densa de datos con una paleta muy concreta; CSS Modules da control exacto sin pelear con
utilidades ni añadir configuración. Los tokens (`--c-study`, `--c-exec`, fondo hueso,
familia monoespaciada) salen del `.dc.html` en cuanto esté disponible.

**Los invariantes se escriben dos veces, a propósito.** §2 los pide en Zod y en constraints
de DB. Un único módulo `src/lib/domain/` exporta los enums, `MIN_N`, los umbrales y los
máximos de `part`; Zod y el schema Drizzle lo consumen. La duplicación es de *mecanismo*
(validación de entrada vs. integridad en reposo), no de valores.

---

## 3. Secuencia de trabajo

### Fase 0 — `feature/toolchain-and-ci` (no estaba en §7; ver nota)

`package.json` con los cuatro scripts, `tsconfig` strict, ESLint, Vitest, el workflow de CI
y `CONTRIBUTING.md`.

**Nota de secuencia:** §0.7 pide un CI que ejecute `typecheck`, `lint`, `test` y `build`, y
§0.3 deja esos ficheros fuera del commit inicial. Pero un workflow que corra esos cuatro
scripts antes de que exista `package.json` falla en el primer push, y §0.7 dice que un PR
con CI en rojo no se mergea. Por eso el CI entra junto con el andamiaje que lo hace verde,
no antes. Es la única desviación del orden literal de §0, y es para cumplir §0.7, no para
saltárselo.

### Fase 1 — `feature/schema-and-core` → `v0.1`

Schema Drizzle y migración inicial · esquemas Zod con los invariantes de §2 · seed realista
(unas 12 sesiones y 40 errores, incluida **una sesión con cero errores** para probar que
cuenta en el denominador) · Q1–Q6 puras con tests y fixtures · CSV con test de escapado.
Sin UI.

Commits previstos: `feat(db): schema`, `feat(db): migración inicial`,
`feat(domain): enums y umbrales`, `feat(validation): esquemas zod`, `feat(db): seed`,
`feat(queries): Q1…`, `test(queries): …`, `feat(csv): serializador`.

### Fase 2 — `feature/rules-engine` → `v0.2`

Las siete reglas, la guarda `MIN_N`, los umbrales WATCH y el desempate por prioridad
`[4,0,1,2,3,5,6]`. Tests: cada regla en sus cuatro estados, la guarda, y el caso de tres
reglas disparadas a la vez comprobando que sale exactamente un `DO NOW`.

### Fase 3 — `feature/capture-ui` → `v0.3`

Vista Registrar, variantes grid y card, validación de cabecera antes de aceptar errores,
autocompletado de `category`/`subcategory`, `late_in_session` deshabilitado si la sesión no
es `timed`, aviso al intentar marcar Anki en una causa que no genera tarjeta.

El requisito rector del spec original sigue vigente: **dar de alta un error por debajo de
30 segundos.** Todo por teclado, defaults agresivos, sin ratón.

### Fase 4 — `feature/report-views` → `v0.4`

Informe (Q1, Q2, Q5 + tabla de reglas con el `DO NOW` destacado), RUOE (Q3), Anki
(cola + sellado de `anki_added_at`), Falsas certezas (Q4). CRUD completo de sesiones y
filas, con confirmación en los borrados.

### Fase 5 — `feature/writing-and-export` → `v0.5`

`writing_piece` con las cuatro bandas, Q6, vista Exportar (un CSV por query + dump JSON).
Depende de **P1**.

### Fase 6 — `feature/polish` → `v1.0`

Dos flujos e2e en Playwright (alta de sesión + volcado de errores; informe que enseña un
`DO NOW`), README con capturas, recorrido de teclado y foco visible.

---

## 4. Supuestos que aplico salvo que digas lo contrario

No bloquean, pero los dejo escritos porque son decisiones con consecuencias:

1. **Q5 con denominador cero** (ninguna causa que genere tarjeta en la ventana) devuelve
   `n/a`, y la regla 4 queda `n/a`. La alternativa —tratar 0/0 como 0%— dispararía el
   `DO NOW` de máxima prioridad en una base de datos vacía.
2. **Q5 se calcula dentro de la ventana activa**, como las otras cinco. En el spec original
   no tenía filtro de fecha; §4 del briefing mete las seis bajo la misma ventana.
3. **La guarda `MIN_N` se mide sobre el denominador propio de cada regla**, no sobre el
   total global. Para la regla 5 con el criterio (b) de P3, eso significa 15 errores en
   sesiones cronometradas.
4. **Las sesiones `OPEN` cuentan en las queries** igual que las cerradas. `status` es un
   estado de captura, no un filtro analítico; si no, una sesión que se olvidó abierta
   desaparece del denominador y las tasas mienten al alza.
5. **`.nvmrc` fija Node 22** (LTS en mantenimiento, con prebuilds sólidos de
   `better-sqlite3`). En la máquina hay Node 23.7.0, que está fuera de soporte por ser
   rama impar. CI corre sobre 22.
6. **`docs/reference/` queda creado y vacío** a la espera del `.dc.html` (P5).

---

## 5. Cómo se verifica que está terminado

Además de los cuatro scripts de §8 en verde y >90% de cobertura en `src/lib/`:

- Un test que recorre todas las combinaciones de reglas disparadas y afirma que
  `DO NOW` aparece **como máximo una vez**. No un caso de ejemplo: la propiedad.
- Un test que afirma que ninguna regla de porcentaje cambia de estado al cruzar su umbral
  con n < `MIN_N`.
- `grep` en CI de `any` y `@ts-ignore` en `src/`, que falla si aparecen. §8 los prohíbe y
  un lint mal configurado los deja pasar en silencio.
- Una sesión con cero errores en el seed, y un test que comprueba que aparece en el
  denominador de Q2 y de Q3.
