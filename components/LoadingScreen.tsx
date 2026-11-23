import { useI18n } from '@/components/I18nProvider';

/** One placeholder shape; `w` is its width as a share of the line it stands on. */
function Bone({ className = '', w }: { className?: string; w?: string }) {
  return <span className={'bone ' + className} style={w ? { width: w } : undefined} />;
}

/** A section card's outline: its heading, then `rows` lines of content. */
function CardBones({ rows }: { rows: number }) {
  return (
    <div className="panel">
      <Bone className="h" w="40%" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bone-row">
          <Bone w={i % 2 ? '52%' : '64%'} />
          <Bone w="22%" />
        </div>
      ))}
    </div>
  );
}

/**
 * What shows while the app fetches the account and its apartments: the outline
 * of the page that is about to appear (top bar, the opening figure, two cards,
 * and the sidebar on a desktop), so the app opens in place instead of jumping
 * from a lone spinner to a full page. It is rendered on the server too, so it
 * is the first thing on screen, before any script has run.
 */
export default function LoadingScreen() {
  const { t } = useI18n();
  return (
    <div className="app shell loading" role="status" aria-label={t('common.loading')} aria-busy="true">
      <div className="nav" aria-hidden="true">
        <Bone className="nav-bone brand-bone" w="55%" />
        {['70%', '50%', '62%', '44%', '58%'].map((w, i) => (
          <Bone key={i} className="nav-bone" w={w} />
        ))}
      </div>
      <div className="topbar" aria-hidden="true">
        <Bone className="menu-bone" />
        <div className="grow">
          <Bone className="title-bone" w="36%" />
        </div>
        <Bone className="year-bone" />
      </div>
      <div className="page page-home" aria-hidden="true">
        <div className="hero">
          <Bone w="34%" />
          <Bone className="big-bone" w="72%" />
          <div className="stats">
            <Bone className="stat-bone" />
            <Bone className="stat-bone" />
            <Bone className="stat-bone" />
          </div>
        </div>
        <CardBones rows={3} />
        <CardBones rows={4} />
      </div>
    </div>
  );
}
