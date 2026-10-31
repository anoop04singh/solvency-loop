"use client";

import { AnimatePresence, MotionConfig, motion, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowDown, ArrowUpRight, Check, CirclePause, Fingerprint, Leaf, LockKeyhole, MoveUpRight, Plus, ShieldCheck, Sparkles, Split, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { FeatureArtwork, LoopArtwork } from './LoopArtwork';
import { usePresentationMotion } from '@/lib/use-presentation-motion';

const features = [
  { id: 'split', number: '01', title: 'Share the moment. Split the expense.', short: 'Split clearly', icon: Split, copy: 'Add your people, choose equal or custom shares, and review exactly who owes what. Settle in native USDC, with an upfront deposit when you need one.', note: 'Clear shares. Real payments. No awkward guesswork.' },
  { id: 'pause', number: '02', title: 'Give your next decision some space.', short: 'Pause thoughtfully', icon: CirclePause, copy: 'Put discretionary USDC into a 24-hour cooldown vault. The reserve you choose stays available. After the cooldown, only you can withdraw your funds.', note: 'A pause you choose, enforced by the contract.' },
  { id: 'remember', number: '03', title: 'Keep the lesson. Leave the mental load.', short: 'Remember what matters', icon: Sparkles, copy: 'Save a reflection or a payment preference in your own memory account. Recall it when it helps, then decide what to apply to the next expense.', note: 'Your notes. Your account. Your next move.' },
] as const;

function Reveal({ children, className = '', delay = 0, as = 'div' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'li' }) {
  const still = !usePresentationMotion();
  const Tag = as === 'li' ? motion.li : motion.div;
  return <Tag className={className} initial={false} whileInView={still ? undefined : { y: [22, 0], opacity: [.65, 1] }} viewport={{ once: true, amount: .15 }} transition={{ duration: .7, delay, ease: [.22, 1, .36, 1] }}>{children}</Tag>;
}

function OpenApp({ children = 'Make a little room', className = '' }: { children?: ReactNode; className?: string }) {
  const still = !usePresentationMotion();
  const x = useSpring(0, { stiffness: 180, damping: 18 });
  const y = useSpring(0, { stiffness: 180, damping: 18 });
  return <motion.div className={'magnetic-link '+className} style={{ x, y }} onPointerMove={event => {
    if (still || event.pointerType !== 'mouse') return;
    const box = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX-box.left-box.width/2)*.1);
    y.set((event.clientY-box.top-box.height/2)*.12);
  }} onPointerLeave={() => { x.set(0); y.set(0); }}>
    <Link href="/app" className="landing-cta">{children}<ArrowUpRight size={19} aria-hidden="true"/></Link>
  </motion.div>;
}

