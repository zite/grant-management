/**
 * ScorecardInput owns its own markup; rows carry `data-criterion-id` and the
 * recommendation block `data-recommendation`, which is how focus is steered.
 */

export function criterionRows(wrap: HTMLElement | null): HTMLElement[] {
  if (!wrap) return [];
  return [...wrap.querySelectorAll<HTMLElement>('[data-criterion-id]')];
}

export function recommendationButtons(wrap: HTMLElement | null): HTMLButtonElement[] {
  if (!wrap) return [];
  return [...wrap.querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-label="Recommendation"] button')];
}

export function focusElement(el: HTMLElement | null | undefined, opts: { center?: boolean } = {}) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: opts.center ? 'center' : 'nearest', behavior: 'smooth' });
}
