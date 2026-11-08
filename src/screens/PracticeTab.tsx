import { useLiveQuery } from 'dexie-react-hooks';
import { Empty, Info, Section } from '../components/ui';
import { db } from '../data/db';
import { createPractice } from '../data/repo';
import type { Practice, Team } from '../data/types';
import { formatGameDate } from '../domain/game';
import { indexDrills, plannedMinutes, practiceStats } from '../domain/practice';
import { navigate, paths, practicePath } from '../router';

const STATUS_LABEL = { planned: 'Planned', live: 'In progress', done: 'Done' } as const;

/** A team's practices (PR1) and its season practice stats (PR9). */
export function PracticeTab({ team }: { team: Team }) {
  const practices = useLiveQuery(() => db.practices.where('teamId').equals(team.id).reverse().sortBy('date'), [team.id]);
  const drills = useLiveQuery(() => db.drills.toArray(), []);
  if (practices === undefined || drills === undefined) return null;

  return (
    <>
      <Section
        title="Practices"
        aside={
          team.archived ? undefined : (
            <button type="button" className="btn small" onClick={() => void createPractice(team).then((p) => navigate(paths.practice(p.id)))}>
              + New practice
            </button>
          )
        }
      >
        {practices.length === 0 && <Empty>No practices yet. Tap + New practice to plan one from your drills.</Empty>}
        <ul className="list">
          {practices.map((p) => (
            <li key={p.id}>
              <a className="list-item" href={practicePath(p)}>
                <span className="list-title">
                  {p.focus.trim() || 'Practice'}
                  <span className="list-sub">
                    {formatGameDate(p.date)} · {plannedMinutes(p)} min
                  </span>
                </span>
                <span className={`status status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                <span className="chevron">›</span>
              </a>
            </li>
          ))}
        </ul>
        <a className="btn secondary wide top-gap" href={paths.drills()}>
          Drill library
        </a>
      </Section>
      <PracticeStats practices={practices} drills={indexDrills(drills)} />
    </>
  );
}

/** Where the season's practice time went, by tag and by drill (PR9). */
function PracticeStats({ practices, drills }: { practices: Practice[]; drills: ReturnType<typeof indexDrills> }) {
  const stats = practiceStats(practices, drills);
  return (
    <Section
      title="Season focus"
      aside={
        <Info label="practice stats">
          From finished practices, using how long each drill really ran. Skipped drills don’t count. A drill with several tags
          counts toward each, and stations running at the same time each count, so the percentages can add up to more than 100.
        </Info>
      }
    >
      {stats.practices === 0 ? (
        <Empty>No finished practices yet. Stats appear here after your first practice ends.</Empty>
      ) : (
        <>
          <p className="hint">
            {stats.practices} practice{stats.practices === 1 ? '' : 's'}, {stats.minutes} minutes.
          </p>
          <div className="grid-scroll">
            <table className="stats-table" aria-label="Time by tag">
              <thead>
                <tr>
                  <th className="name-col">Tag</th>
                  <th>Min</th>
                  <th>%</th>
                  <th className="bar-col" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {stats.tags.map((t) => (
                  <tr key={t.tag}>
                    <th className="name-col" scope="row">
                      {t.tag}
                    </th>
                    <td>{t.minutes}</td>
                    <td>{t.percent}%</td>
                    <td className="bar-col" aria-hidden>
                      <span className="bar" style={{ width: `${Math.min(100, t.percent)}%` }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid-scroll top-gap">
            <table className="stats-table" aria-label="Time by drill">
              <thead>
                <tr>
                  <th className="name-col">Drill</th>
                  <th>Used</th>
                  <th>Min</th>
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {stats.drills.map((d) => (
                  <tr key={d.drillId}>
                    <th className="name-col" scope="row">
                      {d.name}
                      {(d.up > 0 || d.down > 0) && (
                        <span className="list-sub">
                          {d.up > 0 && `👍 ${d.up}`} {d.down > 0 && `👎 ${d.down}`}
                        </span>
                      )}
                    </th>
                    <td>{d.uses}</td>
                    <td>{d.minutes}</td>
                    <td className="nowrap">{formatGameDate(d.lastDate).replace(/^\w+, /, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}
