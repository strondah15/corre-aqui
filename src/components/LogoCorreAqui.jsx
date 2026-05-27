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
      <svg
        viewBox="0 0 512 512"
        className={['block h-full w-full drop-shadow-[0_14px_30px_rgba(37,99,235,0.22)]', imageClassName].join(' ')}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="corre-pin-blue" x1="96" x2="416" y1="50" y2="440" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0b73ff" />
            <stop offset="0.52" stopColor="#19b7c8" />
            <stop offset="1" stopColor="#0646a8" />
          </linearGradient>
          <linearGradient id="corre-yellow-runner" x1="150" x2="360" y1="120" y2="340" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff173" />
            <stop offset="0.55" stopColor="#ffd91a" />
            <stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
        </defs>

        <path
          d="M256 24C153.9 24 71 106.5 71 208.2c0 131.6 154.9 244.8 176.9 260.2a14.3 14.3 0 0 0 16.2 0C286.1 453 441 339.8 441 208.2 441 106.5 358.1 24 256 24Z"
          fill="url(#corre-pin-blue)"
        />
        <path
          d="M256 52c86.4 0 156.5 69.8 156.5 155.9 0 105.2-112 200.4-156.5 234.7C211.5 408.3 99.5 313.1 99.5 207.9 99.5 121.8 169.6 52 256 52Z"
          fill="#ffffff"
          opacity="0.15"
        />
        <circle cx="256" cy="205" r="118" fill="#ffffff" opacity="0.94" />
        <circle cx="256" cy="205" r="99" fill="#eaf7ff" />

        <g fill="none" stroke="url(#corre-yellow-runner)" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="291" cy="137" r="24" fill="url(#corre-yellow-runner)" stroke="none" />
          <path d="M270 174 238 231" strokeWidth="38" />
          <path d="M262 186 205 180" strokeWidth="28" />
          <path d="M267 186 318 207 350 181" strokeWidth="28" />
          <path d="M238 231 191 294 158 334" strokeWidth="32" />
          <path d="M239 232 304 265 281 333" strokeWidth="32" />
        </g>
        <path
          d="M151 364c42 18 141 22 209 0"
          fill="none"
          stroke="#053b82"
          strokeLinecap="round"
          strokeWidth="15"
          opacity="0.18"
        />
      </svg>
    </span>
  )
}
