import settings from '../content/site/settings.json';

/**
 * Site-wide editable text. Backed by src/content/site/settings.json, which the
 * Sveltia editor at /admin exposes as a form ("Site text"). Every field is
 * optional; empty strings render as "not set".
 */
export const site = {
  /** Shown under the wordmark in the masthead when non-empty. */
  tagline: (settings.tagline ?? '').trim(),
  /** First line of the homepage intro block. */
  introLede: (settings.introLede ?? '').trim(),
  /** Follow-on line under the lede. */
  introNote: (settings.introNote ?? '').trim(),
};
