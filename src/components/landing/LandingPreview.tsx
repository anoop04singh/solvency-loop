'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Brain, Clock3, MessageSquare, ShieldCheck, Sparkles, Split } from 'lucide-react';
import { useState } from 'react';
import { useLandingMotion } from './LandingMotion';

const workflows = [
  { title: 'Shared expense', description: 'Plan a shared expense', icon: Split, steps: [
    ['Describe', 'Enter a bill and choose your saved contacts.'],
    ['Review', 'Check the proposed shares and any upfront deposits.'],
    ['Approve', 'Confirm the transaction in your wallet.'],
  ] },
  { title: 'Purchase reflection', description: 'Revisit a recorded purchase', icon: Brain, steps: [
    ['Record', 'Save a purchase you want to check in on.'],
    ['Wait 6 hours', 'The check-in becomes available after the purchase ages.'],
    ['Reflect', 'Mark it Worth It or Regretted in your memory.'],
  ] },
  { title: 'Cooldown vault', description: 'Give spending some space', icon: Clock3, steps: [
    ['Choose', 'Set a USDC amount while keeping your reserve available.'],
    ['Lock', 'Review the amount and approve the vault in your wallet.'],
    ['Withdraw', 'Return after 24 hours to withdraw the matured funds.'],
  ] },
] as const;

export function LandingPreview() {
  const [selected, setSelected] = useState(0);
  const moving = useLandingMotion();
  const { description, steps, icon: Icon } = workflows[selected];

  return (
    <section className="landing-console" aria-label="Workflow preview">
      <div className="landing-console-bar">
        <span className="landing-console-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="landing-kicker">SolvencyLoop workspace</span>
        <span className="landing-label">Workflow preview</span>
      </div>
      <div className="landing-console-body">
        <div className="landing-console-label landing-kicker"><span><MessageSquare size={13} aria-hidden="true" /> Natural language workspace</span></div>
        <div className="landing-console-prompt">
          <span><Sparkles size={21} aria-hidden="true" />{description}</span>
          <Link href="/app" className="landing-button landing-button-small">Open workspace <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <div className="landing-console-tabs" role="group" aria-label="Choose a workflow">
          {workflows.map(({ title }, index) => (
            <button key={title} type="button" aria-pressed={selected === index} aria-controls="landing-preview-steps" onClick={() => setSelected(index)}>{title}</button>
          ))}
        </div>
        <div className="landing-console-label landing-kicker"><span><Icon size={15} aria-hidden="true" /> What happens next</span></div>
        <div id="landing-preview-steps" aria-live="polite">
          <motion.ol
            key={selected}
            className="landing-preview-steps"
            initial={moving ? { opacity: .5, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: moving ? .28 : 0 }}
          >
            {steps.map(([title, copy], index) => (
              <li key={title}><span className="landing-step-number" aria-hidden="true">0{index + 1}</span><strong>{title}</strong><p>{copy}</p></li>
            ))}
          </motion.ol>
        </div>
        <div className="landing-console-foot">
          <ShieldCheck size={20} aria-hidden="true" />
          <div><strong>Wallet and MemWal required</strong><p>Connect your Sui Mainnet wallet and authorize your personal memory account in the app.</p></div>
        </div>
      </div>
    </section>
  );
}
