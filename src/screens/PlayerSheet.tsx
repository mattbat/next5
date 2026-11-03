import { useState } from 'react';
import { Info, Segmented, Sheet, Toggle } from '../components/ui';
import { SKILL_LEVELS } from '../data/defaults';
import { addPlayer, deletePlayer, updatePlayer } from '../data/repo';
import type { Player, Team } from '../data/types';
import type { SkillLevel } from '../engine';

/** Add or edit a player: name, number, positions, and skill at each (P2, P3). */
export function PlayerSheet({ team, player, onClose }: { team: Team; player: Player | null; onClose: () => void }) {
  const [name, setName] = useState(player?.name ?? '');
  const [number, setNumber] = useState(player?.number ?? '');
  const [skills, setSkills] = useState<Player['skills']>(player?.skills ?? {});
  const [active, setActive] = useState(player?.active ?? true);

  const save = async () => {
    if (!name.trim()) return onClose();
    if (player) await updatePlayer(player.id, { name: name.trim(), number, skills, active });
    else await addPlayer(team.id, { name, number, skills });
    onClose();
  };

  const setSkill = (positionId: string, level: SkillLevel | 0) => {
    const next = { ...skills };
    if (level === 0) delete next[positionId];
    else next[positionId] = level;
    setSkills(next);
  };

  return (
    <Sheet title={player ? 'Edit player' : 'New player'} onClose={() => void save()}>
      <div className="field-row">
        <label className="field grow">
          <span>Name</span>
          <input autoFocus={!player} value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" />
        </label>
        <label className="field number">
          <span>#</span>
          <input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.slice(0, 3))} />
        </label>
      </div>

      <h3 className="sheet-sub">
        Positions
        <Info label="skill levels">
          {SKILL_LEVELS.map((s) => `${s.name}: ${s.help.toLowerCase()}.`).join(' ')} Skill levels are only shown here,
          never on game day.
        </Info>
      </h3>
      {team.positions.map((pos) => (
        <div className="row stack" key={pos.id}>
          <span className="row-label">{pos.name}</span>
          <Segmented<number>
            label={`${pos.name} skill`}
            value={skills[pos.id] ?? 0}
            onChange={(v) => setSkill(pos.id, v as SkillLevel | 0)}
            options={[{ value: 0, label: '—' }, ...SKILL_LEVELS.map((s) => ({ value: s.level, label: s.name }))]}
          />
        </div>
      ))}

      {player && (
        <>
          <Toggle
            label="Active"
            checked={active}
            onChange={setActive}
            info="Inactive players stay in past games and stats but aren't added to new games."
          />
          <button
            type="button"
            className="btn danger wide"
            onClick={() => {
              if (window.confirm(`Remove ${player.name} from the roster?`)) void deletePlayer(player.id).then(onClose);
            }}
          >
            Remove player
          </button>
        </>
      )}
      <button type="button" className="btn wide" onClick={() => void save()} disabled={!name.trim()}>
        {player ? 'Save' : 'Add player'}
      </button>
    </Sheet>
  );
}
