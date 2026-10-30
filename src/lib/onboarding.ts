import type { OnChainUserProfile } from './onchain-user-manager';
import type { WalletMemWalAccount } from './memwal-account';

export function onboardingStatus(profile: OnChainUserProfile | null, account: WalletMemWalAccount | null) {
  const linked = !!profile?.isRegisteredOnChain && !!profile.profileId && !!account && account.owner === profile.wallet && account.accountId === profile.memwalAccountId;
  return { ready: linked && !!account?.active && account.delegateAuthorized, canRecover: linked };
}
