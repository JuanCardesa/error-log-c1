import type { Messages } from '@/lib/i18n';
import type { NotebookFolder } from '@/lib/notebook/types';
import { FilterBar } from '../_shared/FilterBar';
import { FilterMenu } from '../_shared/FilterMenu';
import { LiveSearch } from '../_shared/LiveSearch';
import ui from '../_shared/ui.module.css';

/** El destino de un filtro: `undefined` lo quita y el resto de la búsqueda se conserva. */
export type NotebookFilterHref = (patch: { readonly carpeta?: string; readonly tag?: string }) => string;

/**
 * Búsqueda, carpeta y etiqueta, como en Errores: cada filtro se aplica al elegirlo y vive en
 * la URL. Las etiquetas salen de las que ya se usan, las más repetidas primero.
 */
export function NotebookSearchControls({ folders, tags, folderParam, tag, href, t }: {
  readonly folders: readonly NotebookFolder[];
  readonly tags: readonly { readonly tag: string; readonly count: number }[];
  readonly folderParam: string;
  readonly tag: string;
  readonly href: NotebookFilterHref;
  readonly t: Messages;
}) {
  const n = t.notebook;
  const roots = folders.filter((folder) => folder.parentId === null);
  const folderOptions = [
    { key: 'all', value: undefined, label: t.common.all },
    ...roots.flatMap((root) => [
      { key: String(root.id), value: String(root.id), label: n.withSubfolders(root.name) },
      ...folders.filter((folder) => folder.parentId === root.id)
        .map((child) => ({ key: String(child.id), value: String(child.id), label: `↳ ${child.name}` })),
    ]),
    { key: 'sin-carpeta', value: 'sin-carpeta', label: n.noFolder },
  ];
  const folderName = folderParam === 'sin-carpeta'
    ? n.noFolder
    : folders.find((folder) => String(folder.id) === folderParam)?.name;
  const activeTag = tag.trim();

  return (
    <FilterBar
      search={<LiveSearch name="q" maxLength={200} label={t.noteLinks.searchNotes}
        placeholder={t.noteLinks.searchPlaceholder} className={ui.filterSearch} />}
    >
      <FilterMenu
        label={n.folder}
        text={folderName === undefined ? n.folder : t.common.filterValue(n.folder, folderName)}
        options={folderOptions.map((option) => ({
          key: option.key, label: option.label, href: href({ carpeta: option.value }),
          current: (option.value ?? '') === folderParam,
        }))}
        clear={folderName === undefined ? undefined : { href: href({ carpeta: undefined }), label: t.common.removeFilter(folderName) }}
      />
      {(tags.length > 0 || activeTag !== '') && (
        <FilterMenu
          label={n.tag}
          text={activeTag === '' ? n.tag : t.common.filterValue(n.tag, activeTag)}
          options={[
            { key: '', label: t.common.all, href: href({ tag: undefined }), current: activeTag === '' },
            ...tags.map((item) => ({
              key: item.tag, label: `${item.tag} · ${String(item.count)}`, href: href({ tag: item.tag }), current: item.tag === activeTag,
            })),
          ]}
          clear={activeTag === '' ? undefined : { href: href({ tag: undefined }), label: t.common.removeFilter(activeTag) }}
        />
      )}
    </FilterBar>
  );
}
