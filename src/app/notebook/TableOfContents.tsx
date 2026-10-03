'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';

import { buildNotebookToc, type NotebookTocNode } from '@/lib/notebook/toc';
import type { NotebookHeading } from '@/lib/notebook/types';
import styles from './toc.module.css';

function TocLinks({ nodes, active, onNavigate }: {
  readonly nodes: readonly NotebookTocNode[];
  readonly active: string | null;
  readonly onNavigate: (event: MouseEvent<HTMLAnchorElement>, slug: string) => void;
}) {
  return (
    <ol className={styles.list}>
      {nodes.map((node) => (
        <li key={node.heading.slug}>
          <a
            href={`#${node.heading.slug}`}
            aria-current={active === node.heading.slug ? 'location' : undefined}
            onClick={(event) => { onNavigate(event, node.heading.slug); }}
          >
            {node.heading.text || 'Apartado sin título'}
          </a>
          {node.children.length > 0 && <TocLinks nodes={node.children} active={active} onNavigate={onNavigate} />}
        </li>
      ))}
    </ol>
  );
}

/** El hash sirve para enlaces compartidos; el observador sigue el apartado durante el scroll. */
export function TableOfContents({ headings }: { readonly headings: readonly NotebookHeading[] }) {
  const tree = useMemo(() => buildNotebookToc(headings), [headings]);
  const [active, setActive] = useState<string | null>(headings[0]?.slug ?? null);

  useEffect(() => {
    const slugs = new Set(headings.map((heading) => heading.slug));
    const currentHash = () => {
      try {
        const slug = decodeURIComponent(window.location.hash.slice(1));
        return slugs.has(slug) ? slug : null;
      } catch { return null; }
    };
    const syncHash = () => {
      const slug = currentHash();
      if (slug === null) return;
      setActive(slug);
      document.getElementById(slug)?.scrollIntoView({ behavior: 'auto', block: 'start' });
    };
    const syncPosition = () => {
      const header = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 56;
      let current = headings[0]?.slug ?? null;
      for (const heading of headings) {
        const element = document.getElementById(heading.slug);
        if (element !== null && element.getBoundingClientRect().top <= header + 24) current = heading.slug;
      }
      const scrollable = document.documentElement.scrollHeight > window.innerHeight + 1;
      if (!scrollable) current = currentHash() ?? headings[0]?.slug ?? null;
      else if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = headings.at(-1)?.slug ?? current;
      }
      setActive(current);
    };

    const frame = requestAnimationFrame(() => {
      if (currentHash() === null) syncPosition();
      else syncHash();
    });
    window.addEventListener('hashchange', syncHash);
    window.addEventListener('popstate', syncHash);
    const header = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 56;
    let scrollFrame = 0;
    const schedulePosition = () => {
      if (scrollFrame !== 0) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        syncPosition();
      });
    };
    const observer = new IntersectionObserver(schedulePosition, {
      rootMargin: `-${String(header + 24)}px 0px -65% 0px`,
      threshold: 0,
    });
    for (const heading of headings) {
      const element = document.getElementById(heading.slug);
      if (element !== null) observer.observe(element);
    }
    window.addEventListener('scroll', schedulePosition, { passive: true });
    window.addEventListener('resize', schedulePosition);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
      observer.disconnect();
      window.removeEventListener('scroll', schedulePosition);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('popstate', syncHash);
    };
  }, [headings]);

  const onNavigate = (event: MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const element = document.getElementById(slug);
    if (element === null) return;
    event.preventDefault();
    window.history.pushState(null, '', `#${slug}`);
    setActive(slug);
    // El salto inmediato evita animaciones incluso con movimiento reducido.
    element.scrollIntoView({ behavior: 'auto', block: 'start' });
  };

  if (headings.length === 0) return null;
  return (
    <details className={styles.compact}>
      <summary>En esta nota · {headings.length} {headings.length === 1 ? 'sección' : 'secciones'}</summary>
      <nav aria-label="Índice del apunte">
        <TocLinks nodes={tree} active={active} onNavigate={onNavigate} />
      </nav>
    </details>
  );
}
