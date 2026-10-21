/**
 * Typo-tolerant search based on Levenshtein distance.
 * «апетка» finds «Аптека», «супермакет» finds «Супермаркет», «прод» finds «Продукты».
 */

/** Lowercase, ё → е, punctuation → spaces */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Classic Levenshtein distance with two rolling rows; stops early once `max` is exceeded */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Allowed typos for a query word: none for very short words, then 1, then 2 */
function allowedDistance(token: string): number {
  if (token.length <= 2) return 0;
  if (token.length <= 5) return 1;
  return 2;
}

/**
 * How well a query word matches a text word: 0 — exact/substring, 1..n — number of typos,
 * null — no match. A word being typed is compared with the beginning of the text word.
 */
function tokenScore(token: string, word: string): number | null {
  if (word.includes(token)) return 0;
  const max = allowedDistance(token);
  if (max === 0) return null;
  const whole = levenshtein(token, word, max);
  const prefix = word.length > token.length ? levenshtein(token, word.slice(0, token.length), max) : whole;
  const best = Math.min(whole, prefix);
  return best <= max ? best : null;
}

export interface SearchMatch {
  /** 0 when every word matched exactly, otherwise the total number of typos */
  score: number;
}

/** Every word of the query must match some word of the text */
export function fuzzyMatch(query: string, text: string): SearchMatch | null {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return { score: 0 };
  const words = normalize(text).split(' ').filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    let best: number | null = null;
    for (const word of words) {
      const s = tokenScore(token, word);
      if (s !== null && (best === null || s < best)) best = s;
      if (best === 0) break;
    }
    if (best === null) return null;
    score += best;
  }
  return { score };
}
