import type { ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from '../../lib/markdown';

function inl(items: readonly Inline[]): ReactNode[] {
  return items.map((x, i) => {
    if (x.t === 'bold') return <strong key={i}>{x.s}</strong>;
    if (x.t === 'italic') return <em key={i}>{x.s}</em>;
    if (x.t === 'code') return <code key={i}>{x.s}</code>;
    return x.s;
  });
}

function block(b: Block, i: number): ReactNode {
  switch (b.k) {
    case 'h':
      return b.level === 3 ? <h3 key={i} className="ai-h">{inl(b.inl)}</h3> : <h4 key={i} className="ai-h">{inl(b.inl)}</h4>;
    case 'p':
      return <p key={i} className="ai-p">{inl(b.inl)}</p>;
    case 'ul':
      return <ul key={i} className="ai-list">{b.items.map((it, j) => (<li key={j}>{inl(it)}</li>))}</ul>;
    case 'ol':
      return <ol key={i} className="ai-list" start={b.start}>{b.items.map((it, j) => (<li key={j}>{inl(it)}</li>))}</ol>;
    case 'table':
      return (
        <div key={i} className="ai-table-wrap">
          <table className="ai-table">
            <thead><tr>{b.head.map((c, j) => (<th key={j} scope="col">{inl(c)}</th>))}</tr></thead>
            <tbody>{b.rows.map((r, j) => (<tr key={j}>{r.map((c, k) => (<td key={k}>{inl(c)}</td>))}</tr>))}</tbody>
          </table>
        </div>
      );
  }
}

/** Zeigt die Antwort des Assistenten formatiert an (nur Text-Elemente, kein HTML aus der Antwort). */
export function RichText({ text }: { readonly text: string }) {
  return <div className="ai-rich">{parseMarkdown(text).map(block)}</div>;
}
