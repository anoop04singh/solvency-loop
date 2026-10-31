"use client";

import { motion } from 'framer-motion';
import { usePresentationMotion } from '@/lib/use-presentation-motion';

/** Original vector artwork: one continuous loop connects sharing, pause and memory. */
export function LoopArtwork() {
  const still = !usePresentationMotion();
  return <svg viewBox="0 0 600 600" className="loop-artwork" role="img" aria-label="A flowing loop connects shared expenses, a moment to pause and personal memory">
    <defs>
      <linearGradient id="loop-ink" x1="100" y1="70" x2="500" y2="540" gradientUnits="userSpaceOnUse"><stop stopColor="#90c4b3"/><stop offset=".46" stopColor="#39785f"/><stop offset="1" stopColor="#c5a25f"/></linearGradient>
      <linearGradient id="loop-light" x1="100" y1="70" x2="520" y2="500" gradientUnits="userSpaceOnUse"><stop stopColor="#edf6ed"/><stop offset="1" stopColor="#dfc68d"/></linearGradient>
      <radialGradient id="loop-paper"><stop stopColor="#fff"/><stop offset="1" stopColor="#f1f2e9"/></radialGradient>
      <filter id="loop-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="20" stdDeviation="16" floodColor="#315b44" floodOpacity=".12"/></filter>
    </defs>
    <circle cx="300" cy="300" r="255" fill="none" stroke="#dfdfd5" strokeDasharray="2 9"/>
    <circle cx="300" cy="300" r="196" fill="none" stroke="#e4e6dc"/>
    <motion.g animate={still ? undefined : { rotate: [0, 5, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: '300px', originY: '300px' }}>
      <path d="M300 110C460 110 510 190 458 293C410 385 214 292 154 380C89 477 270 529 369 447C466 367 245 266 177 223C92 170 175 110 300 110Z" fill="none" stroke="url(#loop-light)" strokeWidth="55" strokeLinecap="round"/>
      <path d="M300 110C460 110 510 190 458 293C410 385 214 292 154 380C89 477 270 529 369 447C466 367 245 266 177 223C92 170 175 110 300 110Z" fill="none" stroke="url(#loop-ink)" strokeWidth="37" strokeLinecap="round"/>
      <motion.path d="M300 110C460 110 510 190 458 293C410 385 214 292 154 380C89 477 270 529 369 447C466 367 245 266 177 223C92 170 175 110 300 110Z" fill="none" stroke="#fff" strokeOpacity=".65" strokeWidth="2" strokeDasharray="8 24" animate={still ? undefined : { strokeDashoffset: [0, -320] }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}/>
    </motion.g>
    <g filter="url(#loop-shadow)"><circle cx="300" cy="300" r="77" fill="url(#loop-paper)" stroke="#fff" strokeWidth="3"/><path d="M318 267C284 250 258 278 282 293L310 310C337 326 307 350 281 333" fill="none" stroke="#183d2b" strokeWidth="13" strokeLinecap="round"/></g>
    <motion.g animate={still ? undefined : { y: [0, -9, 0], rotate: [-5, -2, -5] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: '125px', originY: '147px' }}>
      <rect x="30" y="118" width="181" height="58" rx="20" fill="#fff" stroke="#e5e5df"/><circle cx="61" cy="147" r="14" fill="#edf3e8"/><path d="m55 147 4 4 8-9" stroke="#3f6f48" strokeWidth="2" fill="none" strokeLinecap="round"/><text x="85" y="152" fill="#252d26" fontSize="14" fontWeight="600">Shared fairly</text>
    </motion.g>
    <motion.g animate={still ? undefined : { y: [0, 10, 0], rotate: [6, 2, 6] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: '472px', originY: '370px' }}>
      <rect x="370" y="341" width="201" height="58" rx="20" fill="#fff" stroke="#e5e5df"/><circle cx="401" cy="370" r="14" fill="#f8efd8"/><path d="M398 363v14m6-14v14" stroke="#886c2f" strokeWidth="2" strokeLinecap="round"/><text x="424" y="375" fill="#252d26" fontSize="14" fontWeight="600">Space to think</text>
    </motion.g>
    <motion.g animate={still ? undefined : { y: [0, -7, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
      <rect x="63" y="454" width="202" height="58" rx="20" fill="#fff" stroke="#e5e5df"/><circle cx="94" cy="483" r="14" fill="#eaf0f8"/><path d="m94 474 2.5 6.5 6.5 2.5-6.5 2.5L94 492l-2.5-6.5L85 483l6.5-2.5Z" fill="none" stroke="#4a6b93" strokeWidth="1.5"/><text x="117" y="488" fill="#252d26" fontSize="14" fontWeight="600">Your own memory</text>
    </motion.g>
    <path d="m487 136 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z" fill="#c6a76a"/>
    <circle cx="74" cy="333" r="5" fill="#719f86"/><circle cx="423" cy="509" r="4" fill="#d4be89"/>
  </svg>;
}

export function FeatureArtwork({ feature }: { feature: 'split' | 'pause' | 'remember' }) {
  const still = !usePresentationMotion();
  return <svg viewBox="0 0 500 390" className="feature-artwork" role="img" aria-label={feature === 'split' ? 'An expense branches into individual shares' : feature === 'pause' ? 'A 24-hour pause surrounds protected funds' : 'remember' === feature ? 'Reflections become memories you can recall' : ''}>
    <defs><pattern id="feature-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#bac5b6"/></pattern></defs>
    <rect width="500" height="390" fill="url(#feature-dots)" opacity=".5"/>
    {feature === 'split' && <>
      <g fill="none" stroke="#8da68c" strokeWidth="2"><path d="M250 145v40q0 15-15 15H125q-15 0-15 15v30"/><path d="M250 145v100"/><path d="M250 145v40q0 15 15 15h110q15 0 15 15v30"/></g>
      <rect x="165" y="62" width="170" height="88" rx="22" fill="#fff" stroke="#d8e0d4"/><text x="250" y="101" textAnchor="middle" fill="#244533" fontSize="17" fontWeight="600">One expense</text><text x="250" y="125" textAnchor="middle" fill="#6e7869" fontSize="12">Reviewed by you</text>
      {[110, 250, 390].map((x, i) => <motion.g key={x} animate={still ? undefined : { y: [0, -5, 0] }} transition={{ delay: i * .5, duration: 4, repeat: Infinity }}><rect x={x-58} y="245" width="116" height="81" rx="20" fill={i === 1 ? '#2f6045' : '#fff'} stroke="#d8e0d4"/><text x={x} y="280" textAnchor="middle" fill={i === 1 ? '#fff' : '#244533'} fontSize="14" fontWeight="600">{i === 1 ? 'Your share' : 'A friend’s share'}</text><text x={x} y="303" textAnchor="middle" fill={i === 1 ? '#d1e5d1' : '#6e7869'} fontSize="11">Native USDC</text></motion.g>)}
    </>}
    {feature === 'pause' && <>
      <circle cx="250" cy="190" r="126" fill="#f5edda" stroke="#e4d6b6"/><circle cx="250" cy="190" r="105" fill="none" stroke="#d6c5a0" strokeDasharray="2 12" strokeWidth="4"/>
      <motion.circle cx="250" cy="190" r="126" fill="none" stroke="#a48545" strokeWidth="5" strokeLinecap="round" strokeDasharray="100 692" animate={still ? undefined : { rotate: [0, 360] }} style={{ originX: '250px', originY: '190px' }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}/>
      <text x="250" y="188" textAnchor="middle" fill="#5b4727" fontSize="62" fontWeight="700" letterSpacing="-4">24<tspan fontSize="25" letterSpacing="0">h</tspan></text><text x="250" y="220" textAnchor="middle" fill="#8c7650" fontSize="13">A little breathing room</text>
      <rect x="136" y="320" width="228" height="36" rx="18" fill="#fff" stroke="#e4d6b6"/><text x="250" y="343" textAnchor="middle" fill="#6f5b35" fontSize="12">Your chosen reserve stays available</text>
    </>}
    {feature === 'remember' && <>
      <rect x="109" y="75" width="270" height="244" rx="24" fill="#d6dfed" transform="rotate(-9 244 197)"/>
      <rect x="121" y="67" width="270" height="244" rx="24" fill="#e8edf5" transform="rotate(5 256 189)" stroke="#ced8e6"/>
      <motion.g animate={still ? undefined : { y: [0, -6, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
        <rect x="115" y="63" width="270" height="244" rx="24" fill="#fff" stroke="#d4dce8"/>
        <path d="m158 96 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" fill="#7392b9"/>
        <text x="145" y="162" fill="#384e6c" fontSize="18" fontWeight="600">A thought worth keeping.</text>
        <path d="M145 187h207m-207 19h170m-170 19h190" stroke="#d9e0eb" strokeWidth="5" strokeLinecap="round"/>
        <rect x="145" y="255" width="112" height="25" rx="12.5" fill="#eaf0f8"/><text x="201" y="272" fill="#4b6c94" textAnchor="middle" fontSize="10">Your MemWal account</text>
      </motion.g>
    </>}
  </svg>;
}
