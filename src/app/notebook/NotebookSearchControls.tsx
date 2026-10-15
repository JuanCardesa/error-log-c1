import type { Messages } from '@/lib/i18n';
import type { NotebookFolder } from '@/lib/notebook/types';
import { LiveSearch } from '../_shared/LiveSearch';
import ui from '../_shared/ui.module.css';
import styles from './notebook.module.css';

export function NotebookSearchControls({ folders, folderParam, tag, t }: {
  readonly folders: readonly NotebookFolder[];
  readonly folderParam: string;
  readonly tag: string;
  readonly t: Messages;
}) {
  const roots = folders.filter((folder) => folder.parentId === null);
  return (
    <form key={JSON.stringify([folderParam, tag])} action="/notebook" method="get" className={styles.searchForm}>
      <label className={ui.field}>{t.noteLinks.searchNotes}
        <LiveSearch name="q" maxLength={200} label={t.noteLinks.searchNotes} placeholder={t.noteLinks.searchPlaceholder} />
      </label>
      <label className={ui.field}>{t.notebook.folder}
        <select name="carpeta" className={ui.select} defaultValue={folderParam}>
          <option value="">{t.common.all}</option>
          {roots.map((root) => (
            <optgroup key={root.id} label={root.name}>
              <option value={root.id}>{t.notebook.withSubfolders(root.name)}</option>
              {folders.filter((folder) => folder.parentId === root.id).map((child) => (
                <option key={child.id} value={child.id}>↳ {child.name}</option>
              ))}
            </optgroup>
          ))}
          <option value="sin-carpeta">{t.notebook.noFolder}</option>
        </select>
      </label>
      <label className={ui.field}>{t.notebook.tag}
        <input name="tag" className={ui.input} defaultValue={tag.slice(0, 40)} maxLength={40} placeholder={t.notebook.optionalPlaceholder} />
      </label>
      <button type="submit" className={ui.secondary}>{t.common.applyFilters}</button>
    </form>
  );
}
