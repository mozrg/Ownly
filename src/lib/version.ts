/**
 * Recognises what kind of recording a title describes.
 *
 * YouTube is full of re-uploads: "(Slowed)", "Sped Up", "Nightcore", "8D".
 * A row that says nothing about its version is assumed to be the original,
 * and anything else gets a badge so the list is honest at a glance.
 */
export type TrackVersion = 'original' | 'slowed' | 'spedup' | 'nightcore' | 'remix' | 'cover' | 'live' | 'loop' | 'instrumental'

interface VersionRule {
  version: TrackVersion
  label: string
  test: RegExp
}

const RULES: VersionRule[] = [
  { version: 'loop', label: 'Луп', test: /\bloop(?:ed)?\b|\b\d+\s*(?:hour|hr)s?\b|\b1\s*hour\b/i },
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

export function trackVersion(title: string): TrackVersion {
  for (const rule of RULES) {
    if (rule.test.test(title)) return rule.version
  }
  return 'original'
}

export function versionLabel(version: TrackVersion): string {
  return RULES.find((rule) => rule.version === version)?.label ?? 'Оригинал'
}

export function isOriginal(title: string): boolean {
  return trackVersion(title) === 'original'
}
