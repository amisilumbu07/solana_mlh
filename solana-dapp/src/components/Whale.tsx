import React from 'react'

const BODY =
  'M188 78C188 46 146 30 102 34C72 37 52 52 38 66L14 44C8 52 10 72 16 84C10 94 8 108 14 116L40 94C58 112 86 124 120 122C160 120 188 108 188 78Z'
const BELLY = 'M188 84C176 112 150 120 120 122C96 123 72 116 56 104C92 106 150 104 188 84Z'

/** The whale drawing, sized by its surrounding group. */
const WhaleBody: React.FC = () => (
  <>
    <path d={BODY} fill="var(--accent)" />
    <path d={BELLY} fill="#93b4f0" />
    <circle cx="158" cy="66" r="4.5" fill="#ffffff" />
  </>
)

export const BrandWhale: React.FC = () => (
  <svg className="brand__whale" viewBox="0 20 200 110" aria-hidden="true">
    <WhaleBody />
  </svg>
)

export const WhaleIllustration: React.FC = () => (
  <svg className="name-step__art" viewBox="0 0 200 140" aria-hidden="true">
    <path d="M126 28C126 18 118 12 110 12M126 28C126 18 134 12 142 12M126 28V14" fill="none" stroke="#93b4f0" strokeWidth="4" strokeLinecap="round" />
    <WhaleBody />
  </svg>
)

export const SmallCopyIllustration: React.FC = () => (
  <svg className="name-step__art" viewBox="0 0 200 140" aria-hidden="true">
    <g transform="translate(58 36) scale(0.42)">
      <WhaleBody />
    </g>
  </svg>
)

export const CheckIllustration: React.FC = () => (
  <svg className="name-step__art" viewBox="0 0 200 140" aria-hidden="true">
    <path d="M100 8L156 26V72C156 104 130 124 100 134C70 124 44 104 44 72V26Z" fill="var(--accent)" />
    <path d="M73 70L93 90L129 50" fill="none" stroke="#ffffff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
