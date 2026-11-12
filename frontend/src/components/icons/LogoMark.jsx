import { useId } from 'react'

// The brand mark: a reply card with a check, "AI drafts, people approve". The same shapes as
// scripts/brand/build.mjs, which documents them. useId keeps gradient IDs unique per instance.
export default function LogoMark({ size = 24, small = size <= 32 }) {
  const id = `iks-mark-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox={small ? '0 0 32 32' : '0 0 64 64'}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF9A3C" />
          <stop offset="0.52" stopColor="#FF4F7B" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      {small ? (
        <>
          <path
            d="M9 3h14a6 6 0 0 1 6 6v9a6 6 0 0 1-6 6h-9.4l-5.4 4.1A.9.9 0 0 1 6.8 27.3L7.4 23.7A6 6 0 0 1 3 18V9a6 6 0 0 1 6-6z"
            fill={`url(#${id})`}
          />
          <path
            d="m10 13.6 4 4 8-8.2"
            stroke="#140A1C"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <path
            d="M18 8h28a12 12 0 0 1 12 12v18a12 12 0 0 1-12 12H27l-10.6 7.9A1.6 1.6 0 0 1 13.9 56.6L15 50.1A12 12 0 0 1 6 38V20A12 12 0 0 1 18 8z"
            fill={`url(#${id})`}
          />
          <path
            d="M17 21h17M17 29.5h9"
            stroke="#140A1C"
            strokeWidth="4.2"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d="m31 32 6.2 6.2L49 24.4"
            stroke="#140A1C"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  )
}
