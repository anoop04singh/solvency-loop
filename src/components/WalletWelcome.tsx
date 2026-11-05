"use client";
import { ConnectButton } from '@mysten/dapp-kit';
import { WorkspaceArtwork } from './WorkspaceArtwork';
import {ShieldCheck,Wallet,Brain,UserRound} from 'lucide-react';

export function WalletWelcome() {
  return <section className="panel entry-card">
    <div className="panel-heading"><div><p className="eyebrow">Start here</p><h2>Start with your Sui wallet</h2><p className="panel-description">Connect to create or reuse the profile and memory account your wallet owns.</p></div><WorkspaceArtwork kind="wallet" className="panel-art"/></div>
    <div className="entry-connect"><div className="wallet-control"><ConnectButton/></div><p className="field-help"><ShieldCheck size={14} aria-hidden="true"/>Native Circle USDC for payments. SUI for network fees.</p></div>
    <ol className="entry-steps"><li><span><Wallet size={18} aria-hidden="true"/></span><div><small aria-hidden="true">01 · Connect</small><strong>Connect your wallet</strong><p>Use a Sui Mainnet account you control.</p></div></li><li><span><Brain size={18} aria-hidden="true"/></span><div><small aria-hidden="true">02 · Remember</small><strong>Set up your memory</strong><p>Create or link MemWal, then authorize app access.</p></div></li><li><span><UserRound size={18} aria-hidden="true"/></span><div><small aria-hidden="true">03 · Personalize</small><strong>Make your profile</strong><p>Choose a public name and your reserve setting.</p></div></li></ol>
    <details className="inline-details"><summary>About your records</summary><p className="field-help">Your profile, contacts and financial records are public on Sui. Behavioral notes use your personal MemWal account and Walrus. The workspace opens after memory authorization and profile registration.</p></details>
  </section>;
}
