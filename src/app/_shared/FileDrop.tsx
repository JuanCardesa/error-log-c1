'use client';

import { FileUp } from 'lucide-react';
import { useState, type DragEvent } from 'react';

import { useT } from './i18nClient';
import ui from './ui.module.css';

/**
 * Elegir un archivo con los textos de la app, no con el «Choose File» del navegador. Es un
 * `<label>` con el `input` dentro, oculto pero enfocable: el clic, el teclado y el lector
 * de pantalla funcionan como con el nativo, y además se puede soltar un archivo encima.
 *
 * - `zone`: la entrada principal de la pantalla, con su título, la pista y el elegido.
 * - `button`: una alternativa al lado de otra entrada (pegar el texto), como secundario.
 *
 * El input se vacía después de cada elección, así que volver a elegir el mismo archivo
 * también avisa; quien lo usa guarda el `File` y pasa su nombre en `fileName`.
 */
export function FileDrop({ label, hint, accept, onFile, fileName = null, disabled = false, invalid = false, variant = 'zone' }: {
  readonly label: string;
  readonly hint?: string;
  readonly accept: string;
  readonly onFile: (file: File) => void;
  readonly fileName?: string | null;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly variant?: 'zone' | 'button';
}) {
  const t = useT();
  const [over, setOver] = useState(false);

  const onDragOver = (event: DragEvent<HTMLLabelElement>) => {
    if (disabled || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setOver(true);
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    setOver(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (file === undefined) return;
    event.preventDefault();
    onFile(file);
  };

  const input = (
    <input
      type="file"
      className={`sr-only ${ui.fileInput}`}
      accept={accept}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file !== undefined) onFile(file);
      }}
    />
  );

  if (variant === 'button') {
    return (
      <label className={`${ui.secondary} ${ui.fileButton}`} data-over={over || undefined} data-disabled={disabled || undefined}
        onDragOver={onDragOver} onDragLeave={() => { setOver(false); }} onDrop={onDrop}>
        <FileUp size={16} aria-hidden="true" />
        {label}
        {input}
      </label>
    );
  }

  return (
    <label className={ui.fileZone} data-over={over || undefined} data-invalid={invalid || undefined} data-disabled={disabled || undefined}
      onDragOver={onDragOver} onDragLeave={() => { setOver(false); }} onDrop={onDrop}>
      <FileUp size={20} className={ui.fileIcon} aria-hidden="true" />
      <span className={ui.fileText}>
        <span className={ui.fileLabel}>{label}</span>
        {fileName === null ? (
          <span>{t.common.fileDrop} <span className={ui.fileBrowse}>{t.common.fileBrowse}</span></span>
        ) : (
          <span>
            {t.common.fileChosen} <span className={ui.fileName}>{fileName}</span>
            {' · '}<span className={ui.fileBrowse}>{t.common.fileReplace}</span>
          </span>
        )}
        {hint !== undefined && <span className={ui.fileHint}>{hint}</span>}
      </span>
      {input}
    </label>
  );
}
