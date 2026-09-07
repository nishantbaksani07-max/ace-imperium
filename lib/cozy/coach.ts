// Food Coach loader set. Shown while the macro page's AI food coach is thinking
// about a recommendation (the planned AI Food Coach gem). Warm, food-and-habit
// flavored. Seed content; expandable via lib/cozy/PROMPT.md (section: coach).

import type { CozySet } from './types'

export const COACH_SET: CozySet = {
  id: 'coach',
  label: 'Fuel · Food coach',
  title: 'Your coach is thinking…',
  tags: ['Coach says', 'Food coach', 'Tip', 'Worth a bite', 'Heads up'],
  tones: ['mint', 'blue', 'amber'],
  items: [
    { text: 'A plate with some color usually has some balance too.', highlight: 'some color', tone: 'mint' },
    { text: 'Protein at every meal keeps the hunger quieter all day.', highlight: 'keeps the hunger quieter', tone: 'mint' },
    { text: 'Water first, snacks second, your body mixes the two up.', highlight: 'mixes the two up', tone: 'blue' },
    { text: 'One good swap beats ten rules you will not keep.', highlight: 'One good swap', tone: 'amber' },
    { text: 'Fiber is the quiet hero of a meal that fills you.', highlight: 'quiet hero', tone: 'blue' },
    { text: 'Most meals get better with a handful of something green.', highlight: 'something green', tone: 'mint' },
    { text: 'A little fat helps you actually absorb the good stuff.', highlight: 'absorb the good stuff', tone: 'amber' },
    { text: 'Looking at the whole day beats judging one single meal.', highlight: 'the whole day', tone: 'mint' },
    { text: 'Slow bites give your stomach time to catch your brain.', highlight: 'catch your brain', tone: 'blue' },
    { text: 'Progress at the table is mostly small, repeatable choices.', highlight: 'small, repeatable choices', tone: 'mint' },
  ],
}
