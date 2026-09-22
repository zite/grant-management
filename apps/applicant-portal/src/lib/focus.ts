/** Scroll a form field into view and put the cursor in it — used whenever we say "this needs fixing". */
export function focusField(fieldId: string) {
  const wrap = document.querySelector<HTMLElement>(`[data-field-id="${CSS.escape(fieldId)}"]`);
  if (!wrap) return false;
  wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const target = wrap.querySelector<HTMLElement>(
    'input:not([type=file]):not([tabindex="-1"]), textarea, button[role=radio], button[role=checkbox], button[role=combobox], [role=button], select',
  );
  window.setTimeout(() => target?.focus({ preventScroll: true }), 300);
  return true;
}
