import type { Court } from './types';

/**
 * Common youth drills for 9U and 12U teams (PR3), added to the library only
 * when the coach asks. The coach keeps, edits or deletes them. `key` stays
 * the same forever, so adding starter drills again skips ones already added.
 */
export interface StarterDrill {
  key: string;
  name: string;
  minutes: number;
  court: Court;
  tags: string[];
  equipment: string[];
  notes: string;
}

/** Equipment for every practice until the coach changes the team's list (PR6). */
export const DEFAULT_ALWAYS_BRING = ['Basketballs', 'Ball pump', 'Whistle', 'Practice pinnies', 'Water', 'First-aid kit'];

/** Tags offered when editing a drill (PR2). Coaches can add their own. */
export const SUGGESTED_TAGS = [
  'Warm-up',
  'Ball handling',
  'Passing',
  'Shooting',
  'Finishing',
  'Defense',
  'Rebounding',
  'Offense',
  'Transition',
  'Inbounding',
  'Conditioning',
  'Scrimmage',
  'Break',
];

export const STARTER_DRILLS: StarterDrill[] = [
  {
    key: 'dynamic-warm-up',
    name: 'Dynamic warm-up',
    minutes: 8,
    court: 'full',
    tags: ['Warm-up'],
    equipment: [],
    notes: '9U and 12U. Lines on the baseline: jog, high knees, butt kicks, side shuffles, skips and backpedal to half court and back.',
  },
  {
    key: 'stationary-ball-handling',
    name: 'Stationary ball handling',
    minutes: 6,
    court: 'half',
    tags: ['Ball handling', 'Warm-up'],
    equipment: ['A ball for each player'],
    notes: '9U and 12U. Pound dribbles each hand, crossovers, between the legs, around the waist. Eyes up: call out how many fingers the coach holds up.',
  },
  {
    key: 'cone-dribbling',
    name: 'Cone dribbling',
    minutes: 8,
    court: 'full',
    tags: ['Ball handling'],
    equipment: ['Cones', 'A ball for each player'],
    notes: '9U and 12U. Zigzag through cones, changing direction at each one. Weak hand only on the way back. 12U: add a defender with hands behind their back.',
  },
  {
    key: 'dribble-knockout',
    name: 'Dribble knockout',
    minutes: 6,
    court: 'half',
    tags: ['Ball handling', 'Conditioning'],
    equipment: ['A ball for each player'],
    notes: '9U and 12U. Everyone dribbles inside the arc and tries to knock others’ balls away while protecting their own. Out players do 5 form shots and come back in.',
  },
  {
    key: 'partner-passing',
    name: 'Partner passing',
    minutes: 6,
    court: 'half',
    tags: ['Passing', 'Warm-up'],
    equipment: ['A ball for each pair'],
    notes: '9U and 12U. Pairs 10 feet apart: chest, bounce and overhead passes. Step into the pass, thumbs down on the follow-through, catch with two hands and call the passer’s name.',
  },
  {
    key: 'form-shooting',
    name: 'Form shooting',
    minutes: 8,
    court: 'half',
    tags: ['Shooting'],
    equipment: ['A ball for every two players'],
    notes: '9U and 12U. One hand close to the basket, then two hands. Balance, elbow in, eyes on the rim, hold the follow-through. Move back a step after 3 makes.',
  },
  {
    key: 'layup-lines',
    name: 'Layup lines',
    minutes: 8,
    court: 'half',
    tags: ['Finishing', 'Warm-up'],
    equipment: ['3–4 balls'],
    notes: '9U and 12U. Shooting line and rebounding line at the elbows. Right side: right hand, left knee up. Switch sides halfway. 9U: walk it through first.',
  },
  {
    key: 'mikan-drill',
    name: 'Mikan drill',
    minutes: 5,
    court: 'half',
    tags: ['Finishing'],
    equipment: ['A ball for each hoop'],
    notes: '9U and 12U. Alternating layups under the basket, right then left, without letting the ball hit the floor. Count makes in 30 seconds.',
  },
  {
    key: 'defensive-slides',
    name: 'Defensive slides',
    minutes: 6,
    court: 'full',
    tags: ['Defense', 'Conditioning'],
    equipment: [],
    notes: '9U and 12U. Wide stance, butt down, hands active. Slide lane line to lane line without crossing feet. Coach points the direction.',
  },
  {
    key: 'closeouts',
    name: 'Closeouts',
    minutes: 8,
    court: 'half',
    tags: ['Defense'],
    equipment: ['3–4 balls'],
    notes: 'Better for 12U. Defender starts under the basket, passes to the shooter and sprints out, then chops feet with a high hand. Shooter gets one dribble to drive.',
  },
  {
    key: 'box-out',
    name: 'Box-out battle',
    minutes: 6,
    court: 'half',
    tags: ['Rebounding', 'Defense'],
    equipment: ['A ball'],
    notes: '9U and 12U. Coach shoots, defender finds the offensive player, makes contact, sits low and holds until the ball hits the floor. Then go get it.',
  },
  {
    key: 'shell-drill',
    name: 'Shell drill (4 on 4)',
    minutes: 12,
    court: 'half',
    tags: ['Defense', 'Offense'],
    equipment: ['A ball'],
    notes: 'Better for 12U. Four on the perimeter pass around; defense jumps to the ball, on-ball, one pass away, help side. Call out the positions on every pass.',
  },
  {
    key: 'two-on-one',
    name: '2-on-1 fast break',
    minutes: 10,
    court: 'full',
    tags: ['Transition', 'Offense', 'Defense'],
    equipment: ['3–4 balls'],
    notes: '9U and 12U. Two attack one defender. Ball handler goes hard to the basket and passes only if the defender commits. Keep lanes wide.',
  },
  {
    key: 'three-on-two',
    name: '3-on-2, 2-on-1',
    minutes: 12,
    court: 'full',
    tags: ['Transition', 'Offense', 'Defense'],
    equipment: ['A ball'],
    notes: 'Better for 12U. Three attack two. The shooter and passer stay on defense and the other two go back the other way as a 2-on-1.',
  },
  {
    key: 'give-and-go',
    name: 'Give and go',
    minutes: 8,
    court: 'half',
    tags: ['Offense', 'Passing'],
    equipment: ['3–4 balls'],
    notes: '9U and 12U. Pass to the wing, jab away, cut hard to the basket with a hand up, catch and finish. Add a defender once it’s clean.',
  },
  {
    key: 'inbound-box',
    name: 'Inbounds: box play',
    minutes: 8,
    court: 'half',
    tags: ['Inbounding', 'Offense'],
    equipment: ['A ball'],
    notes: '9U and 12U. Four in a box at the lane. On the slap, the bottom players screen up for the top players, who cut to the corners; a guard pops back for safety. Inbounder has 5 seconds.',
  },
  {
    key: 'inbound-sideline',
    name: 'Inbounds: sideline',
    minutes: 6,
    court: 'half',
    tags: ['Inbounding', 'Offense'],
    equipment: ['A ball'],
    notes: '9U and 12U. Practice the safe pass from the sideline under pressure: a cutter comes back to the ball, one clears out. Inbounder fakes before passing.',
  },
  {
    key: 'free-throws',
    name: 'Free throws under pressure',
    minutes: 6,
    court: 'half',
    tags: ['Shooting'],
    equipment: ['A ball for each hoop'],
    notes: '9U and 12U. Two shots each in turn; the team runs a lane line for every miss after the first round. Same routine every shot.',
  },
  {
    key: 'scrimmage',
    name: 'Scrimmage',
    minutes: 15,
    court: 'full',
    tags: ['Scrimmage'],
    equipment: ['Practice pinnies', 'A ball'],
    notes: '9U and 12U. Team A against team B. Stop play to teach the skill of the day, then let them play.',
  },
  {
    key: 'water-break',
    name: 'Water break',
    minutes: 2,
    court: 'half',
    tags: ['Break'],
    equipment: [],
    notes: 'Everyone drinks. Use it to set up the next drill.',
  },
];
