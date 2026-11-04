import { Empty, TopBar } from '../components/ui';
import { GROUPS, TOPICS, topicById } from '../help/topics';
import { helpBack, leaveHelp, navigate, paths } from '../router';

/** Closes help, back to the screen it was opened from. */
function Done() {
  return (
    <button type="button" className="link" onClick={() => leaveHelp() || navigate(paths.teams())}>
      Done
    </button>
  );
}

/** The in-app guide: a list of topics, and one page per topic (H-1, H-3, H-4). */
export function HelpScreen({ topic }: { topic: string | null }) {
  const hash = paths.help(topic ?? undefined);
  if (topic === null) return <HelpIndex back={helpBack(hash)} />;
  const index = TOPICS.findIndex((t) => t.id === topic);
  const page = topicById(topic);
  if (!page) {
    return (
      <main className="screen">
        <TopBar title="Help" back={paths.help()} historyBack action={<Done />} />
        <Empty>
          That help page doesn’t exist. <a href={paths.help()}>See all help topics</a>.
        </Empty>
      </main>
    );
  }
  const prev = TOPICS[index - 1];
  const next = TOPICS[index + 1];
  return (
    <main className="screen help">
      <TopBar title="Help" back={helpBack(hash)} historyBack action={<Done />} />
      <article className="help-page" aria-labelledby="help-title">
        <p className="help-group">{page.group}</p>
        <h1 id="help-title" className="help-title">
          {page.title}
        </h1>
        {page.body}
      </article>
      <nav className="help-pager" aria-label="More help">
        {prev ? (
          <a className="help-pager-link" href={paths.help(prev.id)}>
            <span className="help-pager-dir">‹ Previous</span>
            {prev.title}
          </a>
        ) : (
          <span />
        )}
        {next && (
          <a className="help-pager-link next" href={paths.help(next.id)}>
            <span className="help-pager-dir">Next ›</span>
            {next.title}
          </a>
        )}
      </nav>
      <p className="help-all">
        <a href={paths.help()}>All help topics</a>
      </p>
    </main>
  );
}

function HelpIndex({ back }: { back: string }) {
  return (
    <main className="screen help">
      <TopBar title="Help" back={back} historyBack action={<Done />} />
      <p className="help-lead">
        How next5 works, from setting up your team to running subs on game day. New here? Start with{' '}
        <a href={paths.help('start')}>Quick start</a>.
      </p>
      <a className="btn secondary wide" href={paths.welcome()}>
        Replay the intro
      </a>
      {GROUPS.map((group) => (
        <section key={group} className="section">
          <div className="section-head">
            <h2>{group}</h2>
          </div>
          <ul className="list">
            {TOPICS.filter((t) => t.group === group).map((t) => (
              <li key={t.id}>
                <a className="list-item" href={paths.help(t.id)}>
                  <span className="list-title">
                    {t.title}
                    <span className="list-sub">{t.summary}</span>
                  </span>
                  <span className="chevron">›</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="footnote">next5 version {__APP_VERSION__}</p>
    </main>
  );
}
