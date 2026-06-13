import Image from 'next/image'
import Link from 'next/link'

interface CtaBannerProps {
  eyebrow?: string
  title?: string
  description?: string
  buttonText?: string
  buttonHref?: string
  buttonText2?: string
  buttonHref2?: string
}

export default function CtaBanner({
  eyebrow,
  title = 'Készen állsz a következő kalandra?',
  description,
  buttonText = 'Foglalj lakóautót most →',
  buttonHref = '/katalogus',
  buttonText2,
  buttonHref2,
}: CtaBannerProps) {
  return (
    <section className="relative flex items-center justify-center text-white text-center py-20 overflow-hidden">
      <Image
        src="https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1600&q=80"
        alt="Lakóautó naplementében"
        fill
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative z-10 px-6">
        {eyebrow && (
          <span className="block text-[10px] font-semibold tracking-[0.22em] uppercase text-white/60 mb-4">
            {eyebrow}
          </span>
        )}
        <h2 className="text-3xl md:text-4xl font-extrabold mb-4 leading-tight max-w-xl mx-auto">
          {title}
        </h2>
        {description && (
          <p className="text-white/70 text-base max-w-md mx-auto mb-8">{description}</p>
        )}
        <div className={`flex flex-col sm:flex-row gap-3 justify-center ${!description ? 'mt-3' : ''}`}>
          <Link
            href={buttonHref}
            className="inline-block bg-white text-[#111] font-semibold text-sm px-7 py-3 rounded-full tracking-wide hover:bg-white/90 hover:shadow-lg transition-all duration-200"
          >
            {buttonText}
          </Link>
          {buttonText2 && buttonHref2 && (
            <Link
              href={buttonHref2}
              className="inline-block border border-white/60 text-white font-semibold text-sm px-7 py-3 rounded-full tracking-wide hover:border-white hover:bg-white/10 transition-all duration-200"
            >
              {buttonText2}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
