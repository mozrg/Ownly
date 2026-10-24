import { describe, expect, it } from 'vitest'
import { isOriginal, trackVersion, versionLabel } from '../version'

describe('trackVersion', () => {
  it('does not treat a number of hours as a loop', () => {
    expect(trackVersion('24 Hours')).toBe('original')
    expect(trackVersion('24 Hours', 213)).toBe('original')
    expect(trackVersion('2 Hours of Rain')).toBe('original')
  })

  it('recognises a real loop', () => {
    expect(trackVersion('Song (1 hour loop)')).toBe('loop')
    expect(trackVersion('Song looped')).toBe('loop')
    // A long upload is a loop even when the title never says so.
    expect(trackVersion('Some Mix', 45 * 60)).toBe('loop')
  })

  it('still labels speed changes', () => {
    expect(trackVersion('addiction (Slowed)')).toBe('slowed')
    expect(trackVersion('addiction (Sped Up)')).toBe('spedup')
    expect(trackVersion('addiction (Slowed + Reverb)')).toBe('slowed')
    expect(trackVersion('Song (Nightcore)')).toBe('nightcore')
  })

  it('labels plain titles as original', () => {
    expect(trackVersion('addiction')).toBe('original')
    expect(isOriginal('addiction')).toBe(true)
  })

  it('has a label for every version', () => {
    expect(versionLabel('loop')).toBe('Луп')
    expect(versionLabel('original')).toBe('Оригинал')
    expect(versionLabel('slowed')).toBe('Slowed')
  })
})