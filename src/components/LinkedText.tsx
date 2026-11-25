import { splitLinks } from '../domain/links';

/** Text with any web links in it tappable; opens them in a new tab. */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((segment, i) =>
        segment.href ? (
          <a key={i} href={segment.href} target="_blank" rel="noopener noreferrer">
            {segment.text}
          </a>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
