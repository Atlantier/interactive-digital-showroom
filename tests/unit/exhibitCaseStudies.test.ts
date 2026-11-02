import { describe, expect, it } from 'vitest'
import {
  EXHIBIT_CASE_STUDIES,
  type LocalizedCaseStudy,
} from '../../src/data/exhibitCaseStudies'

describe('exhibit case studies', () => {
  it('provides complete bilingual technical dossiers for all exhibits', () => {
    expect(Object.keys(EXHIBIT_CASE_STUDIES)).toHaveLength(8)

    Object.values(EXHIBIT_CASE_STUDIES).forEach(
      (localized: LocalizedCaseStudy) => {
        for (const copy of [localized.en, localized.zh]) {
          expect(copy.objective.length).toBeGreaterThan(24)
          expect(copy.system.length).toBeGreaterThan(40)
          expect(copy.challenge.length).toBeGreaterThan(24)
          expect(copy.outcome.length).toBeGreaterThan(24)
          expect(copy.stack.length).toBeGreaterThanOrEqual(4)
          expect(copy.metrics).toHaveLength(3)
        }
      },
    )
  })
})
