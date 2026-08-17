/**
 * Proper-name candidates in keeper prose — the record-on-mention sweep's eye
 * (2026-08-04 round, WC-15). Pure and unit-testable like ui.ts: no pi, no fs.
 *
 * The engine cannot know which capitalized words are souls or places — the
 * KEEPER judges that (the sweep's standing line asks it to; a name REPEATED
 * across consecutive replies without a page escalates to the engine's nudge,
 * ruled 2026-08-17, and after two quiet offers or one nudge the quill rests).
 * So this module leans toward RECALL: a spurious candidate costs one ignored
 * line; a missed Garrick is WC-15 recurring. AI batch 2's misses — Garrick,
 * Torvin, Bernd, Crossed Stones, Millbrook, Saltmere, Ashford, Blackthorn
 * Vale, the Salt Marshes — all match, as do the first human batch's (Kess,
 * Herta, Aldous, the Anchor's Rest, Greystone Vale).
 */

/** A swept name is offered at most this often through the standing layer
 * before the quill lets it rest. Per process — a restart at worst re-offers
 * a dismissed name twice more. */
export const NAME_OFFER_CAP = 2;

/** What the sweep remembers between replies (per process, reset per session). */
export interface SweepMemory {
	/** nameKey → standing-layer offers made so far. */
	offered: Map<string, number>;
	/** nameKey → the sweep generation that last saw the name unpaged. */
	lastSeen: Map<string, number>;
	/** nameKey → consecutive replies (as of lastSeen) naming it unpaged. */
	streak: Map<string, number>;
	/** Names that drew their one nudge — after teeth, the quill rests. */
	nudged: Set<string>;
	/** Monotone count of sweeps run (one per keeper reply examined). */
	gen: number;
}

export function newSweepMemory(): SweepMemory {
	return { offered: new Map(), lastSeen: new Map(), streak: new Map(), nudged: new Set(), gen: 0 };
}

/**
 * One reply's sweep verdict (WC-15 escalation, ruled 2026-08-17): candidates
 * are this reply's unpaged proper names. A name REPEATED across consecutive
 * replies without gaining a page has already ignored a standing offer — the
 * second consecutive miss earns the course-correction NUDGE, once per name
 * (conservative by design; false positives accepted at this threshold, per
 * the ruling). Every other candidate rides the standing layer as an offer,
 * at most NAME_OFFER_CAP times.
 */
export function sweepNames(memory: SweepMemory, candidates: string[]): { offers: string[]; nudges: string[] } {
	memory.gen += 1;
	const offers: string[] = [];
	const nudges: string[] = [];
	for (const name of candidates) {
		const key = nameKey(name);
		if (!key) continue;
		const streak = memory.lastSeen.get(key) === memory.gen - 1 ? (memory.streak.get(key) ?? 0) + 1 : 1;
		memory.lastSeen.set(key, memory.gen);
		memory.streak.set(key, streak);
		if (memory.nudged.has(key)) continue; // teeth shown once — the quill rests
		if (streak >= 2) {
			memory.nudged.add(key);
			nudges.push(name);
			continue;
		}
		const count = memory.offered.get(key) ?? 0;
		if (count >= NAME_OFFER_CAP) continue;
		memory.offered.set(key, count + 1);
		offers.push(name);
	}
	return { offers, nudges };
}

/** Grammar words and the game's own register nouns — never worth a page nag.
 * World nouns ("Thorne", "Ember") must NOT be here; the keeper judges those. */
const STOP = new Set(
	(
		"a an the and but or nor so yet for of in on at to from with by as if is are was were be been being " +
		"i you your yours he him his she her hers it its they them their theirs we us our ours me my mine " +
		"this that these those there here what when where who whom whose why how which while than then thus " +
		"not no nothing none nobody nowhere never always perhaps maybe once twice again still already soon now " +
		"today tonight tomorrow yesterday dawn dusk morning noon evening night day before after above below " +
		"beyond beneath behind between among within without inside outside against toward towards until unless " +
		"because though although despite during under over up down out off let say says said speak spoke tell " +
		"told ask asked come came go went gone stand stood hold held keep kept promise whatever something " +
		"someone everyone everything anyone anything each every both all any one two three first last next " +
		"keeper seeker chronicle chronicler ledger quill table engine game master mistress lord lady old young " +
		"good very most more sleep silence rain wind snow fire water time death fear hope blood darkness light " +
		"stone steel war peace winter summer spring autumn"
	).split(/\s+/),
);

/** Joiners allowed INSIDE a multi-word name ("Vale of Cinders", "Wayfarer's Rest"). */
const JOINERS = new Set(["of", "the", "and"]);

/** Normalize for known-set membership: lowercase, possessives eased. */
export function nameKey(name: string): string {
	return name
		.toLowerCase()
		.replace(/[’']s\b/g, "")
		.replace(/[^a-z0-9äöüß]+/g, " ")
		.trim();
}

/**
 * Candidate proper names in `text` that are not in `known` (page titles, the
 * world's own names, the seeker…). Capitalized runs, broken by any
 * punctuation, joiners allowed between capitalized words; leading/trailing
 * stopwords trimmed off. Order of first appearance, capped.
 */
export function extractCandidateNames(text: string, known: Iterable<string>, cap = 6): string[] {
	const knownKeys = new Set<string>();
	for (const item of known) {
		const key = nameKey(String(item));
		if (key) knownKeys.add(key);
	}
	/** Known outright, or a word-bounded part of something known ("Salt Road"
	 * inside the paged "The Salt Road North"). */
	const isKnown = (key: string): boolean => {
		if (knownKeys.has(key)) return true;
		for (const knownKey of knownKeys) {
			if (` ${knownKey} `.includes(` ${key} `)) return true;
		}
		return false;
	};
	// Punctuation breaks a run; only words survive within one segment.
	const segments = text.split(/[^\wäöüßÄÖÜ'’ -]+|--+|—|–/);
	const candidates = new Map<string, string>();
	for (const segment of segments) {
		const words = segment.split(/[\s-]+/).filter(Boolean);
		for (let i = 0; i < words.length; i++) {
			if (!/^[A-ZÄÖÜ][a-zä-üß'’]*$/.test(words[i])) continue;
			const run: string[] = [words[i]];
			let j = i + 1;
			while (j < words.length) {
				if (/^[A-ZÄÖÜ][a-zä-üß'’]*$/.test(words[j])) {
					run.push(words[j]);
					j++;
				} else if (
					JOINERS.has(words[j].toLowerCase()) &&
					j + 1 < words.length &&
					/^[A-ZÄÖÜ][a-zä-üß'’]*$/.test(words[j + 1])
				) {
					run.push(words[j], words[j + 1]);
					j += 2;
				} else break;
			}
			i = j - 1;
			// Trim stopwords off both ends ("The Crossed Stones" → "Crossed
			// Stones"; a run that was only stopwords dies here).
			while (run.length && STOP.has(run[0].toLowerCase())) run.shift();
			while (run.length && STOP.has(run[run.length - 1].toLowerCase())) run.pop();
			if (run.length === 0) continue;
			const name = run.join(" ").replace(/[’']s$/, "");
			const key = nameKey(name);
			if (!key || isKnown(key)) continue;
			// "Marta the dye-merchant": a run whose head word is known alone
			// is the known soul under a fuller style, not a new name.
			if (run.length > 1 && isKnown(nameKey(run[0]))) continue;
			if (!candidates.has(key)) candidates.set(key, name);
		}
	}
	return [...candidates.values()].slice(0, cap);
}
