# Error Log C1

Registro de errores para la preparación del Cambridge C1 Advanced. No es un CRUD de
fallos: clasifica cada error por **causa** (qué falló: conocimiento, despiste, formato,
tiempo…) sobre el **denominador** de ítems intentados, y un motor de siete reglas
convierte esas cifras en **una acción concreta para la semana**.

Local, monousuario, SQLite en un fichero. El backup es copiar `data/errorlog.db`.

```bash
pnpm install
pnpm db:migrate     # crea ./data/errorlog.db
pnpm dev            # http://localhost:3000
```

Documentación: [`docs/SPEC.md`](docs/SPEC.md) (qué se construye) ·
[`docs/PLAN.md`](docs/PLAN.md) (cómo y en qué orden) ·
[`CONTRIBUTING.md`](CONTRIBUTING.md) (flujo de ramas).
