"use client";
export function QuietMemorySignIn(p:{disabled:boolean;onEnable:()=>Promise<boolean>;onIndividual:()=>void}){
 return <div className="panel space-y-md" aria-labelledby="memory-sign-in-title"><h2 id="memory-sign-in-title">Sign in with Quiet Memory</h2>
 <p className="panel-description">Approve one wallet message to load your linked memories and authorize this tab for up to one hour. SolvencyLoop can recall saved facts and save standing preferences you state in chat.</p>
 <p className="field-help">You can turn Quiet Memory off at any time. Payments have separate wallet approvals or funded Autopilot consent.</p>
 <div className="product-actions"><button className="button primary-commit" disabled={p.disabled} onClick={()=>void p.onEnable()}>Authorize this session</button><button className="button-secondary" disabled={p.disabled} onClick={p.onIndividual}>Use individual approvals</button></div></div>;
}
