// Values copied from the spec's "Verified 2026-11-12" block (the first trial, plan Task 1).

// Verified 2026-11-12: outcome 1.
export const OUTCOME = 1;

// Verified 2026-11-12, and built into assets/page.js, so not set here: the map page sits in the walkthrough page
// as a JSON string and is set as the frame's srcdoc; capture-phase listeners stop every key and pointer event on
// the board, with no overlay; the page sets the frame's documentElement.dataset.theme once after chalk.ready and
// on every toggle.

// Verified 2026-11-12: a style added before </head> hides the map's caption bar.
export const CAPTION_BAR = 'hidden';

// Verified 2026-11-12: the map's own code panel stays.
export const CODE_PANEL = 'kept';

// Verified 2026-11-12: 1100 px (900 px could be taller; the embed read well at 1100).
export const EMBED_HEIGHT = 1100;

// Verified 2026-11-12: the way out of Obsidian is the Embed HTML plugin's button.
export const OPEN_LINK = 'button';

// Verified 2026-11-12: the build's time budget in milliseconds.
export const BUDGET_MS = 30000;
