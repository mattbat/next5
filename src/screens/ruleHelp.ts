import type { RuleSettings } from '../engine';

/** Labels and in-app explanations for each rule (H-4). */
export const RULE_HELP: Record<keyof RuleSettings, { label: string; help: string }> = {
  positionCoverage: {
    label: 'Cover positions',
    help: 'Every lineup meets the position requirement. This is never relaxed: if it can’t be met, the app tells you what’s missing.',
  },
  equalTime: {
    label: 'Equal playing time',
    help: 'Everyone plays the same number of segments, give or take one.',
  },
  limitBench: {
    label: "Don't sit too long",
    help: 'Players go back in as soon as the roster allows. With 10 or fewer players nobody sits twice in a row; with 11–15, nobody sits more than two in a row.',
  },
  balanceSkill: {
    label: 'Balance skill',
    help: 'Avoids putting several Rising players on the court together, and spreads Go-To players across the game.',
  },
};
