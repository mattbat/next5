import { useEffect, useState } from 'react';

/**
 * Shows unexpected errors on screen instead of failing silently, so a tap
 * that "does nothing" always explains itself.
 */
export function ErrorBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const show = (reason: unknown) => setMessage(reason instanceof Error ? reason.message : String(reason));
    const onRejection = (e: PromiseRejectionEvent) => show(e.reason);
    const onError = (e: ErrorEvent) => show(e.error ?? e.message);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  if (message === null) return null;
  return (
    <div className="error-banner" role="alert">
      <span>
        <strong>Something went wrong.</strong> {message}
      </span>
      <button type="button" className="link" onClick={() => setMessage(null)}>
        Dismiss
      </button>
    </div>
  );
}
