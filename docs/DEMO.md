# Error Log C1 en cinco pasos

Este recorrido muestra la app real con datos ficticios. Las mismas imágenes forman un
[GIF de 20 segundos](media/demo.gif); aquí puedes leerlas a tu ritmo.

## 1. Abrir una sesión

Registra los ítems intentados y los aciertos para que el informe pueda interpretar los errores.

![Sesión de ejemplo: ocho intentos y seis aciertos](media/step-1.png)

## 2. Pegar las correcciones

La importación acepta una tabla o un JSON preparado con las instrucciones de la app.

![Dos correcciones pegadas desde una tabla](media/step-2.png)

## 3. Revisar la tanda

Comprueba las respuestas y ajusta la causa, la confianza y la regla con tus palabras.

![Vista previa con la causa y la confianza revisadas](media/step-3.png)

## 4. Guardar los errores

La tanda se guarda completa; repetir un error dentro de esa sesión no lo duplica.

![Los dos errores guardados en la sesión](media/step-4.png)

## 5. Elegir la siguiente acción

El informe destaca una sola prioridad y explica los datos que la disparan.

![Informe semanal con la acción prioritaria](media/step-5.png)

## Regenerar los medios

Con las dependencias del proyecto instaladas y el puerto 3210 libre:

```bash
pnpm exec playwright install chromium
pnpm screenshots
```

El comando prepara `data/e2e.db`, compila en `.next-e2e/` y ejecuta el recorrido en
Chromium. Sobrescribe exclusivamente las capturas de `docs/screenshots/` y los cinco
pasos de `docs/media/`; no utiliza la base personal ni reutiliza un servidor existente.

Para codificar el GIF se necesita Python 3 con Pillow:

```bash
python -m pip install Pillow
python scripts/make-demo.py
```

El GIF dura 20 segundos, conserva las capturas completas y no necesita servicios externos.
Revisa las imágenes antes de subirlas: usa siempre ejemplos, sin correcciones personales.

La animación de la cabecera del README (`docs/media/demo.webp`) sale del vídeo de la demo,
grabado aparte con datos ficticios. GitHub no deja que un vídeo se reproduzca solo, pero
sí una imagen animada. Se saca con ffmpeg y se codifica con `img2webp` de
[libwebp](https://developers.google.com/speed/webp/download):

```bash
ffmpeg -i demo.mp4 -vf "fps=12.5,scale=1280:-1:flags=lanczos" frames/%05d.png
img2webp -loop 0 -lossy -q 70 -m 4 -kmin 6 -kmax 12 -d 80 frames/*.png -o docs/media/demo.webp
ffmpeg -ss 0.5 -i demo.mp4 -frames:v 1 -vf "scale=1280:-1:flags=lanczos" -c:v libwebp -quality 85 docs/media/demo-poster.webp
```

No uses el codificador WebP animado de ffmpeg: tras los cambios de pantalla deja restos de la
anterior. `img2webp` con `-kmax 12` pinta un fotograma completo al menos cada 12, y a 12,5
fotogramas por segundo cada uno dura 80 ms exactos, así que la animación no se desfasa del vídeo.

`demo-poster.webp` es la imagen fija para quien tiene activado reducir el movimiento. El
vídeo completo del enlace está subido a GitHub arrastrándolo a un comentario; para
cambiarlo, sube el nuevo igual y sustituye el enlace `user-attachments`.
