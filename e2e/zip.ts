import { inflateRawSync } from 'node:zlib';

/**
 * Lector de ZIP mínimo para las pruebas: recorre el directorio central, así que además de
 * sacar el contenido comprueba que el fichero está bien formado y que otra herramienta
 * podría abrirlo. Solo `node:zlib`, sin añadir una dependencia para esto.
 */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function endOfCentralDirectory(zip: Buffer): number {
  for (let at = zip.length - 22; at >= 0; at -= 1) {
    if (zip.readUInt32LE(at) === EOCD) return at;
  }
  throw new Error('No es un ZIP: falta el final del directorio central.');
}

/** Nombre → contenido. Las carpetas aparecen con su barra final y contenido vacío. */
export function readZipEntries(zip: Buffer): Map<string, Buffer> {
  const eocd = endOfCentralDirectory(zip);
  const total = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < total; index += 1) {
    if (zip.readUInt32LE(at) !== CENTRAL) throw new Error(`Entrada ${String(index)} corrupta en el directorio central.`);
    const method = zip.readUInt16LE(at + 10);
    const compressedSize = zip.readUInt32LE(at + 20);
    const uncompressedSize = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');

    if (zip.readUInt32LE(localAt) !== LOCAL) throw new Error(`Cabecera local inválida en ${name}.`);
    const dataAt = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
    const stored = zip.subarray(dataAt, dataAt + compressedSize);
    const content = method === 0 ? stored : inflateRawSync(stored);
    if (content.length !== uncompressedSize) throw new Error(`Tamaño inesperado en ${name}.`);
    entries.set(name, content);

    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function readZipText(zip: Buffer, name: string): string {
  const content = zip.length === 0 ? undefined : readZipEntries(zip).get(name);
  if (content === undefined) throw new Error(`El ZIP no contiene ${name}.`);
  return content.toString('utf8');
}
