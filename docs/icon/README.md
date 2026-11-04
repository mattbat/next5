# App icon

The icon is `public/favicon.svg`. `npm run icons` turns it into the PNGs in `public/` (see `pwa-assets.config.ts`).

**Current icon: option V2z (chosen 2026-11-04).** A royal blue court with faint basketball seams, a solid orange 5 and a white glass "next" chevron. The 5 is drawn as a shape, so it doesn't depend on the fonts installed on the machine that builds the PNGs. The SVG is a full square: iOS and Android cut their own rounded corners.

`icon-options.html` is the review page with every option from the 2026-11-04 rounds: the original icon (A), ball and rotation ideas (B–P), L with a basketball (Q–W), color studies (U1–V2) and typefaces for the 5 (the U1/U2/V2 grid, codes like `U2c`). Open it in a browser.

To switch to another option:

1. Find its `<symbol id="v…">` near the top of `icon-options.html`.
2. Copy that drawing, and the `<defs>` it uses, into `public/favicon.svg` as a 512 × 512 square.
3. Run `npm run icons` and check the PNGs.
4. Commit the SVG and the PNGs together.

The typeface 5s come from Google Fonts under the SIL Open Font License (Graduate, Saira Condensed, Russo One, Archivo Black, Anton), converted to shapes.
