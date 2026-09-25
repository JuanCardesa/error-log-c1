# Cómo se trabaja en este repo

## Ramas

```
main                 solo releases. Se toca al cerrar una fase, nunca antes.
└── develop          rama de trabajo por defecto. Todo sale y vuelve aquí.
    └── feature/<slug>   una por unidad de trabajo
```

- Todo cambio entra por `feature/<slug>` → PR a `develop`. Nunca commits directos a
  `develop` ni a `main`.
- `develop` → `main` solo al cerrar una versión, y con su tag `vX.Y`.
- El PR no se mergea si CI está en rojo.

## Publicar una versión

La versión mayor sube cuando cambia el modelo de datos o se retira algo; la menor, con
funciones nuevas compatibles.

1. En una `feature/`, subir `version` en `package.json` a `X.Y.0` y pasar la entrada de
   [CHANGELOG.md](CHANGELOG.md) de «pendiente de publicar» a la fecha del día. PR a `develop`.
2. Con CI en verde, **merge local** de `develop` en `main`. No con el botón de GitHub: su
   mensaje por defecto rompe el patrón y la versión se queda sin tag.

```bash
git checkout main && git pull
git merge --no-ff develop -m "chore(release): vX.Y — resumen en una línea"
git tag -a vX.Y -m "vX.Y: qué aporta"
git push origin main vX.Y
gh release create vX.Y --title "vX.Y" --notes-file <(sed -n '/^## \[X.Y\]/,/^## \[/p' CHANGELOG.md | sed '$d')
```

El número de `package.json` y el del tag coinciden siempre.

```bash
git checkout develop && git pull
git checkout -b feature/lo-que-sea
# ... trabajo ...
gh pr create --base develop
```

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). Un commit por unidad lógica
— no un commit gigante por fase.

`feat:` · `fix:` · `test:` · `chore:` · `docs:` · `refactor:`

El ámbito es opcional pero ayuda: `feat(queries): Q2 normalizada por ítems`.

## Antes de abrir el PR

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

CI ejecuta esos controles en Node 22 y tambien los flujos end-to-end.

Para la cobertura de `src/lib/` (umbral 90%, ver `vitest.config.ts`):

```bash
pnpm test:coverage
```

## Reglas que el linter no puede comprobar

- **Cero `any` y cero `@ts-ignore`.** ESLint los marca como error y CI además hace un grep
  final. Si un tipo se resiste, el arreglo es modelar mejor, no silenciar.
- **La lógica de dominio, consultas y reglas es pura.** El reloj se inyecta como
  parámetro `now`. `src/lib/db/` contiene los adaptadores de SQLite y fichero;
  los puntos de entrada `*.run.ts` leen el reloj y el entorno.
- **Los umbrales y los enums no se tocan** sin cambiar antes `docs/SPEC.md`. Son el
  contrato del producto, no detalles de implementación. Viven en `src/lib/domain/`.

## Base de datos

`data/errorlog.db` está fuera de git. La base usa WAL: no se copia el fichero a mano
con la app abierta. Usa la API de backup de SQLite mediante los comandos siguientes.

```bash
pnpm db:generate   # nueva migración a partir del schema
pnpm db:migrate    # aplicarlas; copia previa automatica si la base ya tenia datos
pnpm db:seed       # solo sobre una base vacia; nunca borra filas
pnpm demo          # ejemplos en una base nueva y separada, puerto 3001
pnpm db:backup     # copia consistente y verificada en data/backups/
pnpm db:restore data/backups/copia.db data/restored.db  # exige un destino nuevo
```

Las migraciones de `drizzle/` son versionadas y se commitean. No se editan a mano una vez
aplicadas: se añade una nueva encima.

Los pasos para activar una base restaurada estan en [README.md](README.md#copias-y-recuperación).
Los tests de backup y demo crean sus propias bases temporales.
