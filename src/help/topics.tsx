import type { ReactNode } from 'react';
import { SKILL_LEVELS } from '../data/defaults';
import { RULE_HELP } from '../screens/ruleHelp';
import { Shot, Steps, Tip, TopicLink } from './parts';

/**
 * The in-app guide (H-1, H-3): what next5 does and how to use every part of
 * it. Words in bold match the labels on screen, so the coach can find them.
 * Keep it in step with the README's coach section.
 */

export interface Topic {
  id: string;
  title: string;
  /** One line for the list of topics. */
  summary: string;
  group: (typeof GROUPS)[number];
  body: ReactNode;
}

export const GROUPS = ['Getting started', 'Before the game', 'Game day', 'After the game', 'Sharing and your data', 'Questions'] as const;

export const TOPICS: Topic[] = [
  {
    id: 'start',
    title: 'Quick start',
    summary: 'From an empty phone to your first game in five steps.',
    group: 'Getting started',
    body: (
      <>
        <p>
          next5 plans fair substitutions for youth basketball. You enter your roster once. Before each game you mark who
          showed up, and next5 builds a rotation where everyone gets fair playing time and the positions you need are
          always on the court. During the game it shows who goes <b>in</b>, who comes <b>out</b>, and where each player
          plays. You tap <b>Next</b> at each sub.
        </p>
        <Steps>
          <li>
            <b>Add your team.</b> On the Teams screen, type a name at the bottom (for example <i>8U Thunder</i>) and tap{' '}
            <b>Add</b>. Just looking around? Tap <b>Load demo team</b> for a team of made-up players.
          </li>
          <li>
            <b>Add your players</b> on the team’s <b>Roster</b> tab: a name, a jersey number, and the positions each one
            can play. <TopicLink id="roster">More about players</TopicLink>.
          </li>
          <li>
            <b>Check the team’s Settings tab</b> once: how many Guards, Forwards and Centers every lineup needs, and
            whether you play quarters or halves. <TopicLink id="team-settings">More about team settings</TopicLink>.
          </li>
          <li>
            <b>Plan a game.</b> On the <b>Games</b> tab tap <b>+ New game</b>, uncheck anyone who isn’t coming, and tap{' '}
            <b>Generate plan</b>. Look through the plan and change anything you like.{' '}
            <TopicLink id="plan">Reading the plan</TopicLink>.
          </li>
          <li>
            <b>Run the game.</b> Tap <b>Start game</b>. At each sub, send in the players marked ▲ IN, take out the ones
            marked ▼ OUT, and tap <b>Next</b>. <TopicLink id="game-day">Running a game</TopicLink>.
          </li>
        </Steps>
        <Shot name="gameday" caption="Game Day: who’s on now, and the next sub. One tap on Next." />
        <Tip>
          Everything saves as you go. There’s no Save button, and nothing is sent anywhere: your teams live on this
          phone. Make a backup now and then (<TopicLink id="backup">how</TopicLink>).
        </Tip>
      </>
    ),
  },
  {
    id: 'words',
    title: 'Words next5 uses',
    summary: 'Segment, lineup, lock and the other terms in one place.',
    group: 'Getting started',
    body: (
      <>
        <dl className="help-terms">
          <dt>Period</dt>
          <dd>A quarter or a half, depending on how your league plays.</dd>
          <dt>Segment</dt>
          <dd>
            The stretch of play between two subs. With the default of 2 per quarter there’s a sub halfway through each
            quarter and at the end of it, so a game has 8 segments. The screen shows them as, for example,{' '}
            <b>Q2 · 1 of 2</b>: the first half of the second quarter.
          </dd>
          <dt>Lineup</dt>
          <dd>The five players on the court for one segment, each covering a position.</dd>
          <dt>Plan</dt>
          <dd>A lineup for every segment of the game, made by next5 and changed by you as much as you like.</dd>
          <dt>Bench</dt>
          <dd>Players who are at the game but sitting out a segment.</dd>
          <dt>Position requirement</dt>
          <dd>
            The minimum number of players who can play each position in every lineup, such as two Guards and one
            Center. Set on the team’s Settings tab.
          </dd>
          <dt>Skill level</dt>
          <dd>
            How comfortable a player is at a position: {SKILL_LEVELS.map((s) => s.name).join(', ')}. Only you see it, on
            the player’s page. It is never shown on game day or exported.
          </dd>
          <dt>Lock</dt>
          <dd>
            Your instruction for one player in one segment: <b>🔒 In</b> keeps them on the court, <b>🔒 Out</b> keeps them
            on the bench. next5 plans everything else around your locks.
          </dd>
          <dt>Re-plan</dt>
          <dd>
            During a game, rebuilding the lineups still to come after an injury, a rest or a late arrival. Segments
            already played never change.
          </dd>
          <dt>Overtime (OT)</dt>
          <dd>Extra segments added at the end of the game, planned with the same rules.</dd>
        </dl>
      </>
    ),
  },
  {
    id: 'install',
    title: 'Install on your iPhone',
    summary: 'Add next5 to your Home Screen so it works like an app, with no signal.',
    group: 'Getting started',
    body: (
      <>
        <p>
          next5 isn’t in the App Store. You add it to your Home Screen from Safari, and from then on it opens full screen
          like any other app and works with no internet, which is handy in gyms with no signal.
        </p>
        <Steps>
          <li>
            Open <b>mattbat.com/next5</b> in <b>Safari</b>. Other browsers on iPhone can’t install it.
          </li>
          <li>
            Tap <b>Share</b> (the square with an arrow pointing up).
          </li>
          <li>
            Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.
          </li>
          <li>Open next5 from the new icon.</li>
        </Steps>
        <Tip title="Important">
          The Home Screen app and Safari keep <b>separate</b> data. A team you made in Safari won’t appear in the Home
          Screen app. Pick one (the Home Screen app is best) and use it for everything. To move teams from one to the
          other, make a backup in one and restore it in the other (<TopicLink id="backup">how</TopicLink>).
        </Tip>
        <p>
          Updates arrive by themselves. When one is ready you’ll see <b>A new version of next5 is ready</b>; see{' '}
          <TopicLink id="settings">Appearance and updates</TopicLink>.
        </p>
      </>
    ),
  },
  {
    id: 'roster',
    title: 'Teams and players',
    summary: 'Add players, their positions and skill levels; archive old teams.',
    group: 'Getting started',
    body: (
      <>
        <h2>Teams</h2>
        <p>
          The Teams screen lists your teams. Add one by typing its name at the bottom and tapping <b>Add</b>. Tap a team to
          open it. Each team has four tabs: <b>Games</b> (where it opens), <b>Roster</b>, <b>Stats</b> and{' '}
          <b>Settings</b>.
        </p>
        <Shot name="teams" />
        <h2>Players</h2>
        <p>
          On the <b>Roster</b> tab, tap <b>+ Add</b>. Give the player a first name and a jersey number, then choose a
          skill level for each position they can play. Leave a position on <b>—</b> if they don’t play it.
        </p>
        <Shot name="player" caption="Positions and skill levels for one player." />
        <ul>
          {SKILL_LEVELS.map((s) => (
            <li key={s.level}>
              <b>{s.name}</b>: {s.help.toLowerCase()}.
            </li>
          ))}
        </ul>
        <p>
          next5 only puts a player at a position they can play, and it uses skill levels in two ways: it gives each
          player their strongest position when it can, and (if you turn on <b>Balance skill</b>) it avoids putting
          several Rising players on the court together. Skill levels are only ever shown on this page, never on game
          day, in stats or in exports, so they’re safe to keep honest.
        </p>
        <Shot name="roster" caption="The roster shows the positions each player can play." />
        <h2>Changing a player</h2>
        <ul>
          <li>Tap a player to change their name, number or positions. Tap <b>Save</b>.</li>
          <li>
            Turn off <b>Active</b> for a player who has left the team. They stay in past games and stats but aren’t added
            to new games.
          </li>
          <li>
            <b>Remove player</b> deletes them for good, and past games then show them as “Unknown”. For a player who has
            left, turning off Active is usually better.
          </li>
        </ul>
        <h2>Archiving and deleting teams</h2>
        <p>
          When a season ends, open the team’s <b>Settings</b> tab and tap <b>Archive team</b>. It leaves the Teams list
          but keeps its players, games and stats. Tap <b>Show archived teams</b> on the Teams screen to open it, and{' '}
          <b>Unarchive</b> to bring it back. <b>Delete team</b> removes the team with all its players and games for good.
        </p>
      </>
    ),
  },
  {
    id: 'team-settings',
    title: 'Team settings',
    summary: 'Position requirement, quarters or halves, and the default rules.',
    group: 'Getting started',
    body: (
      <>
        <p>
          Set these once on the team’s <b>Settings</b> tab. Every new game starts from them, and you can change the format
          and rules for a single game in its setup.
        </p>
        <Shot name="team-settings" />
        <h2>Position requirement</h2>
        <p>
          The minimum number of players who can play each position, in every lineup. <b>Guard 2</b> means at least two
          players who can play Guard are always on the court. One player counts toward only one position at a time, and
          the numbers can add up to at most 5. A position set to 0 isn’t required; players can still play it.
        </p>
        <h2>Default game format</h2>
        <ul>
          <li>
            <b>Periods</b>: <b>Quarters</b> or <b>Halves</b>.
          </li>
          <li>
            <b>Subs per quarter</b> (or half): how many segments each period has, from 1 to 6. With quarters the default
            is 2, a sub at the middle and the end of each quarter. With halves it’s 4.
          </li>
        </ul>
        <p>More segments means more subs and shorter stretches on the bench, but more to manage on the sideline.</p>
        <h2>Default rules</h2>
        <p>
          The rules next5 follows when it plans. See <TopicLink id="rules">How the rotation is built</TopicLink> for what
          each one does.
        </p>
        <h2>Also here</h2>
        <ul>
          <li>
            <b>Back up this team</b>: a file with just this team, for example to give to another coach. See{' '}
            <TopicLink id="backup">Backups</TopicLink>.
          </li>
          <li>
            <b>Archive team</b> and <b>Delete team</b>. See <TopicLink id="roster">Teams and players</TopicLink>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'new-game',
    title: 'Plan a game',
    summary: 'Opponent, date, who’s coming, and generating the plan.',
    group: 'Before the game',
    body: (
      <>
        <Steps>
          <li>
            Open the team and, on the <b>Games</b> tab, tap <b>+ New game</b>.
          </li>
          <li>
            Add the <b>Opponent</b> (optional) and check the <b>Date</b>.
          </li>
          <li>
            Under <b>Attending</b>, everyone active is checked. Uncheck anyone who isn’t coming. You need at least 5.
          </li>
          <li>
            Change the <b>Format</b> or the <b>Rules for this game</b> if this game is different. They start from the
            team’s settings.
          </li>
          <li>
            Tap <b>Generate plan</b>.
          </li>
        </Steps>
        <Shot name="setup" />
        <p>
          The plan takes well under a second. If next5 can’t make one, it says why in plain words and how to fix it, for
          example “Not enough attending players can play Center”. Mark another player as able to play that position, or
          lower the position requirement.
        </p>
        <Tip>
          Someone running late? Leave them checked if you expect them. If they don’t show, mark them out on game day and
          re-plan (<TopicLink id="changes">how</TopicLink>). If you unchecked them and they turn up, add them as a late
          arrival.
        </Tip>
        <p>
          You can open <b>Setup</b> again from the plan at any time, for example to change the date or delete the game.
          Changing who’s attending, the format or the rules makes a fresh plan. Once the game starts, only the opponent
          and date can change.
        </p>
      </>
    ),
  },
  {
    id: 'plan',
    title: 'Reading the plan',
    summary: 'Step through each segment, or see the whole game in the grid.',
    group: 'Before the game',
    body: (
      <>
        <p>The plan opens on the first segment. There are two views, picked at the top:</p>
        <h2>Segments</h2>
        <p>
          One segment at a time: the five <b>On court</b>, each with the position they play, then the <b>Bench</b>. Step
          with <b>‹</b> and <b>›</b>, or tap a number under Q1–Q4 to jump straight to it. A small dot on a number means
          that segment has locks.
        </p>
        <Shot name="plan" />
        <h2>Grid</h2>
        <p>
          The whole game at once: players down the side, segments across. A letter shows the position a player covers in
          that segment (G, F, C) and an empty cell means they sit. The last column is each player’s total, so you can
          check fairness at a glance. A ringed cell is locked in and ✕ is locked out. Tap a column heading to open that
          segment.
        </p>
        <Shot name="plan-grid" />
        <h2>Heads up</h2>
        <p>
          If next5 couldn’t follow every rule, a <b>Heads up</b> box lists exactly what gave and who it affects, for
          example “Avery sits 2 segments in a row”. This usually happens when only a few players can cover a required
          position. It’s information, not an error: you can start the game as it is, or change the plan.
        </p>
        <p>
          Want a different plan that’s just as fair? Tap <b>↻ Shuffle</b>. To make changes yourself, see{' '}
          <TopicLink id="edit-plan">Changing the plan</TopicLink>.
        </p>
      </>
    ),
  },
  {
    id: 'edit-plan',
    title: 'Changing the plan',
    summary: 'Swap players, lock them in or out, and redo part of the game.',
    group: 'Before the game',
    body: (
      <>
        <p>
          You know your team best. In the <b>Segments</b> view, tap any player to change their spot in that segment:
        </p>
        <Shot name="plan-player" />
        <ul>
          <li>
            <b>Swap with someone on the bench</b> (for a player on the court) or <b>Put in for someone</b> (for a player on
            the bench). Players who can play the open position are listed first.
          </li>
          <li>
            <b>🔒 Lock in</b> keeps the player on the court in that segment. next5 picks who sits instead.
          </li>
          <li>
            <b>🔒 Lock out</b> keeps them on the bench. next5 picks a sub.
          </li>
          <li>
            <b>Unlock</b> lets next5 decide again.
          </li>
        </ul>
        <h2>The rest of the plan adjusts</h2>
        <p>
          After every change, next5 re-fills the plan straight away to keep playing time fair, moving as few players as
          possible. A note says which other lineups changed, and <b>↶ Undo</b> puts everything back.
        </p>
        <Shot name="plan-notice" caption="Locking someone out: two other lineups changed to keep it fair." />
        <p>
          A swap is kept as a pair of locks, so later changes never quietly undo it. Locked players show{' '}
          <b>🔒 In</b> or <b>🔒 Out</b>.
        </p>
        <h2>Whole lineups and fresh starts</h2>
        <ul>
          <li>
            <b>🔒 Lock lineup</b> locks all five in the segment you’re looking at, for example your starting five or a
            closing lineup.
          </li>
          <li>
            <b>↻ Redo from here</b> makes new lineups from this segment to the end, keeping earlier segments and every
            lock.
          </li>
          <li>
            <b>↻ Shuffle</b> (at the bottom) makes a whole new plan, still keeping your locks.
          </li>
        </ul>
        <h2>When a change isn’t possible</h2>
        <p>
          If a change would leave a lineup without a required position, or lock out so many players there aren’t five
          left, next5 doesn’t make it and says what’s in the way, such as “nobody left can play Center”. If a change
          only bends a rule, for example someone sits twice in a row, it asks first and you can tap <b>Swap anyway</b>.
        </p>
        <Tip>
          Lock first, then let next5 fill in the rest. Locking your starting five and your closing five, then letting it
          plan the middle, is quicker than building every lineup by hand.
        </Tip>
      </>
    ),
  },
  {
    id: 'rules',
    title: 'How the rotation is built',
    summary: 'The four rules, which one wins, and what “fair” means here.',
    group: 'Before the game',
    body: (
      <>
        <p>
          next5 builds the plan one segment at a time. For each one it picks the five who are most due to play, while
          making sure the positions are covered and nobody sits too long. It makes dozens of versions of the plan and
          keeps the one that follows your rules best. Each rule can be turned on or off for the team
          (Settings tab) or for one game (its Setup).
        </p>
        <dl className="help-terms">
          {(Object.keys(RULE_HELP) as (keyof typeof RULE_HELP)[]).map((key) => (
            <div key={key}>
              <dt>{RULE_HELP[key].label}</dt>
              <dd>{RULE_HELP[key].help}</dd>
            </div>
          ))}
        </dl>
        <p>
          <b>Cover positions</b>, <b>Equal playing time</b> and <b>Don’t sit too long</b> are on to start with.{' '}
          <b>Balance skill</b> is off.
        </p>
        <h2>When rules clash</h2>
        <p>They win in this order:</p>
        <Steps>
          <li>Cover positions (never broken in a plan next5 makes)</li>
          <li>Equal playing time</li>
          <li>Don’t sit too long</li>
          <li>Balance skill</li>
        </Steps>
        <p>
          When a rule has to give, the plan shows a <b>Heads up</b> saying who is affected. Among plans that follow the
          rules equally well, next5 prefers one that puts players at their strongest positions.
        </p>
        <h2>What “fair” means</h2>
        <p>
          Playing time is counted in segments, not minutes. With 9 players and 8 segments there are 40 spots on the court,
          so four players get 5 segments and five get 4. Over a season the extra segments even out, and the team’s{' '}
          <b>Stats</b> tab lets you check. A segment that runs long, or a sub in the middle of one, isn’t timed: the goal
          is fair playing time, not a stopwatch.
        </p>
        <h2>“Don’t sit too long” in numbers</h2>
        <p>
          With 6 to 10 players, nobody sits two segments in a row. With 11 to 15, nobody sits more than two in a row. With
          more players there simply aren’t enough spots to do better.
        </p>
      </>
    ),
  },
  {
    id: 'game-day',
    title: 'Running a game',
    summary: 'The Game Day screen, Next, Undo and ending the game.',
    group: 'Game day',
    body: (
      <>
        <p>
          Tap <b>Start game</b> on the plan. The Game Day screen shows everything you need on one screen, with no
          scrolling:
        </p>
        <Shot name="gameday" />
        <ul>
          <li>
            <b>At the top</b>: the segment you’re in (for example <b>Q1 · 2 of 2</b>) and a progress bar for the whole game.
          </li>
          <li>
            <b>On court</b>: the five playing now, each with a position box (<b>G</b>, <b>F</b> or <b>C</b>). Players
            coming off at the next sub are marked <b>OUT next</b>.
          </li>
          <li>
            <b>Next</b>: the sub coming up. Each green <b>▲</b> player, with their jersey number, goes in at the position
            shown, for the red <b>▼</b> player beside them. If someone already on the court changes position, it says so
            underneath, for example “Emery moves to <b>F</b>”.
          </li>
        </ul>
        <Steps>
          <li>At the sub, call the players marked ▲ in and ▼ out.</li>
          <li>
            Tap the big <b>Next</b> button. The screen moves on to the new segment.
          </li>
          <li>
            Tapped Next by mistake? <b>↶ Undo</b> steps back one segment.
          </li>
          <li>
            On the last segment the button says <b>End game</b>. Tap it when the game is over.
          </li>
        </Steps>
        <p>
          The screen stays awake during a game. If the phone won’t allow that, the Edit menu says so: set Auto-Lock to
          Never in the phone’s Settings → Display &amp; Brightness. If the phone locks anyway, a call comes in, or you
          switch apps, next5 opens right where you left off.
        </p>
        <Tip>
          Overtime? On the last segment tap <b>+ OT</b> to add another lineup, planned with the same rules.
        </Tip>
        <p>
          Things change during games. <TopicLink id="changes">When things change</TopicLink> covers injuries, rests,
          late arrivals and subs off the plan.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'When things change',
    summary: 'Injuries, rests, late arrivals, subbing now and re-planning.',
    group: 'Game day',
    body: (
      <>
        <p>Every change is at most two taps away. Tap a player on the court, or tap <b>Edit</b> at the top right:</p>
        <Shot name="gameday-player" />
        <h2>Sub someone out right now</h2>
        <p>
          Tap the player on the court, then <b>Sub out now</b>, and pick who goes in. Both players get credit for the
          segment.
        </p>
        <h2>Send in someone else at the next sub</h2>
        <p>
          Tap a green <b>▲</b> player and pick who goes in instead. Only the next lineup changes, and a later re-plan
          keeps your pick.
        </p>
        <h2>Injury, or a player leaves</h2>
        <p>
          Tap the player, then <b>Injured or leaving</b>. If they’re on the court, pick who replaces them now. They’re out
          for the rest of the game.
        </p>
        <h2>A rest</h2>
        <p>
          Tap the player, then <b>Rest for 1, 2 or 3 segments</b>. They come back into the plan after that.{' '}
          <b>Available again</b> brings them back early.
        </p>
        <h2>Late arrival</h2>
        <p>
          Tap <b>Edit</b>, then <b>Show players not here</b>, tap the player and choose <b>Arrived</b>. They can play from
          the next segment.
        </p>
        <h2>Re-plan the rest of the game</h2>
        <p>
          After an injury, rest or arrival, next5 offers to re-plan the segments still to come. A preview shows each
          lineup that changes, with new players highlighted, before you tap <b>Use new plan</b>. It moves as few players as
          possible, keeps your earlier picks and never touches segments already played. If an earlier pick can’t work any
          more (say the player you sent in is now hurt), the preview says that lineup was made again.
        </p>
        <Shot name="replan" />
        <p>
          Tap <b>Keep plan</b> to carry on as you were. While someone who can’t play is still in an upcoming lineup, a
          yellow banner reminds you, with a <b>Re-plan</b> button.
        </p>
        <h2>The Edit menu</h2>
        <p>
          <b>Edit</b> lists everyone at the game with where they are (on the court, on the bench, resting, out), plus{' '}
          <b>Re-plan rest of game</b>, <b>See full plan</b> (every lineup, starting at the one on the court now),{' '}
          <b>+ Add overtime segment</b>, <b>Share game</b>, <b>Game setup</b> and <b>End game now</b>.
        </p>
        <Shot name="gameday-menu" />
        <h2>The game ends early</h2>
        <p>
          If time runs out before the plan does, tap <b>Edit</b> → <b>End game now</b> and confirm. The segment on the
          court counts as played and the rest of the plan isn’t counted. Ended by mistake? <b>↶ Undo end of game</b> on
          the Final screen picks up where you were.
        </p>
        <h2>Picking a replacement</h2>
        <p>
          When you choose who goes in, players who can play the open position are listed first, and everyone shows the
          positions they play (G, F, C). If your pick breaks one of your rules, for example nobody covers Center, next5
          tells you and you can tap <b>Swap anyway</b>. During a game you’re always in charge.
        </p>
      </>
    ),
  },
  {
    id: 'final',
    title: 'Game summary and season stats',
    summary: 'Who played how much, what changed, and exporting to a spreadsheet.',
    group: 'After the game',
    body: (
      <>
        <h2>The Final screen</h2>
        <p>After you tap End game, next5 shows a row for each player:</p>
        <ul>
          <li>
            <b>Plan</b>: segments they had in the plan when the game started (up to where it ended, if it ended early).
          </li>
          <li>
            <b>Played</b>: segments they actually played. A sub in the middle of a segment counts for both players. It’s
            highlighted when it’s below the plan.
          </li>
          <li>
            <b>Sat</b>: segments they sat while available. Time out injured, resting or not yet there isn’t counted.
          </li>
          <li>
            <b>Positions</b>: where they played, for example <b>G</b> 3 <b>F</b> 1.
          </li>
        </ul>
        <Shot name="final" />
        <p>
          <b>Changes from the plan</b> lists every sub, injury, rest, re-plan and overtime, with when it happened.
        </p>
        <ul>
          <li>
            <b>Export stats (CSV)</b> sends the table to Files, Mail or Numbers.
          </li>
          <li>
            <b>Share game</b> sends the finished game to an assistant for their records (
            <TopicLink id="share">how</TopicLink>).
          </li>
          <li>
            <b>↶ Undo end of game</b> goes back to the last segment, if you ended it too soon.
          </li>
          <li>
            <b>Game setup</b> changes the opponent or date, or deletes the game.
          </li>
        </ul>
        <p>Finished games stay in the team’s Games list marked <b>Final</b>. Tap one to see its summary again.</p>
        <h2>Season stats</h2>
        <p>
          The team’s <b>Stats</b> tab adds up every finished game: games played, segments played, the share of the
          segments they were available for that they played (%), and segments at each position. Use it to spot anyone
          who’s been short over a few games and give them a little more next time with a lock.
        </p>
        <Shot name="stats" />
        <p>
          <b>Export season stats (CSV)</b> opens in Excel, Numbers or Google Sheets. Skill levels are never included.
        </p>
      </>
    ),
  },
  {
    id: 'share',
    title: 'Share a game with an assistant',
    summary: 'Hand the game to another phone before, during or after it.',
    group: 'Sharing and your data',
    body: (
      <>
        <p>
          If an assistant runs the subs on their phone, either of you can share the game with the other at any point.
          Tap <b>Share game</b> on the plan, in the Game Day <b>Edit</b> menu, or on the Final screen.
        </p>
        <Shot name="share" />
        <ul>
          <li>
            <b>Text a link</b>: for Messages, WhatsApp or email, when you’re not together.
          </li>
          <li>
            <b>AirDrop a file</b>: when you’re standing together. Works with no signal.
          </li>
        </ul>
        <h2>Opening a shared game</h2>
        <p>
          Tap the link, check what it is, and tap <b>Open here</b>. It brings the team and players with it, so the other
          phone doesn’t need them set up first.
        </p>
        <Shot name="receive" />
        <Tip title="Using the Home Screen app?">
          Links open in Safari, which keeps its own data. Tap <b>Copy for the next5 app</b>, open next5 from your Home
          Screen, and tap <b>Paste game</b> on the Teams screen. For an AirDropped file, tap <b>Open game file</b> there.
        </Tip>
        <h2>Ways to use it</h2>
        <ul>
          <li>
            <b>Before the game</b>: the coach shares the plan. Changed something? Share again. The new copy replaces the
            old one until the assistant starts the game.
          </li>
          <li>
            <b>The assistant has to leave</b>: they share the game in progress. The coach opens it and carries on from the
            same segment, with every sub so far.
          </li>
          <li>
            <b>The assistant missed a game</b>: the coach shares the finished game, so the assistant’s season stats are
            complete.
          </li>
        </ul>
        <h2>One phone runs the game</h2>
        <p>
          After you share a game that isn’t finished, your phone shows <b>Shared with the other phone</b>. You can still
          change a planned game and <b>Share again</b>, but not start it. A game in progress is locked: no Next and no
          subs. If the other phone can’t carry on (a flat battery, say), tap <b>Take back control</b>.
        </p>
        <p>
          next5 never lets an older copy wipe out newer work. If you open a copy that has played fewer segments than
          yours, it asks before replacing anything. If both phones changed the game, you choose which to keep.
        </p>
      </>
    ),
  },
  {
    id: 'backup',
    title: 'Backups and your data',
    summary: 'Where your teams are kept, and how to back up and restore them.',
    group: 'Sharing and your data',
    body: (
      <>
        <p>
          Everything is saved on this phone as you go, and nothing is sent anywhere: next5 has no account, no server and
          no tracking. That also means your teams are <b>lost if you delete the app</b> or clear Safari’s website data.
          A backup file keeps them safe.
        </p>
        <h2>Back up</h2>
        <Steps>
          <li>
            On the Teams screen, tap <b>Settings</b> (top right).
          </li>
          <li>
            Tap <b>Back up all teams</b>.
          </li>
          <li>
            In the share sheet, choose <b>Save to Files</b> (iCloud Drive is a good place) or AirDrop it to another
            device.
          </li>
        </Steps>
        <Shot name="settings" />
        <p>
          To back up one team, open it and use <b>Back up this team</b> on its Settings tab. If you’ve never backed up, or
          it’s been over a month, the Teams screen reminds you. <b>Later</b> hides the reminder for a week.
        </p>
        <h2>Restore</h2>
        <p>
          <b>Settings</b> → <b>Restore from a backup file</b>, and pick the file. next5 shows what’s in it, then:
        </p>
        <ul>
          <li>
            <b>Merge into this phone</b> adds anything missing. Where both have a copy, the more recently changed one is
            kept. Nothing is deleted.
          </li>
          <li>
            <b>Replace everything</b> makes this phone match the backup exactly. You’re asked to confirm first, and told
            which teams on this phone aren’t in the backup and would be deleted.
          </li>
        </ul>
        <Tip title="New phone?">
          Back up on the old phone, save the file to iCloud Drive, then install next5 on the new phone and restore it.
        </Tip>
      </>
    ),
  },
  {
    id: 'settings',
    title: 'Appearance and updates',
    summary: 'Light or dark, getting new versions, and the app version.',
    group: 'Sharing and your data',
    body: (
      <>
        <h2>Light or dark</h2>
        <p>
          next5 is dark to start with, which is easiest to read in most gyms. On the Teams screen tap <b>Settings</b> →{' '}
          <b>Appearance</b> and pick <b>Light</b> (clearer outdoors or in a bright room) or <b>Match phone</b> to follow
          your iPhone’s setting. In the Home Screen app, the clock and battery at the very top switch the next time you
          open next5.
        </p>
        <h2>Updates</h2>
        <p>
          next5 checks for a new version every hour while it’s open. When one has downloaded, a banner says{' '}
          <b>A new version of next5 is ready</b>. Tap <b>Update</b> when it suits you. Your teams and games are kept, and
          next5 offers to make a backup first, just in case. The banner never appears during a game. To check straight away, tap <b>Check for updates</b> in Settings. After an update, a short note says what’s new; <b>Settings → What’s new</b> lists every version.
        </p>
        <h2>Version and diagnostics</h2>
        <p>
          Settings shows the version number. <b>Diagnostics</b> shows what this phone reports about its screen and
          browser, which helps if something looks wrong.
        </p>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'Questions and troubleshooting',
    summary: 'Answers to common questions.',
    group: 'Questions',
    body: (
      <dl className="help-faq">
        <dt>Why does one player get more segments than another?</dt>
        <dd>
          The spots on the court don’t always divide evenly. With 9 players and 8 segments, four players get one more
          segment than the rest. next5 keeps the difference to one, and over a season it evens out. Check the team’s{' '}
          <b>Stats</b> tab, and lock in anyone who’s been short.
        </dd>
        <dt>Why does someone sit twice in a row?</dt>
        <dd>
          Usually because of positions: if only a few players can play Center and Center is required, those players have
          to play more, and others sit more. The <b>Heads up</b> box says when this happens. Marking more players as able
          to play that position helps most.
        </dd>
        <dt>“Generate plan” says it can’t make a plan</dt>
        <dd>
          The message says why. Most often there aren’t enough attending players who can cover a required position. Mark
          another player as able to play it on the Roster tab, or lower the position requirement on the Settings tab.
        </dd>
        <dt>I locked one player and other lineups changed</dt>
        <dd>
          That’s next5 keeping playing time fair: if one player gets an extra segment, someone else gets one fewer. The
          note says which lineups changed, and <b>↶ Undo</b> puts them back.
        </dd>
        <dt>A segment ran long, or I subbed mid-segment</dt>
        <dd>
          next5 counts segments, not minutes. A mid-segment sub counts the segment for both players. Fairness is best
          effort: it gets everyone close, and the season stats show how it’s going.
        </dd>
        <dt>My teams disappeared</dt>
        <dd>
          Check you’re in the same place you made them: the Home Screen app and Safari keep separate data. If the app was
          deleted, restore your latest backup (<TopicLink id="backup">how</TopicLink>).
        </dd>
        <dt>Does next5 need internet?</dt>
        <dd>
          No. Once installed it works with no signal. You need internet only to install it, to get updates and to text a
          game link.
        </dd>
        <dt>Is my team’s information private?</dt>
        <dd>
          Yes. Everything stays on your phone. next5 has no account and sends nothing anywhere, except a game you choose to
          share.
        </dd>
        <dt>The screen turned off during a game</dt>
        <dd>
          next5 asks the phone to stay awake during a game, but it can still lock now and then. Unlock it and you’re
          back exactly where you were. Nothing is lost.
        </dd>
        <dt>Can two coaches use the same team?</dt>
        <dd>
          Each phone has its own copy. Share a game to hand it over (<TopicLink id="share">how</TopicLink>), or send a
          backup of the team to set up the other phone.
        </dd>
        <dt>How do I see the intro again?</dt>
        <dd>
          Open <b>Help</b> and tap <b>Replay the intro</b>.
        </dd>
      </dl>
    ),
  },
];

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}
