import Link from 'next/link';
import {
  ArrowDown, ArrowRight, Brain, Check, CircleHelp, Clock3, Fingerprint, Infinity as Loop,
  Layers3, LockKeyhole, MessageSquare, ReceiptText, ShieldCheck, Split, Wallet,
} from 'lucide-react';
import { LandingHero, LandingMotion, LandingReveal } from './LandingMotion';
import { LandingPreview } from './LandingPreview';
import { LandingRail } from './LandingRail';

const pillars = [
  { icon: MessageSquare, accent: 'blue', label: 'Pillar 01 / Conversation', title: 'Start with an intent', copy: 'Describe a split, ask about a bill, or request a cooldown in plain language. Gemini helps prepare a proposal you can inspect in the workspace.', footer: 'Gemini + reviewable drafts' },
  { icon: Brain, accent: 'green', label: 'Pillar 02 / Memory', title: 'Carry useful context forward', copy: 'Save notes and payment preferences in your wallet-owned MemWal account. Relevant memories and confirmed settlement history can inform future proposals.', footer: 'MemWal + Walrus' },
  { icon: ShieldCheck, accent: 'amber', label: 'Pillar 03 / Protection', title: 'Choose a 24-hour cooldown', copy: 'Put an amount of native USDC into a timed vault while preserving your registered reserve. Withdraw from your wallet once the cooldown matures.', footer: 'Sui Move cooldown vault' },
] as const;

const features = [
  {
    id: 'split', icon: Split, accent: 'blue', label: 'Feature 01 / Shared expenses',
    title: 'Split with context.',
    copy: 'Use saved contacts and choose equal or custom shares. With a food and drinks breakdown, a saved alcohol exclusion can keep drinks out of a contact’s share.',
    points: ['Review each share and any upfront deposits.', 'Settle shares in native Circle USDC.'],
    panel: { label: 'Split Canvas', title: 'A shared expense', tag: 'Allocation review', rows: [
      { icon: ReceiptText, title: 'Break down the receipt', detail: 'Enter food, drinks, or other items.' },
      { icon: Fingerprint, title: 'Recall saved preferences', detail: 'Apply relevant rules to the actual items.' },
      { icon: Split, title: 'Review exact shares', detail: 'Check the amounts before creating the bill.' },
    ] },
  },
  {
    id: 'reflection', icon: Clock3, accent: 'amber', label: 'Feature 02 / Purchase check-ins',
    title: 'Reflect after 48 hours.',
    copy: 'Record a purchase you want to revisit. After 48 hours, mark it Worth It or Regretted to give future spending suggestions more context.',
    points: ['Check in on purchases you record.', 'Choose whether to protect funds in a cooldown vault.'],
    panel: { label: 'Purchase check-in', title: 'Think back on a purchase', tag: 'After 48 hours', rows: [
      { icon: ReceiptText, title: 'Record a purchase', detail: 'Add the amount and category yourself.' },
      { icon: CircleHelp, title: 'How do you feel about it now?', detail: 'Record your own rating in MemWal.' },
    ] },
  },
  {
    id: 'escrow', icon: LockKeyhole, accent: 'green', label: 'Feature 03 / Shared commitments',
    title: 'Use upfront escrow when it helps.',
    copy: 'Choose which shares require an upfront deposit. Once all required deposits are funded, the bill creator can activate the split before the funding deadline.',
    points: ['Standard shares pay the creator directly.', 'Eligible deposits can be refunded after cancellation or the funding deadline.'],
    panel: { label: 'Escrow Desk', title: 'Upfront deposit workflow', tag: 'Creator activation', rows: [
      { icon: Wallet, title: 'Participants fund required shares', detail: 'The contract holds upfront deposits.' },
      { icon: Check, title: 'The creator activates the split', detail: 'Activation releases the required deposits.' },
    ] },
  },
] as const;

const infrastructure = [
  { label: 'Network', value: 'Sui Mainnet', detail: 'Profiles, bills and vaults' },
  { label: 'Asset', value: 'Circle USDC', detail: 'Native token for payments' },
  { label: 'Memory', value: 'MemWal', detail: 'Wallet-owned accounts on Walrus' },
  { label: 'Sui gateway', value: 'Tatum', detail: 'Authenticated GraphQL transport' },
];

function Brand() {
  return <Link className="landing-brand" href="/" aria-label="SolvencyLoop home"><span><Loop size={18} aria-hidden="true" /></span>SolvencyLoop</Link>;
}

