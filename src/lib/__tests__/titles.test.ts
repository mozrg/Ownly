import { describe, expect, it } from 'vitest'
import { cleanTitle, splitArtists } from '../youtube'

describe('splitArtists', () => {
  it('splits an explicit feat. credit', () => {
    expect(splitArtists('LONOWN feat. Asenssia')).toEqual(['LONOWN', 'Asenssia'])
    expect(splitArtists('Calvin Harris ft. Dua Lipa')).toEqual(['Calvin Harris', 'Dua Lipa'])
  })

  it('splits a comma-separated credit', () => {
    expect(splitArtists('LONOWN, Asenssia')).toEqual(['LONOWN', 'Asenssia'])
    expect(splitArtists('LONOWN, Asenssia, TEENWXVE')).toEqual(['LONOWN', 'Asenssia', 'TEENWXVE'])
  })

  it('keeps names that only look like credits whole', () => {
    for (const name of [
      'AC/DC',
      'Simon & Garfunkel',
      'Tyler, The Creator',
      'Earth, Wind & Fire',
      'Florence + the Machine',
      'Of Monsters and Men',
      'Lil Nas X',
      'Mumford & Sons',
      'Hall & Oates',
    ]) {
      expect(splitArtists(name)).toEqual([name])
    }
  })

  it('does not treat & and + as separators on their own', () => {
    expect(splitArtists('Moderat & Apparat')).toEqual(['Moderat & Apparat'])
    expect(splitArtists('Disclosure + Sam Smith')).toEqual(['Disclosure + Sam Smith'])
  })

  it('drops channel furniture', () => {
    expect(splitArtists('VEVO')).toEqual([])
    expect(splitArtists('Official')).toEqual([])
    expect(splitArtists('   ')).toEqual([])
  })

  it('never returns duplicate names', () => {
    expect(splitArtists('LONOWN feat. LONOWN')).toEqual(['LONOWN'])
  })
})

describe('cleanTitle', () => {
  it('keeps words that only look like packaging', () => {
    expect(cleanTitle('Lana Del Rey - Video Games')).toBe('Lana Del Rey - Video Games')
    expect(cleanTitle('Video Killed the Radio Star')).toBe('Video Killed the Radio Star')
    expect(cleanTitle('Radio Gaga')).toBe('Radio Gaga')
  })

  it('removes bracketed decorations', () => {
    expect(cleanTitle('Song (Official Video)')).toBe('Song')
    expect(cleanTitle('Song [Lyrics]')).toBe('Song')
    expect(cleanTitle('Song (Audio)')).toBe('Song')
    expect(cleanTitle('Song (Remastered 2011)')).toBe('Song')
  })

  it('removes a trailing decoration', () => {
    expect(cleanTitle('Song - Official Video')).toBe('Song')
    expect(cleanTitle('Song - Lyrics')).toBe('Song')
    expect(cleanTitle('Song - Official Video (HD)')).toBe('Song')
  })

  it('keeps meaningful brackets', () => {
    expect(cleanTitle('Song (Live)')).toBe('Song (Live)')
    expect(cleanTitle('Song (Slowed)')).toBe('Song (Slowed)')
  })
})