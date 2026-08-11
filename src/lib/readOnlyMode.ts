/**
 * Module-level read-only switch, mirrored from the demo session.
 * Non-React call sites (sentinel, tool handlers) consult this before mutating.
 */
let readOnly = false;

export function setReadOnlyMode(next: boolean) {
  readOnly = next;
}

export function isReadOnlyMode() {
  return readOnly;
}