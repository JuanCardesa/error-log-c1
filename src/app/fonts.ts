import localFont from 'next/font/local';

/**
 * Fuentes servidas desde el propio origen. Los `.woff2` viven en `./fonts` (licencia OFL,
 * ver los LICENSE de la carpeta): ni el build ni el navegador piden nada a la red.
 *
 * Plex Sans y Plex Mono para trabajar; Source Serif 4 solo para leer.
 */

export const plexSans = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex-sans',
  display: 'swap',
});

export const plexMono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-mono-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const sourceSerif = localFont({
  src: [
    { path: './fonts/source-serif-4-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/source-serif-4-latin-400-italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/source-serif-4-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-source-serif',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});
