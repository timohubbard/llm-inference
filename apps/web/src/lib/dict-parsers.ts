// Client-side parsers for user-uploaded dictionaries. Parsing happens in the
// browser so the uploaded file never leaves the user's machine — only the
// parsed `{ category: [...words] }` shape is POSTed to the custom_dict path.

export type ParsedDict = Record<string, string[]>;

export class DictParseError extends Error {}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

// LIWC `.dic` format:
//   %
//   1  category_name
//   2  other_category
//   %
//   word   1   2
//   lemma  1
//
// Numeric codes before/after `%` block map to category names; the body lists
// words followed by one or more numeric codes.
export function parseLiwcDic(text: string): ParsedDict {
  const src = stripBom(text).replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  const idToName = new Map<string, string>();
  let inHeader = false;
  let headersSeen = 0;
  let i = 0;
  for (; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw) continue;
    if (raw === "%") {
      if (!inHeader) {
        inHeader = true;
      } else {
        headersSeen++;
        i++;
        break;
      }
      continue;
    }
    if (inHeader) {
      // "1  category_name" or "1\tcategory_name"
      const parts = raw.split(/\s+/);
      if (parts.length >= 2 && /^\d+$/.test(parts[0]!)) {
        idToName.set(parts[0]!, parts.slice(1).join("_").toLowerCase());
      }
    }
  }
  if (headersSeen === 0 || idToName.size === 0) {
    throw new DictParseError(
      "Could not parse LIWC .dic header. Expected a `%` block listing `<id>  <category_name>` lines.",
    );
  }
  const dict: ParsedDict = {};
  for (const [, name] of idToName) dict[name] = [];
  for (; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw || raw.startsWith("//")) continue;
    const parts = raw.split(/\s+/);
    if (parts.length < 2) continue;
    const word = parts[0]!.toLowerCase();
    for (const code of parts.slice(1)) {
      const name = idToName.get(code);
      if (name && dict[name]) dict[name]!.push(word);
    }
  }
  for (const k of Object.keys(dict)) {
    if (dict[k]!.length === 0) delete dict[k];
  }
  if (Object.keys(dict).length === 0) {
    throw new DictParseError("Parsed zero words from the LIWC .dic file.");
  }
  return dict;
}

// CSV with header `category,word` or `word,category` (auto-detected by checking
// which column has repeated values). Also accepts no header.
export function parseCsvDict(text: string): ParsedDict {
  const src = stripBom(text).replace(/\r\n?/g, "\n").trim();
  if (!src) throw new DictParseError("CSV is empty.");
  const rows = src
    .split("\n")
    .map((r) => r.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((r) => r.length >= 2 && r[0] !== "");
  if (rows.length === 0) throw new DictParseError("CSV has no usable rows.");

  let start = 0;
  const header = rows[0]!.map((h) => h.toLowerCase());
  let catCol = 0;
  let wordCol = 1;
  if (header.includes("category") && header.includes("word")) {
    catCol = header.indexOf("category");
    wordCol = header.indexOf("word");
    start = 1;
  } else {
    // heuristic: if first column has far fewer unique values, it's the category
    const uniq = (col: number) => new Set(rows.map((r) => r[col] ?? "")).size;
    if (uniq(1) < uniq(0)) {
      catCol = 1;
      wordCol = 0;
    }
  }
  const dict: ParsedDict = {};
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]!;
    const cat = (row[catCol] ?? "").toLowerCase();
    const word = (row[wordCol] ?? "").toLowerCase();
    if (!cat || !word) continue;
    (dict[cat] ||= []).push(word);
  }
  if (Object.keys(dict).length === 0) {
    throw new DictParseError("CSV produced no category→word mappings.");
  }
  return dict;
}

export function parseJsonDict(text: string): ParsedDict {
  let data: unknown;
  try {
    data = JSON.parse(stripBom(text));
  } catch (e) {
    throw new DictParseError(`JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new DictParseError("JSON must be an object of `{ category: [words] }`.");
  }
  const dict: ParsedDict = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    dict[k.toLowerCase()] = v.filter((w): w is string => typeof w === "string").map((w) => w.toLowerCase());
  }
  if (Object.keys(dict).length === 0) {
    throw new DictParseError("JSON object has no category arrays.");
  }
  return dict;
}

export function parseDictionaryFile(filename: string, text: string): ParsedDict {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".dic")) return parseLiwcDic(text);
  if (lower.endsWith(".csv")) return parseCsvDict(text);
  if (lower.endsWith(".json")) return parseJsonDict(text);
  // Fall back: try JSON, then LIWC, then CSV
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return parseJsonDict(text);
  if (trimmed.startsWith("%")) return parseLiwcDic(text);
  return parseCsvDict(text);
}
