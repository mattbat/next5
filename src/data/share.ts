/**
 * Hands a file to the user. On iPhone this opens the share sheet (Save to
 * Files, iCloud Drive, AirDrop, Mail...). Where sharing files isn't
 * supported (most desktop browsers), the file is downloaded instead.
 */
export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export async function shareFile(name: string, text: string, type = 'application/json'): Promise<ShareOutcome> {
  const file = new File([text], name, { type });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (error) {
      // The coach closed the share sheet without choosing anything.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Anything else: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export type LinkOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Hands a link to the user: the share sheet on iPhone (Messages, WhatsApp,
 * Mail...), or the clipboard where sharing isn't supported.
 */
export async function shareLink(url: string, title: string, text: string): Promise<LinkOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      // Messages joins text and url into one message.
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Shares a CSV file (S5) and says what happened, for a status message. */
export async function shareCsv(name: string, csv: string): Promise<string> {
  const outcome = await shareFile(name, csv, 'text/csv');
  if (outcome === 'cancelled') return 'Export cancelled.';
  return outcome === 'shared' ? 'Stats exported.' : 'Stats file downloaded.';
}
