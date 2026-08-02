/**
 * Loader shim: /limits lives in IA (standalone); this keeps it available
 * when pi runs from the repo root.
 */
export { default } from "../../IA/.pi/extensions/usage-limits.ts";
