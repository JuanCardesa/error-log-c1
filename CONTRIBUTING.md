# Cómo se trabaja en este repo

## Ramas

```
main                 solo releases. Se toca al cerrar una fase, nunca antes.
└── develop          rama de trabajo por defecto. Todo sale y vuelve aquí.
    └── feature/<slug>   una por unidad de trabajo
```

- Todo cambio entra por `feature/<slug>` → PR a `develop`. Nunca commits directos a
  `develop` ni a `main`.
- `develop` → `main` solo al cerrar una fase, y con tag `v0.x`.
- El PR no se mergea si CI está en rojo.

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

Es exactamente lo que corre CI. Si pasa en local, pasa allí.

Para la cobertura de `src/lib/` (umbral 90%, ver `vitest.config.ts`):

```bash
pnpm test:coverage
```

## Reglas que el linter no puede comprobar

- **Cero `any` y cero `@ts-ignore`.** ESLint los marca como error y CI además hace un grep
  final. Si un tipo se resiste, el arreglo es modelar mejor, no silenciar.
- **`src/lib/` es puro.** Nada de `new Date()` ahí dentro: el reloj se inyecta como
  parámetro `now`. Si una función de `src/lib/` toca el disco, la red o el reloj, está en
  la carpeta equivocada.
- **Los umbrales y los enums no se tocan** sin cambiar antes `docs/SPEC.md`. Son el
  contrato del producto, no detalles de implementación. Viven en `src/lib/domain/`.

## Base de datos

`data/errorlog.db` está fuera de git. El backup es copiar el fichero.

```bash
pnpm db:generate   # nueva migración a partir del schema
pnpm db:migrate    # aplicarlas
pnpm db:seed       # datos de ejemplo
```

Las migraciones de `drizzle/` son versionadas y se commitean. No se editan a mano una vez
aplicadas: se añade una nueva encima.
