import { SolvencyProviders } from "./providers";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-primary text-primary antialiased">
        <SolvencyProviders>{children}</SolvencyProviders>
      </body>
    </html>
  );
}
