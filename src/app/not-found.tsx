import Link from 'next/link';

import { getT } from './_shared/i18nServer';
import ui from './_shared/ui.module.css';
import styles from './status.module.css';

export default async function NotFound() {
  const t = await getT();
  return (
    <div className={styles.status}>
      <h1 className={ui.pageTitle}>{t.status.notFoundTitle}</h1>
      <p>{t.status.notFoundBody}</p>
      <Link href="/registrar" className={ui.secondary}>{t.common.goToSessions}</Link>
    </div>
  );
}
