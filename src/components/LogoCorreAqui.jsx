'use client'

import Image from 'next/image'

export default function LogoCorreAqui({
  className = '',
  imageClassName = '',
  title = 'Corre Aqui',
}) {
  return (
    <span
      className={[
        'inline-grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-transparent',
        className,
      ].join(' ')}
      aria-label={title}
      role="img"
    >
      <Image
        src="/corre-logo-composite.png"
        width={512}
        height={512}
        alt=""
        aria-hidden="true"
        priority
        unoptimized
        className={[
          'block h-full w-full object-contain drop-shadow-[0_14px_30px_rgba(37,99,235,0.22)]',
          imageClassName,
        ].join(' ')}
      />
    </span>
  )
}
