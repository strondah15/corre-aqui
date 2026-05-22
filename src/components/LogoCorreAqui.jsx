'use client'

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
      <span
        className={['block h-[118%] w-[118%] bg-contain bg-center bg-no-repeat', imageClassName].join(' ')}
        style={{ backgroundImage: "url('/logo-corre-aqui.png.png')" }}
        aria-hidden="true"
      />
    </span>
  )
}
