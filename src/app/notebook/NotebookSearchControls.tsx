import type { NotebookFolder } from '@/lib/notebook/types';
import { LiveSearch } from '../_shared/LiveSearch';
import ui from '../_shared/ui.module.css';
import styles from './notebook.module.css';

export function NotebookSearchControls({ folders, folderParam, tag }: {
  readonly folders: readonly NotebookFolder[];
  readonly folderParam: string;
  readonly tag: string;
}) {
  const roots = folders.filter((folder) => folder.parentId === null);
  return (
    <form action="/notebook" method="get" className={styles.searchForm}>
      <label className={ui.field}>Buscar apuntes
        <LiveSearch name="q" maxLength={200} label="Buscar apuntes" placeholder="Título, contenido o etiqueta" />
      </label>
      <label className={ui.field}>Carpeta
        <select name="carpeta" className={ui.select} defaultValue={folderParam}>
          <option value="">Todas</option>
          {roots.map((root) => (
            <optgroup key={root.id} label={root.name}>
              <option value={root.id}>{root.name} y subcarpetas</option>
              {folders.filter((folder) => folder.parentId === root.id).map((child) => (
                <option key={child.id} value={child.id}>↳ {child.name}</option>
              ))}
            </optgroup>
          ))}
          <option value="sin-carpeta">Sin carpeta</option>
        </select>
      </label>
      <label className={ui.field}>Etiqueta
        <input name="tag" className={ui.input} defaultValue={tag.slice(0, 40)} maxLength={40} placeholder="Opcional" />
      </label>
      <button type="submit" className={ui.secondary}>Aplicar filtros</button>
    </form>
  );
}
