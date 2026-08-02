/**
 * Loader shim: playing from the repo root keeps working (and keeps this
 * directory's existing pi sessions resumable). The whole game lives in
 * IA/extension — IA/ is standalone; this file only points at it.
 */
export { default } from "../../IA/extension/index.ts";
