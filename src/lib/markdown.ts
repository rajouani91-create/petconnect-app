// Kleiner, sicherer Markdown-Leser für die Antworten des Assistenten. Erzeugt nur Daten (keine HTML-Zeichenketten);
// die Darstellung übernimmt React. Unterstützt: Überschriften, Absätze, Aufzählungen, nummerierte Listen, Tabellen,
// **fett**, *kursiv*, `code`. Links, Bilder und HTML werden bewusst NICHT umgesetzt (bleiben einfacher Text).

export type Inline = { readonly t: 'text' | 'bold' | 'italic' | 'code'; readonly s: string };
export type Block =
  | { readonly k: 'h'; readonly level: 3 | 4; readonly inl: Inline[] }
  | { readonly k: 'p'; readonly inl: Inline[] }
  | { readonly k: 'ul'; readonly items: Inline[][] }
  | { readonly k: 'ol'; readonly start: number; readonly items: Inline[][] }
  | { readonly k: 'table'; readonly head: Inline[][]; readonly rows: Inline[][][] };

const INLINE = /\*\*(.+?)\*\*|__(.+?)__|(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])|`([^`\n]+)`/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let pos = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > pos) out.push({ t: 'text', s: text.slice(pos, m.index) });
    if (m[1] !== undefined || m[2] !== undefined) out.push({ t: 'bold', s: (m[1] ?? m[2])! });
    else if (m[3] !== undefined) out.push({ t: 'italic', s: m[3] });
    else out.push({ t: 'code', s: m[4]! });
    pos = m.index + m[0].length;
  }
  if (pos < text.length) out.push({ t: 'text', s: text.slice(pos) });
  return out;
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const UL = /^\s*[-*•]\s+(.*)$/;
const OL = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const SEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map((c) => c.trim());
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ k: 'p', inl: parseInline(para.join('\n')) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') {
      flush();
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      blocks.push({ k: 'h', level: h[1]!.length <= 3 ? 3 : 4, inl: parseInline(h[2]!) });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && SEP.test(lines[i + 1]!) && lines[i + 1]!.includes('-')) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
        rows.push(cells(lines[i]!));
        i++;
      }
      i--;
      const n = head.length;
      const fit = (r: string[]) => Array.from({ length: n }, (_, c) => parseInline(r[c] ?? ''));
      blocks.push({ k: 'table', head: head.map((c) => parseInline(c)), rows: rows.map(fit) });
      continue;
    }
    const ul = UL.exec(line);
    const ol = OL.exec(line);
    if (ul || ol) {
      flush();
      const ordered = !!ol;
      const items: Inline[][] = [];
      const start = ol ? Number(ol[1]) : 1;
      for (; i < lines.length; i++) {
        const cur = lines[i]!;
        const u = UL.exec(cur);
        const o = OL.exec(cur);
        if (ordered ? o : u) items.push(parseInline((ordered ? o![2] : u![1])!));
        else if (cur.trim() !== '' && /^\s{2,}\S/.test(cur) && items.length && !u && !o) {
          // eingerückte Fortsetzungszeile gehört zum letzten Punkt
          items[items.length - 1] = [...items[items.length - 1]!, ...parseInline(` ${cur.trim()}`)];
        } else break;
      }
      i--;
      blocks.push(ordered ? { k: 'ol', start, items } : { k: 'ul', items });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}