export function LandingPage() {
  return (
    <LandingMotion>
      <a className="skip-link" href="#landing-content">Skip to content</a>
      <header className="landing-header">
        <div className="landing-wrap landing-header-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#overview">Overview</a>
            <a href="#features">Features</a>
            <a href="#architecture">Architecture</a>
          </nav>
          <Link href="/app" className="landing-button landing-button-small">Open app <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      </header>

      <main id="landing-content">
        <LandingHero>
          <div className="landing-wrap landing-hero-inner">
            <LandingReveal><p className="landing-badge landing-kicker"><i aria-hidden="true" /> Built on Sui Mainnet + Walrus</p></LandingReveal>
            <LandingReveal delay={.07}><h1 id="hero-title">Smart money that remembers.</h1></LandingReveal>
            <LandingReveal delay={.14}><p className="landing-intro">Plan shared expenses in chat, carry useful payment preferences forward, and give spending a 24-hour pause when you need one.</p></LandingReveal>
            <LandingReveal className="landing-actions" delay={.2}>
              <Link href="/app" className="landing-button">Launch web app <ArrowRight size={17} aria-hidden="true" /></Link>
              <a href="#how-it-works" className="landing-button landing-button-secondary"><Layers3 size={16} aria-hidden="true" /> How it works</a>
            </LandingReveal>
            <LandingReveal className="landing-preview-wrap" delay={.25}><LandingPreview /></LandingReveal>
          </div>
        </LandingHero>

        <section className="landing-wrap landing-section" id="how-it-works" aria-labelledby="pillars-title">
          <LandingReveal className="landing-section-heading">
            <div><p className="landing-kicker">Protocol architecture</p><h2 id="pillars-title">Built for intent.</h2></div>
            <p>Describe what you want to do. SolvencyLoop brings together chat, memory, and on-chain tools so you can review the next step.</p>
          </LandingReveal>
          <LandingRail count={pillars.length}>
            {pillars.map(({ icon: Icon, accent, label, title, copy, footer }) => (
              <article className="landing-pillar" key={title} data-accent={accent}>
                <span className="landing-icon-tile"><Icon size={20} aria-hidden="true" /></span>
                <p className="landing-kicker landing-accent">{label}</p>
                <h3>{title}</h3>
                <p>{copy}</p>
                <footer className="landing-kicker">{footer}</footer>
              </article>
            ))}
          </LandingRail>
        </section>

        <section className="landing-practice" id="features" aria-labelledby="practice-title">
          <div className="landing-wrap landing-section">
            <LandingReveal className="landing-section-heading">
              <div><p className="landing-kicker">Product in practice</p><h2 id="practice-title">Designed for how people spend.</h2></div>
            </LandingReveal>
            {features.map(({ id, icon: Icon, accent, label, title, copy, points, panel }) => (
              <div className="landing-feature" key={id} data-feature={id} data-accent={accent}>
                <LandingReveal className="landing-feature-copy">
                  <p className="landing-kicker landing-accent"><Icon size={15} aria-hidden="true" /> {label}</p>
                  <h3>{title}</h3><p>{copy}</p>
                  <ul>{points.map(point => <li key={point}><Check size={14} aria-hidden="true" />{point}</li>)}</ul>
                </LandingReveal>
                <LandingReveal className="landing-feature-panel" delay={.08}>
                  <div className="landing-panel-heading">
                    <div><p className="landing-kicker">{panel.label}</p><h4>{panel.title}</h4></div>
                    <span className="landing-label">{panel.tag}</span>
                  </div>
                  <ol>{panel.rows.map(({ icon: RowIcon, title: rowTitle, detail }) => (
                    <li key={rowTitle}><span className="landing-icon-tile"><RowIcon size={17} aria-hidden="true" /></span><div><strong>{rowTitle}</strong><p>{detail}</p></div></li>
                  ))}</ol>
                  {id === 'reflection' && <div className="landing-rating-labels" aria-label="Available check-in ratings"><span>Worth It</span><span>Regretted</span></div>}
                  <p className="landing-kicker landing-panel-foot">Workflow illustration</p>
                </LandingReveal>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-wrap landing-section" id="architecture" aria-labelledby="architecture-title">
          <LandingReveal className="landing-infrastructure">
            <div className="landing-section-heading">
              <div><p className="landing-kicker">Under the hood</p><h2 id="architecture-title">Sui + Walrus</h2></div>
              <p>Financial rules live in Sui Move. Behavioral memory lives in your own MemWal account.</p>
            </div>
            <dl>{infrastructure.map(({ label, value, detail }) => (
              <div key={label}><dt className="landing-kicker">{label}</dt><dd>{value}</dd><dd>{detail}</dd></div>
            ))}</dl>
            <details id="data-and-approvals">
              <summary><ShieldCheck size={17} aria-hidden="true" /> Data and approvals</summary>
              <p>Profiles, contacts, and financial records are public on Sui. Granting SolvencyLoop access to MemWal gives the app account-wide memory access until you revoke it. Chat sends your message and relevant public and recalled context to Google’s Gemini.</p>
              <p>Wallet approvals are the default for financial actions. Where Autopilot is enabled, eligible actions can run within a separately approved, funded USDC allowance.</p>
            </details>
          </LandingReveal>
        </section>

        <section className="landing-wrap landing-close" aria-labelledby="close-title">
          <LandingReveal className="landing-close-inner">
            <div><h2 id="close-title">Make it your workspace.</h2><p>Connect your Sui Mainnet wallet, set up a personal MemWal account, and choose a public profile. SUI covers network fees.</p></div>
            <div className="landing-actions">
              <Link href="/app" className="landing-button">Launch SolvencyLoop <ArrowRight size={16} aria-hidden="true" /></Link>
              <a href="#overview" className="landing-button landing-button-secondary">Back to overview <ArrowDown size={15} aria-hidden="true" /></a>
            </div>
          </LandingReveal>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap landing-footer-inner">
          <Brand />
          <span><LockKeyhole size={13} aria-hidden="true" /> Wallet-owned accounts</span>
          <a href="#architecture">Sui Mainnet · Native USDC · Walrus</a>
        </div>
      </footer>
    </LandingMotion>
  );
}
