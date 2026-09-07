// Finance loader set. Friendly money nudges while finances load or import.
// Generated via lib/cozy/PROMPT.md (section: finance). Highlights are exact substrings.

import type { CozySet } from './types'

export const FINANCE_SET: CozySet = {
  id: 'finance',
  label: 'Finance',
  title: 'Crunching the numbers…',
  tags: ['Money note', 'Did you know', 'Smart move', 'Heads up'],
  tones: ['mint', 'amber'],
  items: [
    { text: 'Knowing where your money goes is half the battle won.', highlight: 'half the battle won', tone: 'mint' },
    { text: 'Tiny recurring charges add up quietly, worth a yearly peek.', highlight: 'add up quietly', tone: 'amber' },
    { text: 'Saving a little often beats saving a lot never.', highlight: 'a little often', tone: 'mint' },
    { text: 'Future you is quietly grateful for every dollar you tuck away.', highlight: 'quietly grateful', tone: 'mint' },
    { text: 'A budget is just a plan being honest with itself.', highlight: 'a plan being honest', tone: 'mint' },
    { text: 'Spending on what you love is easier when the rest is tidy.', highlight: 'what you love', tone: 'amber' },
    { text: 'Money feels calmer the moment you can simply see it.', highlight: 'simply see it', tone: 'mint' },
    { text: 'Small leaks sink big ships, and they are easy to patch.', highlight: 'easy to patch', tone: 'amber' },
    { text: 'Watching a number grow is its own quiet thrill.', highlight: 'quiet thrill', tone: 'mint' },
    { text: 'Round numbers are friendlier when you actually track them.', highlight: 'actually track them', tone: 'mint' },
    { text: 'Every dollar named is a dollar that stops wandering off.', highlight: 'stops wandering off', tone: 'amber' },
    { text: 'Progress here is rarely loud, it mostly just compounds.', highlight: 'it mostly just compounds', tone: 'mint' },
    { text: 'Checking your balance is brave and it gets easier.', highlight: 'is brave', tone: 'amber' },
    { text: 'Habits beat heroics when it comes to a steady balance.', highlight: 'Habits beat heroics', tone: 'mint' },
    { text: 'Seeing the real number is calmer than guessing at it.', highlight: 'calmer than guessing', tone: 'mint' },
    { text: 'One tracked week tells you more than a month of worry.', highlight: 'One tracked week', tone: 'mint' },
    { text: 'Little treats are allowed, awareness is the real win.', highlight: 'awareness is the real win', tone: 'amber' },
    { text: 'Quiet months of saving become loud results later.', highlight: 'loud results later', tone: 'mint' },
    { text: 'Most overspending is just unnoticed spending, so peeking helps.', highlight: 'unnoticed spending', tone: 'amber' },
    { text: 'Setting money aside today is a gift you mail to next year.', highlight: 'a gift you mail', tone: 'mint' },
    { text: 'Bills look smaller once they are all in one place.', highlight: 'all in one place', tone: 'mint' },
    { text: 'Once you see the pattern, the rest gets a lot easier.', highlight: 'you see the pattern', tone: 'amber' },
    { text: 'Good money days are mostly boring, and boring is the point.', highlight: 'boring is the point', tone: 'mint' },
    { text: 'Cancelling one thing you never use feels surprisingly great.', highlight: 'surprisingly great', tone: 'amber' },
    { text: 'Steady saving is less about willpower than about a system.', highlight: 'about a system', tone: 'mint' },
    { text: 'Where the money went is a story worth reading.', highlight: 'a story worth reading', tone: 'amber' },
    { text: 'Plenty of calm comes from simply opening the app.', highlight: 'simply opening the app', tone: 'mint' },
    { text: 'Paying attention is free and it pays for itself.', highlight: 'free', tone: 'amber' },
    { text: 'Tracking turns a vague worry into a number you can hold.', highlight: 'a number you can hold', tone: 'mint' },
    { text: 'Balance is not a finish line, it is a habit you keep.', highlight: 'a habit you keep', tone: 'mint' },
  ],
}
