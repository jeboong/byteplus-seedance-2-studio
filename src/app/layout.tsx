import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seedance 2.0 Studio",
  description: "AI Video Generation powered by BytePlus ModelArk Seedance 2.0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Inline script runs BEFORE React hydrates and BEFORE first paint, so the
  // user's saved theme (or system preference fallback) is applied with no
  // flash of incorrect colors.
  const themeBoot = `
(function(){try{
  var s = localStorage.getItem('sd2_theme');
  var d = s ? s === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  var r = document.documentElement;
  if (d) r.classList.add('dark'); else r.classList.remove('dark');
  r.style.colorScheme = d ? 'dark' : 'light';
  r.style.backgroundColor = d ? '#0a0a0a' : '#ffffff';
}catch(e){}})();`;

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
