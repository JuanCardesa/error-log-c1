import { PageHeader } from '../_shared/PageHeader';
import { getT } from '../_shared/i18nServer';
import { LanguageSetting } from './LanguageSetting';
import styles from './ajustes.module.css';

/** Ajustes de la interfaz. Por ahora, el idioma. */

export const dynamic = 'force-dynamic';

export default async function AjustesPage() {
  const t = await getT();
  return (
    <div className={styles.page}>
      <PageHeader title={t.settings.title} lede={t.settings.lede} />
      <LanguageSetting />
    </div>
  );
}
