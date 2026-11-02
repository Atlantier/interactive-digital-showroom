import {
  ChevronDown,
  ExternalLink,
  FileText,
  Gauge,
  Layers3,
  Target,
  TriangleAlert,
  Workflow,
} from 'lucide-react'
import {
  EXHIBIT_CASE_STUDIES,
  type CaseStudyCopy,
} from '../../data/exhibitCaseStudies'
import { useI18n } from '../../i18n/useI18n'
import type { GalleryExhibitId } from '../../store/gallery/catalog'
import { cn } from '../../lib/cn'

function CaseStudySection({
  icon: Icon,
  label,
  copy,
  section,
}: {
  icon: typeof Target
  label: string
  copy: string
  section: string
}) {
  return (
    <section data-case-study-section={section}>
      <h4 className="flex items-center gap-2 font-mono text-[11px] text-[var(--vfx-secondary)]">
        <Icon size={10} strokeWidth={1.6} />
        {label}
      </h4>
      <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
        {copy}
      </p>
    </section>
  )
}

export function ExhibitCaseStudyPanel({
  exhibitId,
  index,
}: {
  exhibitId: GalleryExhibitId
  index: number
}) {
  const { locale, t } = useI18n()
  const labels = t.gallery.caseStudy
  const copy: CaseStudyCopy =
    EXHIBIT_CASE_STUDIES[exhibitId][locale]

  return (
    <details
      data-exhibit-case-study={exhibitId}
      className="group mt-4 border border-[var(--vfx-secondary)]/18 bg-[linear-gradient(135deg,rgba(114,230,255,0.045),rgba(255,255,255,0.012))]"
    >
      <summary
        className="cursor-pointer list-none px-3 py-3 outline-none transition-colors hover:bg-white/[0.025] focus-visible:border focus-visible:border-[var(--vfx-secondary)]/45 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex items-center justify-between gap-3 font-mono text-[11px] text-[var(--vfx-secondary)]">
          <span className="flex items-center gap-2">
            <FileText size={10} strokeWidth={1.6} />
            {labels.eyebrow}
          </span>
          <span>CASE {String(index + 1).padStart(2, '0')}</span>
        </span>
        <span className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[12px] text-[var(--text-primary)]">
            {labels.title}
          </span>
          <ChevronDown
            size={13}
            strokeWidth={1.6}
            className="shrink-0 text-[var(--text-secondary)] transition-transform group-open:rotate-180"
          />
        </span>
      </summary>

      <div className="grid gap-4 border-t border-white/[0.07] px-3 py-4">
        <CaseStudySection
          icon={Target}
          label={labels.objective}
          copy={copy.objective}
          section="objective"
        />
        <CaseStudySection
          icon={Workflow}
          label={labels.system}
          copy={copy.system}
          section="system"
        />
        <CaseStudySection
          icon={TriangleAlert}
          label={labels.challenge}
          copy={copy.challenge}
          section="challenge"
        />
        <CaseStudySection
          icon={Gauge}
          label={labels.outcome}
          copy={copy.outcome}
          section="outcome"
        />

        {copy.role ? (
          <section data-case-study-section="role">
            <h4 className="font-mono text-[11px] text-[var(--vfx-secondary)]">
              {labels.role}
            </h4>
            <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
              {copy.role}
            </p>
          </section>
        ) : null}

        <section data-case-study-section="metrics">
          <h4 className="flex items-center gap-2 font-mono text-[11px] text-[var(--vfx-secondary)]">
            <Gauge size={10} strokeWidth={1.6} />
            {labels.metrics}
          </h4>
          <div className="mt-2 grid grid-cols-3 gap-px border border-white/[0.07] bg-white/[0.07]">
            {copy.metrics.map((metric) => (
              <div
                key={`${metric.value}-${metric.label}`}
                className="min-w-0 bg-[#04090c] px-2 py-2.5"
              >
                <p className="truncate font-mono text-[13px] text-[var(--vfx-tertiary)]">
                  {metric.value}
                </p>
                <p className="mt-1 text-[10px] leading-4 text-[var(--text-tertiary)]">
                  {metric.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section data-case-study-section="stack">
          <h4 className="flex items-center gap-2 font-mono text-[11px] text-[var(--vfx-secondary)]">
            <Layers3 size={10} strokeWidth={1.6} />
            {labels.stack}
          </h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {copy.stack.map((technology) => (
              <span
                key={technology}
                className={cn(
                  'border border-white/[0.08] bg-white/[0.02] px-2 py-1',
                  'font-mono text-[10px] leading-4 text-[var(--text-secondary)]',
                )}
              >
                {technology}
              </span>
            ))}
          </div>
        </section>

        {copy.links?.length ? (
          <section data-case-study-section="links">
            <h4 className="font-mono text-[11px] text-[var(--vfx-secondary)]">
              {labels.links}
            </h4>
            <div className="mt-2 grid gap-1.5">
              {copy.links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between border border-white/[0.08] px-2.5 py-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--vfx-secondary)]/35 hover:text-frost"
                >
                  {link.label}
                  <ExternalLink size={10} strokeWidth={1.6} />
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </details>
  )
}
