// Pure catalog + grouping for the "Folded Notes" context store. No IO, no React.

export type ContextArea = 'life' | 'people' | 'self'

export interface ContextStub {
  pre: string          // the finished lead-in, ends right before the blank
  post: string         // text after the blank (always '.')
  placeholder: string  // faint example fill for the inline input
  calm?: boolean       // the single heaviest line: calmer, never nudged
}

export interface AreaDef {
  key: ContextArea
  label: string
  helper: string
  stubs: ContextStub[]
}

export const CONTEXT_AREAS: AreaDef[] = [
  {
    key: 'life',
    label: 'Life right now',
    helper: 'a couple of quick things',
    stubs: [
      { pre: 'Right now I am dealing with ', post: '.', placeholder: 'exams, low sleep' },
      { pre: 'What is weighing on me lately is ', post: '.', placeholder: 'a lot lately', calm: true },
      { pre: 'The thing I keep putting off is ', post: '.', placeholder: 'a hard task' },
      { pre: 'Money wise, right now ', post: '.', placeholder: 'a bit tight' },
    ],
  },
  {
    key: 'people',
    label: 'People',
    helper: 'a couple of quick things',
    stubs: [
      { pre: 'The people who matter most to me are ', post: '.', placeholder: 'my close few' },
      { pre: 'Things are tense with ', post: '.', placeholder: 'my dad' },
      { pre: 'The person I lean on when it is bad is ', post: '.', placeholder: 'one friend' },
    ],
  },
  {
    key: 'self',
    label: 'You',
    helper: 'a couple of quick things',
    stubs: [
      { pre: 'I feel most like myself when ', post: '.', placeholder: 'i lift' },
      { pre: 'What drains me fastest is ', post: '.', placeholder: 'people stuff' },
      { pre: 'When I am low it usually helps to ', post: '.', placeholder: 'a walk', calm: true },
    ],
  },
]

const AREA_KEYS: ContextArea[] = ['life', 'people', 'self']

export function isContextKind(kind: string): kind is ContextArea {
  return (AREA_KEYS as string[]).includes(kind)
}

export interface SavedContextFact {
  id: string
  area: ContextArea
  body: string
}

export function groupFactsByArea(facts: SavedContextFact[]): Record<ContextArea, SavedContextFact[]> {
  const out: Record<ContextArea, SavedContextFact[]> = { life: [], people: [], self: [] }
  for (const f of facts) {
    if (isContextKind(f.area)) out[f.area].push(f)
  }
  return out
}
