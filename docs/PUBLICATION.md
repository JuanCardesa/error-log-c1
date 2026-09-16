# Preparar una versión pública

La app está diseñada para uso local. Publicar el código no requiere desplegar la base de
datos ni abrir un servidor a Internet.

Antes de cambiar la visibilidad:

- Ejecutar tipos, lint, cobertura, build y flujos de navegador.
- Revisar el contenido y los nombres de los ficheros de todas las ramas e historial,
  no solo lo que excluye `.gitignore`: credenciales, bases, exportaciones y material personal.
- Revisar los logs y artefactos de Actions, que también quedarán visibles.
- Comprobar los correos de autor de los commits y decidir si se quiere exponerlos.
  Cambiar el correo para nuevos commits no elimina los anteriores.
- Usar exclusivamente datos ficticios en capturas y en la demo.
- Comprobar que el README explica el uso local, los requisitos y la recuperación de datos.

Las búsquedas por patrones ayudan a detectar credenciales, pero no garantizan la ausencia
de información privada. No se reescribe el historial ni se eliminan logs automáticamente.

[Qué implica cambiar la visibilidad en GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).
