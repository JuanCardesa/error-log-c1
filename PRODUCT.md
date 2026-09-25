# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Una sola persona: Juan, estudiante que prepara el Cambridge C1 Advanced. Registra a
diario los errores de su práctica y repasa con Anki. Trabaja en escritorio (portátil o
monitor), con el libro o el curso de Macmillan abierto al lado; el móvil tiene que
funcionar, pero no es donde se registra.

Valora, por este orden: rapidez al registrar, poco ruido visual y datos legibles. Es
el autor de la herramienta y conoce su taxonomía (causas, categorías, reglas), así que
no necesita que la interfaz se la explique en cada pantalla.

## Product Purpose

Convertir los errores de práctica del C1 en un plan concreto de estudio. La app guarda
qué falló y por qué, normaliza por ítems intentados, y un motor de siete reglas elige
**una sola acción para la semana**. Cierra el ciclo con Anki: los errores que se
arreglan estudiando se convierten en tarjetas verificadas, y los repasos vuelven a la
app como fallos por categoría.

Éxito diario: volcar la tanda de hoy en segundos y sin errores de transcripción.
Éxito semanal: abrir el informe y saber qué estudiar sin interpretar tablas.

## Positioning

No es un cuaderno de errores genérico. La sesión es el denominador (sin ella las tasas
mienten), la causa separa lo que se arregla estudiando de lo que se arregla ejecutando
mejor, y las reglas con muestra mínima deciden una acción en lugar de enseñar un
dashboard. La conversión a Anki solo se sella cuando la tarjeta existe y está verificada.

## Operating Context

- **Entrada principal:** pegar la tanda de Macmillan («Copiar tanda» del capturador
  `tools/macmillan-capture`) en Sesiones (`/registrar`), revisar la cabecera propuesta y los
  errores, y guardar todo en una transacción. Le siguen la captura uno a uno por
  teclado y el pegado de varios errores (JSON preparado con IA o celdas de una hoja).
- **Ritual semanal:** Progreso (la recomendación de la semana), luego Anki (pendientes,
  convertidas y repasos), la matriz de Reading & Use of English y Falsas certezas.
- **Consulta:** Errores (`/errores`) y la búsqueda Ctrl/⌘+K encuentran un fallo sin
  recordar su sesión.
- **Anki** corre en el mismo equipo con AnkiConnect; puede estar cerrado, y la app
  tiene que decirlo y seguir siendo útil.
- Uso local y monousuario en `127.0.0.1`, sin cuenta. `pnpm demo` levanta una base
  desechable con datos inventados.

## Capabilities and Constraints

- Next.js 16 (App Router, Server Actions), React 19, CSS Modules, SQLite con Drizzle,
  Zod. Sin librería de componentes.
- Taxonomías cerradas (SPEC §3): 6 causas con lado estudio/ejecución, 14 categorías.
  Los valores de enum se guardan y se exportan en mayúsculas; la interfaz puede
  mostrarlos con otra etiqueta, pero no cambiarlos.
- Ventanas de análisis de 30 y 60 días; Falsas certezas y la regla 2 van siempre a 30.
- Nada irrecuperable por un clic: borrados en dos pasos.
- Fuera de alcance del rediseño: lógica de AnkiConnect, modelo de datos, exportadores
  CSV/JSON y acciones del servidor.
- Retirado a propósito (23-sep-2026), no reintroducir: comparación práctica/Anki en el
  informe, medición de segundos, marca manual de tarjeta.
- Idioma de la interfaz: español.

## Evidence on Hand

- Demo reproducible con datos inventados: `pnpm demo` (`src/lib/db/demo.ts`).
- Capturas del estado previo al rediseño: `docs/ui-review/before/`.
- Especificación funcional: `docs/SPEC.md`; integración con Anki: `docs/ANKI.md`.
- No hay usuarios externos, testimonios ni métricas de uso; no inventarlos.

## Product Principles

1. **El registro no espera.** Cada paso sobrante al volcar una tanda se paga todos los
   días; el camino de Macmillan y el de teclado van por delante de todo lo demás.
2. **Una decisión, no un dashboard.** Cada vista de análisis abre con lo que hay que
   hacer y deja las cifras como respaldo.
3. **El dato manda.** Cifras comparables en vertical, sin decoración que compita con
   ellas; vacío no es cero.
4. **Honestidad del estado.** Anki desconectado, muestra insuficiente o sesión cerrada
   se dicen en claro, con el paso siguiente.
5. **Nada se pierde.** Validación que conserva lo escrito y borrados reversibles o
   confirmados.

## Accessibility & Inclusion

WCAG 2.2 AA como suelo: contraste, foco visible, uso completo por teclado (el registro
se hace con teclado) y etiquetas asociadas en todos los campos.
