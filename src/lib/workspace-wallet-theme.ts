import {lightTheme,type ThemeVars} from '@mysten/dapp-kit';

/** Visual theme only. Wallet discovery, connection and signing stay in dapp-kit. */
export const workspaceWalletTheme:ThemeVars={
 ...lightTheme,
 blurs:{modalOverlay:'blur(12px)'},
 backgroundColors:{...lightTheme.backgroundColors,primaryButton:'#313030',primaryButtonHover:'#1c1b1b',outlineButtonHover:'#f6f3f2',walletItemHover:'#ebe7e7',walletItemSelected:'#fff',modalOverlay:'rgba(28,27,27,.24)',modalPrimary:'#fff',modalSecondary:'#f6f3f2',iconButton:'#f6f3f2',iconButtonHover:'#ebe7e7',dropdownMenu:'#fff',dropdownMenuSeparator:'#e5e2e1'},
 borderColors:{outlineButton:'#e5e2e1'},
 colors:{primaryButton:'#fff',outlineButton:'#1c1b1b',body:'#1c1b1b',bodyMuted:'#5c6861',bodyDanger:'#b42318',iconButton:'#1c1b1b'},
 radii:{small:'6px',medium:'8px',large:'12px',xlarge:'20px'},
 shadows:{primaryButton:'0 4px 16px rgba(49,48,48,.08)',walletItemSelected:'0 2px 8px rgba(28,27,27,.06)'},
 typography:{fontFamily:'"Hanken Grotesk", Arial, sans-serif',fontStyle:'normal',lineHeight:'1.5',letterSpacing:'normal'},
 fontWeights:{normal:'400',medium:'500',bold:'650'},
};
