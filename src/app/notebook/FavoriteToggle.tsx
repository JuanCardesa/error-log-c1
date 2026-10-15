'use client';

import { Star } from 'lucide-react';
import { useState, useTransition } from 'react';

import { useToast } from '../_shared/Toast';
import ui from '../_shared/ui.module.css';
import { setNoteFavoriteAction } from './actions';
import styles from './notebook.module.css';

export function FavoriteToggle({ id, title, favoritedAt, compact = false }: {
  readonly id: number;
  readonly title: string;
  readonly favoritedAt: string | null;
  readonly compact?: boolean;
}) {
  return <FavoriteToggleState key={`${String(id)}:${favoritedAt ?? ''}`}
    id={id} title={title} favoritedAt={favoritedAt} compact={compact} />;
}

function FavoriteToggleState({ id, title, favoritedAt, compact }: {
  readonly id: number;
  readonly title: string;
  readonly favoritedAt: string | null;
  readonly compact: boolean;
}) {
  const [favorite, setFavorite] = useState(favoritedAt !== null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <button
      type="button"
      className={compact ? `${ui.iconButton} ${styles.favoriteToggle}` : `${ui.secondary} ${styles.favoriteToggle}`}
      aria-label={compact ? `Favorito: «${title}»` : undefined}
      aria-pressed={favorite}
      aria-busy={pending}
      title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            const result = await setNoteFavoriteAction({ id, favorite: !favorite });
            if (result.ok) setFavorite(result.data.favoritedAt !== null);
            else toast({ tone: 'error', message: `No se pudo cambiar el favorito. ${result.message}` });
          } catch {
            toast({ tone: 'error', message: 'No se pudo confirmar el cambio de favorito. Inténtalo de nuevo.' });
          }
        });
      }}
    >
      <Star size={16} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
      {!compact && <span>Favorito</span>}
    </button>
  );
}
