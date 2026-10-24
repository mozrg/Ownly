/**
 * Recognises what kind of recording a title describes.
 *
 * YouTube is full of re-uploads: "(Slowed)", "Sped Up", "Nightcore", "8D".
 * A row that says nothing about its version is assumed to be the original,
 * and anything else gets a badge so the list is honest at a glance.
 */
export type TrackVersion =
  | 'original'
  | 'slowed'
  | 'spedup'
  | 'nightcore'
  | 'remix'
  | 'cover'
  | 'live'
  | 'loop'
  | 'instrumental'

interface VersionRule {
  version: TrackVersion
  label: string
  test: RegExp
}

/** Anything this long is a loop or a full album, never a single track. */
export const LOOP_MIN_SECONDS = 20 * 60

const RULES: VersionRule[] = [
  { version: 'nightcore', label: 'Nightcore', test: /\bnightcore\b/i },
  // Speed changes are checked before "slowed": a title often says
  // "Sped Up + Reverb", and reverb alone does not mean slowed down.
  { version: 'spedup', label: 'Sped Up', test: /\bsped\s*up\b|\bspeed\s*up\b|\bdaycore\b/i },
  { version: 'slowed', label: 'Slowed', test: /\bslowed\b|\bultra\s*slowed\b/i },
  { version: 'instrumental', label: 'Минус', test: /\binstrumental\b|\bминус\b|\bkaraoke\b|\bbacking\s*track\b/i },
  { version: 'cover', label: 'Кавер', test: /\bcover\b|\bкавер\b|\btribute\b/i },
  { version: 'remix', label: 'Ремикс', test: /\bremix\b|\brmx\b|\bbootleg\b|\bmashup\b/i },
  { version: 'live', label: 'Live', test: /\blive\b|\bконцерт\b|\bconcert\b|\bsession\b/i },
]

/**
 * The word "loop" is the only reliable title signal. A number followed by
 * "hours" is not — "24 Hours" by Beyoncé is a three-minute song, and an
 * hour-long loop is caught by its duration anyway.
 */
const LOOP_TITLE = /\bloop(?:ed)?\b/i

/**
 * @param title track title as the catalogue spells it
 * @param duration length in seconds, when known — a long upload is a loop even
 *   if the title never says so
 */
export function trackVersion(title: string, duration?: number): TrackVersion {
  if (LOOP_TITLE.test(title)) return 'loop'
  if (typeof duration === 'number' && duration > LOOP_MIN_SECONDS) return 'loop'
  for (const rule of RULES) {
    if (rule.test.test(title)) return rule.version
  }
  return 'original'
}

export function versionLabel(version: TrackVersion): string {
  if (version === 'loop') return 'Луп'
  return RULES.find((rule) => rule.version === version)?.label ?? 'Оригинал'
}

export function isOriginal(title: string, duration?: number): boolean {
  return trackVersion(title, duration) === 'original'
}