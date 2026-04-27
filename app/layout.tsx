import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'COMPILER — AI Platform Engineer',
  description: 'Multi-stage AI pipeline that converts natural language product descriptions into complete, validated, executable application configurations.',
  keywords: ['AI', 'pipeline', 'compiler', 'app generation', 'schema', 'Groq'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <nav className="nav">
          <a href="/" className="nav-logo">
            <div className="nav-logo-icon">⚙</div>
            COMPILER
          </a>
          <div className="nav-links">
            <a href="/" className="nav-link">Input</a>
            <a href="/generate" className="nav-link">Pipeline</a>
            <a href="/output" className="nav-link">Output</a>
            <a href="/eval" className="nav-link">Eval</a>
          </div>
        </nav>
        <div className="page-wrapper">{children}</div>
      </body>
    </html>
  );
}