export function LandingPage() {
  const hero = useRef<HTMLElement>(null);
  const still = !usePresentationMotion();
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  const artY = useTransform(scrollYProgress, [0, 1], [0, 85]);
  const artRotate = useTransform(scrollYProgress, [0, 1], [-3, 5]);
  const artScale = useTransform(scrollYProgress, [0, 1], [1, .9]);
  const tiltX = useMotionValue(0), tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, { stiffness: 100, damping: 20 });
  const rotateY = useSpring(tiltY, { stiffness: 100, damping: 20 });
  const [selected, setSelected] = useState(0);
  const current = features[selected];

  return <MotionConfig reducedMotion="user"><div className="landing">
    <a className="skip-link" href="#landing-content">Skip to content</a>
    <header className="landing-header"><Link className="brand" href="/" aria-label="SolvencyLoop home"><span className="brand-mark" aria-hidden="true">S</span><span>SolvencyLoop</span></Link><nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#your-control">Your control</a><a href="#questions">Questions</a></nav><Link href="/app" className="landing-nav-cta">Open app <ArrowUpRight size={15} aria-hidden="true"/></Link></header>

    <main id="landing-content">
      <section className="landing-hero" ref={hero} aria-labelledby="hero-title">
        <div className="hero-copy"><p className="landing-kicker"><span className="living-dot"/>A little clarity. A little breathing room.</p>
          <h1 id="hero-title">Less money<br/>on your <span className="hero-accent">mind.<svg viewBox="0 0 370 30" aria-hidden="true"><motion.path d="M8 20Q155 1 360 16" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" initial={false} animate={still ? { pathLength: 1 } : { pathLength: [0, 1] }} transition={{ delay: .4, duration: 1.2 }}/></svg></span></h1>
          <p className="hero-description">Split shared expenses. Put a pause between you and impulse. Remember what works for you.</p>
          <div className="hero-actions"><OpenApp/><a href="#how-it-works" className="landing-text-link">Take a look around <ArrowDown size={15} aria-hidden="true"/></a></div>
          <p className="hero-footnote"><Wallet size={14} aria-hidden="true"/>Your wallet. Your personal memory. Your say.</p>
        </div>
        <motion.div className="hero-art-frame" style={still ? undefined : { y: artY, rotate: artRotate, scale: artScale }} onPointerMove={event => {
          if (still || event.pointerType !== 'mouse') return;
          const box = event.currentTarget.getBoundingClientRect();
          tiltX.set((event.clientY-box.top-box.height/2)/50);
          tiltY.set((event.clientX-box.left-box.width/2)/-50);
        }} onPointerLeave={() => { tiltX.set(0); tiltY.set(0); }}><motion.div style={still ? undefined : { rotateX, rotateY, transformPerspective: 1000 }}><LoopArtwork/></motion.div><span className="art-caption">A calmer loop for everyday money.</span></motion.div>
        <a href="#how-it-works" className="hero-scroll"><span>Less to carry. More to enjoy.</span><ArrowDown size={16} aria-hidden="true"/></a>
      </section>

      <section className="landing-principles" aria-label="The essentials"><span><Split size={17} aria-hidden="true"/>Native USDC payments</span><span><CirclePause size={17} aria-hidden="true"/>24-hour cooldown</span><span><Fingerprint size={17} aria-hidden="true"/>Memory you own</span><span><ShieldCheck size={17} aria-hidden="true"/>Recorded on Sui</span></section>

      <section className="landing-story" id="how-it-works" aria-labelledby="story-title"><Reveal className="story-heading"><p className="landing-kicker">A simpler rhythm</p><h2 id="story-title">Good with money.<br/><span>A little more human.</span></h2><p>You don’t need another complicated dashboard.<br/>Just a clearer way to share, pause and remember.</p></Reveal>
        <div className="story-layout"><div className="story-controls"><div className="story-selector" role="group" aria-label="Explore SolvencyLoop features">{features.map((feature, i) => <button key={feature.id} aria-pressed={selected === i} aria-controls="feature-detail" onClick={() => setSelected(i)}><span className="feature-number">{feature.number}</span><span>{feature.short}</span>{selected === i && <motion.span layoutId="feature-indicator" className="feature-indicator" transition={{ type: 'spring', stiffness: 350, damping: 30 }}><ArrowUpRight size={17}/></motion.span>}</button>)}</div>
          <div id="feature-detail" className="feature-detail" aria-live="polite" aria-atomic="true"><AnimatePresence mode="wait" initial={false}><motion.div key={current.id} initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={still ? undefined : { opacity: 0, y: -5 }} transition={{ duration: .2 }}><h3>{current.title}</h3><p>{current.copy}</p><span className="feature-note"><Check size={14} aria-hidden="true"/>{current.note}</span></motion.div></AnimatePresence></div>
        </div><motion.div className="story-art" data-feature={current.id} layout transition={{ type: 'spring', stiffness: 100, damping: 20 }}><AnimatePresence mode="wait" initial={false}><motion.div key={current.id} initial={still ? false : { opacity: 0, scale: .94, rotate: -2 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={still ? undefined : { opacity: 0, scale: .97 }} transition={{ type: 'spring', stiffness: 180, damping: 22 }}><FeatureArtwork feature={current.id}/></motion.div></AnimatePresence><span className="story-art-caption">An illustration of how it works</span></motion.div></div>
      </section>

      <section className="landing-ownership" id="your-control" aria-labelledby="ownership-title"><div className="ownership-line" aria-hidden="true"><span/><LockKeyhole size={21}/><span/></div><Reveal><p className="landing-kicker">Built around your say</p><h2 id="ownership-title">Personal by design.<br/>Owned by you.</h2><p className="ownership-intro">Your wallet controls your profile and funds. Your MemWal account keeps the notes you choose to save. You decide when to give the app access.</p></Reveal><div className="ownership-grid"><Reveal delay={.05}><Wallet size={23} aria-hidden="true"/><h3>Your wallet makes the call.</h3><p>Review and approve transactions yourself. The app never asks for your wallet’s private key.</p></Reveal><Reveal delay={.12}><Fingerprint size={23} aria-hidden="true"/><h3>Your memory comes with you.</h3><p>A personal MemWal account is required. Authorize app access during onboarding and revoke it when you choose.</p></Reveal><Reveal delay={.19}><ShieldCheck size={23} aria-hidden="true"/><h3>Clarity about what’s public.</h3><p>Profiles, contacts and financial records are public on Sui. Behavioral notes use MemWal and Walrus.</p></Reveal></div><p className="ownership-fineprint">App memory authorization grants account-wide access. Revoking access does not erase information already obtained. No bank connection or alternate payment method is used.</p></section>

      <section className="landing-start" aria-labelledby="start-title"><Reveal className="start-intro"><p className="landing-kicker">From first visit to your first split</p><h2 id="start-title">Make it yours.<br/>One step at a time.</h2><p>Bring a Sui Mainnet wallet with SUI for network fees.<br/>Use native Circle USDC for expenses and vaults.</p><OpenApp>Open your workspace</OpenApp></Reveal><ol className="start-steps"><Reveal as="li"><span>01</span><div><h3>Connect your wallet</h3><p>We check for a profile and memory account you already own.</p></div><Wallet size={20} aria-hidden="true"/></Reveal><Reveal as="li" delay={.1}><span>02</span><div><h3>Create or link your memory</h3><p>Review access, then authorize the app through your wallet.</p></div><Sparkles size={20} aria-hidden="true"/></Reveal><Reveal as="li" delay={.2}><span>03</span><div><h3>Add your personal touch</h3><p>Choose a name and reserve, then add your people when you’re ready.</p></div><Leaf size={20} aria-hidden="true"/></Reveal></ol></section>

      <section className="landing-faq" id="questions" aria-labelledby="faq-title"><Reveal><p className="landing-kicker">A few things, made clear</p><h2 id="faq-title">Before you step in.</h2></Reveal><div className="faq-list">
        <details><summary>What do I need to get started?<Plus size={18} aria-hidden="true"/></summary><p>A Sui Mainnet wallet, SUI for network gas, and native Circle USDC when you want to pay or lock funds. Onboarding creates or links your personal MemWal account. No existing memories or contacts are required.</p></details>
        <details><summary>Does SolvencyLoop move money for me?<Plus size={18} aria-hidden="true"/></summary><p>You approve transactions in your wallet. The Move contract enforces payments, escrow, reserves and cooldown rules. Saving a preference or a note does not authorize a payment.</p></details>
        <details><summary>How does the 24-hour pause work?<Plus size={18} aria-hidden="true"/></summary><p>You choose how much USDC to lock while keeping your registered reserve available. The contract holds that amount for 24 hours. Only you can withdraw after it matures; there is no early-unlock option.</p></details>
        <details><summary>What does the app remember?<Plus size={18} aria-hidden="true"/></summary><p>The notes and payment preferences you choose to save, and confirmed settlement observations you import. You recall your memories when you need them. Your financial records and contacts are public on Sui; behavioral memory uses your own MemWal account.</p></details>
        <details><summary>What happens if I revoke memory access?<Plus size={18} aria-hidden="true"/></summary><p>New app activity pauses until you authorize access again. Existing members retain eligible cancellations, refunds and matured withdrawals. Revocation does not retract plaintext or decryption keys already obtained by a delegate.</p></details>
      </div></section>

      <section className="landing-final"><Reveal><span className="final-spark" aria-hidden="true"><Sparkles size={30}/></span><p className="landing-kicker">Money, with a little memory</p><h2>More living.<br/><span>Less keeping track.</span></h2><p>A calmer place for the money moments you share.</p><OpenApp>Find your loop</OpenApp></Reveal><svg className="final-contour" viewBox="0 0 1100 350" fill="none" aria-hidden="true"><path d="M-100 300C200-80 300 500 650 200S1150 100 1220 260" stroke="currentColor" strokeWidth="50"/><path d="M-100 300C200-80 300 500 650 200S1150 100 1220 260" stroke="#f8f8f6" strokeWidth="2" strokeDasharray="6 12"/></svg></section>
    </main>
    <footer className="landing-footer"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">S</span><span>SolvencyLoop</span></Link><p>Shared clearly. Remembered thoughtfully.</p><Link href="/app">Open app <MoveUpRight size={14} aria-hidden="true"/></Link><span>Sui Mainnet · Native Circle USDC · MemWal / Walrus</span></footer>
  </div></MotionConfig>;
}
