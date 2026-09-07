/**
 * The gibberish guard (TRAIN 4, "bullshit tracker"): a deterministic, pure
 * check that a goal title is sayable human words before it is allowed to save.
 * No AI, no IO: regex + counting only, so it is fast, free, and testable.
 *
 * Rejects (isGibberish returns true) when a title is:
 *   - shorter than 3 letters ("ok" is not a goal),
 *   - one character mashed ("aaaaaa", "......"),
 *   - a consonant mash with no sayable word anywhere ("sdfghjkl wqrtp"),
 *   - a keyboard-row run ("asdf", "qwerty"),
 *   - a short repeated pattern ("hahahahaha", "abababab").
 *
 * The bar is deliberately LOW: this guard only has to stop keyboard mash, never
 * judge a real goal. Any title containing at least one plausible word ("gym",
 * "run 5k", "save 10k", a name, a verb) passes. False rejects are worse than
 * false passes here: Vee asks the user to say it plainly, so a wrongly blocked
 * real goal would be insulting. A goal in ANY non-Latin script (Cyrillic, CJK,
 * Greek, Arabic, ...) always passes; the mash heuristics only know ASCII.
 *
 * Wired server-side into createBigGoal (the authoritative gate) and surfaced
 * client-side with the warm one-liner: "help me out, say it plainly and I can
 * steer it."
 */

/** y counts as a vowel: gym, fly, dry are all real words. */
const VOWEL = /[aeiouy]/

/** 5+ consonants in a row is keyboard territory ("sdfgh"), not English. */
const CONSONANT_MASH = /[bcdfghjklmnpqrstvwxz]{5,}/

/** A 4-char run straight off one keyboard row is mash even when it carries a
 *  vowel ("asdf", "qwerty"). 'erty' is deliberately absent: liberty, property
 *  and poverty contain it. */
const KEYBOARD_ROW = /(qwer|wert|rtyu|tyui|yuio|uiop|asdf|sdfg|dfgh|fghj|ghjk|hjkl|zxcv|xcvb|cvbn)/

/** In English, q is followed by u (quit, squat, quinoa). A bare q mid-token
 *  ("giahrupqiuhger") is a keyboard tell, not a word. The rare loanwords
 *  (qi, burqa, iraq) ride along with the rest of a real title. */
const LONE_Q = /q(?![u])/

/** Any letter outside ASCII: a non-Latin script the mash rules cannot judge. */
const NON_ASCII = /[^\x00-\x7f]/

/**
 * True when a single token reads as a plausible word: it has a vowel, it is not
 * one character repeated, and it never mashes 5+ consonants in a row, runs down
 * a keyboard row, or drops a bare q. Tokens with digits ("5k", "10k", "8h") are
 * treated as plausible, numbers are how real goals speak. A token with any
 * non-ASCII letter is plausible too (the heuristics below only know ASCII).
 */
function isPlausibleWord(token: string): boolean {
  if (/\d/.test(token)) return true
  if (token.length < 2) return false
  if (/^(.)\1+$/.test(token)) return false // "aaaa", "zzzz"
  if (NON_ASCII.test(token)) return true // "книг", "走る": not ours to judge
  if (!VOWEL.test(token)) return false // "sdfg", "qwrt"
  if (CONSONANT_MASH.test(token)) return false // "asdfghjkl" has an a but is mash
  if (KEYBOARD_ROW.test(token)) return false // "asdf", "qwerty"
  if (LONE_Q.test(token)) return false // "giahrupqiuhger"
  return true
}

/** A short pattern (1-3 chars) repeated 3+ times to fill the string: "hahahaha",
 *  "abcabcabc", "xoxoxo". A real word never looks like this at goal length. */
function isRepeatedPattern(s: string): boolean {
  if (s.length < 6) return false
  for (let n = 1; n <= 3; n++) {
    if (s.length < n * 3) continue
    const unit = s.slice(0, n)
    // Allow a truncated final repeat ("lololol"): periodicity is the tell.
    if (unit.repeat(Math.ceil(s.length / n)).slice(0, s.length) === s) return true
  }
  return false
}

/**
 * The guard. True = reject (keyboard mash / no real words / too short).
 * Pure and deterministic; test in __tests__/gibberish.test.ts.
 */
export function isGibberish(title: string): boolean {
  const t = (title ?? '').toLowerCase().trim()
  // Count only letters+digits toward length so "!!!" or "..." cannot pass.
  // Unicode-aware, so a Cyrillic or CJK goal is never counted as empty. CJK is
  // dense (two characters can be a whole word), so non-ASCII meat needs 2.
  const meat = t.replace(/[^\p{L}\p{N}]/gu, '')
  if (meat.length < (NON_ASCII.test(meat) ? 2 : 3)) return true
  if (/^(.)\1+$/.test(meat)) return true
  if (isRepeatedPattern(meat)) return true

  const tokens = t.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (tokens.length === 0) return true
  // One plausible word anywhere redeems the whole title.
  return !tokens.some(isPlausibleWord)
}
