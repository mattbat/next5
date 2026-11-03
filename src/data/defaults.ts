import type { RuleSettings } from '../engine';
import type { GameFormat, Position } from './types';

export const DEFAULT_POSITIONS: Position[] = [
  { id: 'G', name: 'Guard', short: 'G' },
  { id: 'F', name: 'Forward', short: 'F' },
  { id: 'C', name: 'Center', short: 'C' },
];

export const DEFAULT_FORMAT: GameFormat = { periodType: 'quarters', segmentsPerPeriod: 2 };

export const DEFAULT_RULES: RuleSettings = {
  positionCoverage: true,
  equalTime: true,
  limitBench: true,
  balanceSkill: false,
};

export const SKILL_LEVELS = [
  { level: 1, name: 'Rising', help: 'Still learning this position' },
  { level: 2, name: 'Steady', help: 'Comfortable and reliable here' },
  { level: 3, name: 'Go-To', help: 'Who you want here in a close game' },
] as const;

/** Made-up players for "Load demo team", so the app can be tried right away. */
export const DEMO_PLAYERS: { name: string; number: string; skills: Partial<Record<string, 1 | 2 | 3>> }[] = [
  { name: 'Avery', number: '3', skills: { G: 3, F: 1 } },
  { name: 'Blake', number: '5', skills: { G: 2 } },
  { name: 'Casey', number: '10', skills: { F: 2, C: 3 } },
  { name: 'Devon', number: '12', skills: { F: 3, C: 1 } },
  { name: 'Emery', number: '14', skills: { G: 1, F: 2 } },
  { name: 'Finley', number: '20', skills: { G: 2, F: 2 } },
  { name: 'Harper', number: '22', skills: { C: 2, F: 1 } },
  { name: 'Jordan', number: '23', skills: { G: 3 } },
  { name: 'Kai', number: '30', skills: { F: 2 } },
  { name: 'Logan', number: '33', skills: { G: 1, C: 1 } },
];
