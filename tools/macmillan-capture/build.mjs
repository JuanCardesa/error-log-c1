/**
 * Empaqueta los modulos en un unico .user.js.
 *
 * Sin bundler a proposito: los modulos ya estan escritos en el orden de sus
 * dependencias, asi que basta con quitar los `import` y los `export` y envolverlo todo.
 * Menos piezas que mantener y el resultado se lee tal cual antes de instalarlo.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const ORDER = [
  'src/core/signals.js',
  'src/core/items.js',
  'src/core/exportable.js',
  'src/core/tray.js',
  'src/core/study.js',
  'src/core/report.js',
  'src/dom/answers.js',
  'src/dom/macmillan.js',
  'src/dom/collect.js',
  'src/dom/context.js',
  'src/dom/sample.js',
  'src/dom/ui.js',
  'src/dom/main.js',
];

const HEADER = `// ==UserScript==
// @name         Error Log C1 — copiar errores de Macmillan
// @namespace    https://github.com/JuanCardesa/error-log
// @version      0.2.0
// @description  Copia solo los fallos de un ejercicio corregido de Macmillan Education Everywhere en el formato que importa el Error Log C1.
// @author       Juan Cardesa
// @match        https://mee.macmillaneducation.com/*
// @match        https://lms-cdn.mee.macmillaneducation.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
`;

function strip(source) {
  return source
    .split('\n')
    .filter((line) => !/^import\s.+from\s.+;$/.test(line.trim()))
    .map((line) => line.replace(/^export\s+(?=(const|function|class|let)\s)/, ''))
    .join('\n');
}

/**
 * Todo acaba en el mismo ambito, asi que dos modulos no pueden declarar el mismo nombre
 * arriba del todo: el segundo pisaria al primero sin avisar. Ya paso una vez con
 * `segmentsOf` y solo se vio al probar contra Macmillan, asi que ahora rompe la build.
 */
function topLevelNames(source) {
  const names = [];
  for (const line of source.split('\n')) {
    const match = /^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (match) names.push(match[1]);
  }
  return names;
}

/**
 * Un modulo que no este en la lista se queda fuera del paquete sin avisar, y el fallo
 * solo aparece al ejecutarlo. Ya paso con `tray.js`, asi que ahora rompe la build.
 */
function everyModule(base) {
  const found = [];
  for (const folder of readdirSync(join(here, base), { withFileTypes: true })) {
    if (folder.isDirectory()) found.push(...everyModule(`${base}/${folder.name}`));
    else if (folder.name.endsWith('.js')) found.push(`${base}/${folder.name}`);
  }
  return found;
}

const missing = everyModule('src').filter((file) => !ORDER.includes(file));
if (missing.length > 0) {
  throw new Error(`Estos modulos no estan en ORDER y se quedarian fuera: ${missing.join(', ')}`);
}

const declared = new Map();
const body = ORDER.map((file) => {
  const source = strip(readFileSync(join(here, file), 'utf8'));
  for (const name of topLevelNames(source)) {
    const owner = declared.get(name);
    if (owner !== undefined && owner !== file) {
      throw new Error(`Nombre repetido en el ambito comun: "${name}" esta en ${owner} y en ${file}. Renombra uno de los dos.`);
    }
    declared.set(name, file);
  }
  return `// ----- ${file} -----\n${source}`;
}).join('\n\n');

const bootstrap = `
// ----- arranque -----
// Corre en el documento principal y en el iframe del reproductor. Donde no haya
// ejercicio, el panel se queda oculto y no molesta.
try {
  const api = start(document);
  // Solo para diagnosticar un formato que no sale bien. Se activa a mano con
  // localStorage['errorlog-macmillan:debug'] = '1' y por defecto no expone nada.
  if (window.localStorage.getItem('errorlog-macmillan:debug') === '1') window.__errorLogCapture = api;
} catch (problem) {
  console.error('[error-log] no he podido arrancar en este marco:', problem);
}
`;

const output = `${HEADER}
(function () {
  'use strict';

${body}
${bootstrap}
})();
`;

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/errorlog-macmillan.user.js'), output, 'utf8');
process.stdout.write(`dist/errorlog-macmillan.user.js: ${String(output.length)} bytes\n`);

/**
 * La misma herramienta como extension de Chrome sin empaquetar.
 *
 * Un userscript solo entra donde llega `@match`, y `@match` no cubre los marcos `blob:`
 * ni `about:blank`. Macmillan sirve las paginas del libro en marcos `blob:`, asi que un
 * gestor de userscripts puede quedarse fuera del reproductor sin dar ninguna senal: ni
 * panel, ni aviso, ni forma de saber por que.
 *
 * Una extension lo declara y no depende de nadie: `all_frames` entra en todos los marcos
 * y `match_origin_as_fallback` cubre los que no tienen una URL que casar, siempre que su
 * origen sea el de Macmillan.
 */
const MANIFEST = {
  manifest_version: 3,
  name: 'Error Log C1 — copiar errores de Macmillan',
  version: '0.2.0',
  description: 'Copia solo los fallos de un ejercicio corregido de Macmillan Education Everywhere en el formato que importa el Error Log C1.',
  content_scripts: [
    {
      matches: [
        'https://mee.macmillaneducation.com/*',
        'https://lms-cdn.mee.macmillaneducation.com/*',
      ],
      js: ['content.js'],
      all_frames: true,
      match_about_blank: true,
      match_origin_as_fallback: true,
      run_at: 'document_idle',
    },
  ],
};

const extension = join(here, 'extension');
mkdirSync(extension, { recursive: true });
writeFileSync(join(extension, 'manifest.json'), JSON.stringify(MANIFEST, null, 2), 'utf8');
writeFileSync(join(extension, 'content.js'), `${body}\n${bootstrap}`, 'utf8');
process.stdout.write(`extension/: manifest.json + content.js (${String(body.length)} bytes)\n`);
