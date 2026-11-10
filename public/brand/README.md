# SolvencyLoop brand assets

This kit reproduces the current LLM workspace header: the white Lucide Infinity icon inside an emerald square with small corners, alongside the uppercase Hanken Grotesk wordmark. It replaces the former blue S favicon. Sources: src/components/AgentChrome.tsx, src/app/app/agent.css, and src/app/app/product.css.

| Asset | Use |
| --- | --- |
| [solvencyloop-mark.svg](./solvencyloop-mark.svg) / [PNG](./solvencyloop-mark.png) | Standalone header mark; SVG preferred. |
| [solvencyloop-logo.svg](./solvencyloop-logo.svg) / [PNG](./solvencyloop-logo.png) | Full horizontal logo on light surfaces. |
| [solvencyloop-logo-dark.svg](./solvencyloop-logo-dark.svg) / [PNG](./solvencyloop-logo-dark.png) | Full logo with white lettering for dark surfaces; transparent background. |
| [solvencyloop-wordmark.svg](./solvencyloop-wordmark.svg) / [dark](./solvencyloop-wordmark-dark.svg) | Typography-only uppercase wordmark. |
| [typography.svg](./typography.svg) / [PNG](./typography.png) | Typeface, hierarchy, glyph and palette specimen. |
| [typography.css](./typography.css) / [brand-tokens.json](./brand-tokens.json) | Reusable typography rules and current identity values. |
| favicon-16.png, favicon-32.png, favicon-48.png, apple-touch-icon.png | Browser and home-screen exports. The application icon, favicon.ico and apple-icon.png are generated from the same mark. |

Logo/wordmark SVGs embed the existing Hanken Grotesk font so browsers render the intended lettering without a separate font request. They retain editable text, rather than claiming to be outlined letterforms. For other typography, use the bundled [font](../fonts/HankenGrotesk.ttf) under its [SIL Open Font License](../fonts/HankenGrotesk-OFL.txt). The infinity icon is from the installed Lucide package; its [license notice](./LUCIDE-LICENSE.txt) is included.

Keep the green mark and white infinity together. Use the dark logo on charcoal backgrounds. Leave at least half a mark width of clear space, and use the standalone mark when the wordmark would become unreadable. Warm paper is the main canvas; green identifies the brand, Klein blue supports memory/information, and amber indicates pending/attention. Never use color alone to report a financial state.

Regenerate from the repository root: node scripts/render-brand-assets.mjs. It uses local fonts and headless Chrome for exact typography and never connects to a wallet or financial API. Blog visuals use the same renderer through scripts/render-blog-visuals.mjs.
