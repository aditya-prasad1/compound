import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "compound.",
  description: "Build better health through small, compounding actions.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('compound-theme');var d=m==='dark'||(!m&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
