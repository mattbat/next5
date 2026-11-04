import { useEffect, useState } from 'react';
import { isOwnError, logError } from '../errorLog';

/**
 * Shows unexpected errors on screen instead of failing silently, so a tap
 * that "does nothing" always explains itself.
 */
export function ErrorBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const text = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));
    const onRejection = (e: PromiseRejectionEvent) => {
      logError({ message: text(e.reason), source: 'promise', shown: true });
      setMessage(text(e.reason));
    };
    const onError = (e: ErrorEvent) => {
      // Errors from other sites' scripts (e.g. when Safari's Share sheet
      // opens) are noted for Diagnostics but not shown: see isOwnError.
      const own = isOwnError(e);
      logError({ message: text(e.error ?? e.message), source: e.filename || 'unknown', shown: own });
      if (own) setMessage(text(e.error ?? e.message));
    };
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
