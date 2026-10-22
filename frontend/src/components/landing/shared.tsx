import iconBlack from '../../assets/logo-icon-black.png'
import iconWhite from '../../assets/logo-icon-white.png'
import textBlack from '../../assets/logo-text-black.png'
import textWhite from '../../assets/logo-text-white.png'

export function Logo({ tone = 'black', height = 40, href = '#top' }: { tone?: 'black' | 'white'; height?: number; href?: string }) {
  const icon = tone === 'black' ? iconBlack : iconWhite
  const text = tone === 'black' ? textBlack : textWhite
  return (
    <a href={href} className="flex items-center" style={{ gap: height * 0.2 }} aria-label="Iron AI">
      <img src={icon} alt="" style={{ height }} />
      <img src={text} alt="Iron AI" style={{ height: height * 0.7 }} />
    </a>
  )
}

export function CtaButtons({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const h = size === 'md' ? 'h-12 px-4 text-[15px] lg:px-5 lg:text-[17px]' : 'h-10 px-4 text-[15px]'
  return (
    <div className="flex flex-wrap items-center gap-2 lg:gap-4">
      <a
        href="/cadastro"
        className={`${h} inline-flex items-center whitespace-nowrap rounded-lg bg-ink font-semibold text-white ring-1 ring-black transition hover:bg-neutral-800`}
      >
        Começar agora
      </a>
    </div>
  )
}
