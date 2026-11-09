/** Lowercase, drop accents and punctuation, collapse spaces: "Tríceps (barra)" -> "triceps barra". */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Ranks items by how close their name is to the query, ignoring accents, punctuation and word order.
 * Every query word must appear in the name (at the start of a word, or anywhere inside it).
 */
export function searchByName<T extends { name: string }>(items: T[], query: string, limit = 6): T[] {
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const name = normalizeText(item.name);
    const words = name.split(" ");
    let score = 0;
    let ok = true;
    for (const token of tokens) {
      if (words.some((w) => w === token)) score += 3;
      else if (words.some((w) => w.startsWith(token))) score += 2;
      else if (name.includes(token)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (name.startsWith(tokens.join(" "))) score += 2;
    scored.push({ item, score });
  }
  // Array.sort is stable, so equal scores keep the catalog order.
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item);
}
