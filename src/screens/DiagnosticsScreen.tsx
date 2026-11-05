import { useEffect, useState } from 'react';
import { Section, TopBar } from '../components/ui';
import { lastError } from '../errorLog';
import { paths } from '../router';
import { appHeight, isStandalone } from '../viewport';

function safeAreaInsets() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const insets = `${s.paddingTop} / ${s.paddingRight} / ${s.paddingBottom} / ${s.paddingLeft}`;
  probe.remove();
  return insets;
}

function measure(css: string): number {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;width:1px;${css}`;
  document.body.appendChild(probe);
  const height = Math.round(probe.getBoundingClientRect().height);
  probe.remove();
  return height;
}

/** The last unexpected error, and whether the error banner showed it. */
function describeLastError(): string {
  const e = lastError();
  if (!e) return 'none';
  const when = new Date(e.at).toLocaleString();
  return `${e.message} (from ${e.source}, ${e.shown ? 'shown' : 'not shown'}, ${when})`;
}

function readings(): [string, string][] {
  return [
    ['Build', __BUILD_TIME__],
    ['Last error', describeLastError()],
    ['Running as app (Home Screen)', isStandalone() ? 'yes' : 'no'],
    ['Secure page (https)', window.isSecureContext ? 'yes' : 'no'],
    ['Screen size', `${window.screen.width} × ${window.screen.height}`],
    ['Window size (inner)', `${window.innerWidth} × ${window.innerHeight}`],
    ['Visual viewport height', String(Math.round(window.visualViewport?.height ?? 0))],
    ['100vh / 100dvh / 100svh / 100lvh', ['100vh', '100dvh', '100svh', '100lvh'].map((u) => measure(`height:${u}`)).join(' / ')],
    ['Fixed inset 0 height', String(measure('top:0;bottom:0'))],
    ['App height used', `${appHeight()}`],
    ['Safe areas (top / right / bottom / left)', safeAreaInsets()],
    ['Device pixel ratio', String(window.devicePixelRatio)],
    ['Screen wake lock available', 'wakeLock' in navigator ? 'yes' : 'no'],
    ['User agent', navigator.userAgent],
  ];
}

/** Hidden page (#/diagnostics) showing what the phone reports, for troubleshooting layout. */
export function DiagnosticsScreen() {
  const [rows, setRows] = useState(readings);
  useEffect(() => {
    const update = () => setRows(readings());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <main className="screen">
      <TopBar title="Diagnostics" back={paths.teams()} />
      <Section title="This device">
        <ul className="list">
          {rows.map(([label, value]) => (
            <li key={label} className="list-item static diag">
              <span className="list-title">{label}</span>
              <span className="list-meta">{value}</span>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
