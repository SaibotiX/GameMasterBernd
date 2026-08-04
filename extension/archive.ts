/**
 * Pure keyword retrieval over the sitting's record, for the GM table's
 * recall questions ("how was the king called?", "what did you say about that
 * dungeon?"). Code extracts the main words of the question, searches every
 * line of the record very broadly (stemmed substring match over messages AND
 * ledger events), and returns each hit WITH its neighbours — the line above
 * and below — merged and capped. The table AI answers from these excerpts
 * instead of memory, citing the *uN* marks.
 *
 * uN is an entry's 1-based position in the append-only session file
 * (sessionManager.getEntries()), so numbers are stable across branches and
 * never renumber — the same N the /ledger command and amendment flow use.
 */

export interface ArchiveLine {
	/** Stable per-ledger number: 1-based position in the session file. */
	uid: number;
	who: "seeker" | "game" | "ledger" | "table";
	text: string;
}

export function formatArchiveLine(line: ArchiveLine): string {
	return `*u${line.uid}* ${line.who}: ${line.text}`;
}

/** Words too common to carry a search: question scaffolding, articles, chatter. */
const STOPWORDS = new Set([
	"the", "and", "for", "are", "was", "were", "will", "would", "could", "should", "shall", "can",
	"may", "might", "must", "have", "has", "had", "having", "been", "being", "not", "but", "you",
	"your", "yours", "our", "ours", "their", "theirs", "his", "her", "hers", "its", "him", "she",
	"they", "them", "this", "that", "these", "those", "there", "here", "what", "which", "who",
	"whom", "whose", "when", "where", "why", "how", "did", "does", "doing", "done", "with",
	"without", "about", "into", "onto", "from", "very", "too", "then", "than", "over", "under",
	"again", "once", "ever", "never", "always", "please", "tell", "told", "say", "said", "says",
	"ask", "asked", "know", "just", "like", "well", "also", "any", "all", "some", "one", "two",
	"out", "get", "got", "let", "yes", "now", "still", "chat", "sitting", "table", "earlier",
]);

/**
 * Split long text into search-sized chunks on sentence-ish boundaries, so a
 * fact deep inside a long keeper speech is still found and shown — every
 * chunk of one entry shares that entry's uid.
 */
export function chunkText(text: string, maxLen = 400): string[] {
	const flat = text.replace(/\s+/g, " ").trim();
	if (!flat) return [];
	if (flat.length <= maxLen) return [flat];
	const sentences = flat.match(/[^.!?…]+[.!?…]*\s*/g) ?? [flat];
	const chunks: string[] = [];
	let current = "";
	for (let sentence of sentences) {
		if (current && current.length + sentence.length > maxLen) {
			chunks.push(current.trim());
			current = "";
		}
		while (sentence.length > maxLen) {
			chunks.push(sentence.slice(0, maxLen).trim());
			sentence = sentence.slice(maxLen);
		}
		current += sentence;
	}
	if (current.trim()) chunks.push(current.trim());
	return chunks;
}

function stem(word: string): string {
	if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
	if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
	if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
	if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
	return word;
}

/** The main words of a question, stemmed for broad matching. */
export function extractKeywords(question: string, max = 8): string[] {
	const words = question
		.toLowerCase()
		.split(/[^a-z0-9äöüß']+/i)
		.map((word) => word.replace(/'s$/, "").replace(/'/g, ""))
		.filter(Boolean);
	const keywords: string[] = [];
	for (const word of words) {
		if (word.length < 3 || STOPWORDS.has(word)) continue;
		const stemmed = stem(word);
		if (!keywords.includes(stemmed)) keywords.push(stemmed);
		if (keywords.length >= max) break;
	}
	return keywords;
}

/**
 * Every line matching any keyword, together with `window` lines above and
 * below it; overlapping windows merge. Over the cap, the newest hits win.
 */
export function searchArchive(
	lines: ArchiveLine[],
	keywords: string[],
	window = 1,
	maxLines = 40,
): ArchiveLine[] {
	if (keywords.length === 0) return [];
	const keep = new Set<number>();
	for (let i = 0; i < lines.length; i++) {
		const haystack = lines[i].text.toLowerCase();
		if (keywords.some((keyword) => haystack.includes(keyword))) {
			for (let j = Math.max(0, i - window); j <= Math.min(lines.length - 1, i + window); j++) {
				keep.add(j);
			}
		}
	}
	const picked = [...keep].sort((a, b) => a - b);
	return (picked.length > maxLines ? picked.slice(-maxLines) : picked).map((index) => lines[index]);
}
