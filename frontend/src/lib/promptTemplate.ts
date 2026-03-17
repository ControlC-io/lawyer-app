/**
 * Tokenizer and resolver for prompt templates (same syntax as prompt_template_inline_v3_fix.html).
 * Keys in prompt_values are "type:key" e.g. "text:name", "select:secteur".
 */

export type PromptValues = Record<string, string | string[] | string[][] | boolean | undefined>;

export type Token =
  | { type: 'static'; text: string }
  | { type: 'hidden'; key: string; value: string }
  | { type: 'variable'; key: string; value: string }
  | { type: 'info'; message: string }
  | { type: 'text'; key: string; placeholder: string }
  | { type: 'textarea'; key: string }
  | { type: 'number'; key: string; min: number; max: number }
  | { type: 'select'; key: string; opts: string[] }
  | { type: 'multiselect'; key: string; opts: string[] }
  | { type: 'list'; key: string }
  | { type: 'table'; key: string; cols: string[] }
  | { type: 'if'; key: string; inner: string }
  | { type: 'switch'; key: string; body: string };

const PATTERNS: { type: Token['type']; re: RegExp }[] = [
  { type: 'hidden', re: /\{\{hidden:([^}:]+):([^}]*)\}\}/ },
  { type: 'variable', re: /\{\{variable:([^}:]+):([^}]*)\}\}/ },
  { type: 'info', re: /\{\{info:([^}]*)\}\}/ },
  { type: 'switch', re: /\{\{switch:([^}]+)\}\}([\s\S]*?)\{\{\/switch\}\}/ },
  { type: 'if', re: /\{\{if:([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/ },
  { type: 'multiselect', re: /\{\{multiselect:([^}:]+):([^}]+)\}\}/ },
  { type: 'select', re: /\{\{select:([^}:]+):([^}]+)\}\}/ },
  { type: 'table', re: /\{\{table:([^}:]+):([^}]+)\}\}/ },
  { type: 'list', re: /\{\{list:([^}]+)\}\}/ },
  { type: 'textarea', re: /\{\{textarea:([^}]+)\}\}/ },
  { type: 'number', re: /\{\{number:([^}:]+):([^}:]+):([^}]+)\}\}/ },
  { type: 'text', re: /\{\{text:([^}:]+)(?::([^}]*))?\}\}/ },
];

export function tokenize(tpl: string): Token[] {
  const tokens: Token[] = [];
  let rem = tpl;
  while (rem.length > 0) {
    let earliest: RegExpExecArray | null = null;
    let eidx = Infinity;
    let epat: (typeof PATTERNS)[0] | null = null;
    for (const p of PATTERNS) {
      const m = p.re.exec(rem);
      if (m && m.index < eidx) {
        earliest = m;
        eidx = m.index;
        epat = p;
      }
    }
    if (!earliest || !epat) {
      tokens.push({ type: 'static', text: rem });
      break;
    }
    if (eidx > 0) tokens.push({ type: 'static', text: rem.slice(0, eidx) });
    const m = earliest;
    if (epat.type === 'hidden') tokens.push({ type: 'hidden', key: m[1].trim(), value: m[2] });
    else if (epat.type === 'variable') tokens.push({ type: 'variable', key: m[1].trim(), value: m[2] });
    else if (epat.type === 'info') tokens.push({ type: 'info', message: m[1].trim() });
    else if (epat.type === 'text') tokens.push({ type: 'text', key: m[1].trim(), placeholder: m[2] || '' });
    else if (epat.type === 'textarea') tokens.push({ type: 'textarea', key: m[1].trim() });
    else if (epat.type === 'number') tokens.push({ type: 'number', key: m[1].trim(), min: +m[2], max: +m[3] });
    else if (epat.type === 'select') tokens.push({ type: 'select', key: m[1].trim(), opts: m[2].split(',').map((s) => s.trim()) });
    else if (epat.type === 'multiselect') tokens.push({ type: 'multiselect', key: m[1].trim(), opts: m[2].split(',').map((s) => s.trim()) });
    else if (epat.type === 'list') tokens.push({ type: 'list', key: m[1].trim() });
    else if (epat.type === 'table') tokens.push({ type: 'table', key: m[1].trim(), cols: m[2].split(',').map((s) => s.trim()) });
    else if (epat.type === 'if') tokens.push({ type: 'if', key: m[1].trim(), inner: m[2] });
    else if (epat.type === 'switch') tokens.push({ type: 'switch', key: m[1].trim(), body: m[2] });
    rem = rem.slice(eidx + m[0].length);
  }
  return tokens;
}

function getVal(values: PromptValues, type: string, key: string): unknown {
  return values[`${type}:${key}`];
}

export function resolvePromptTemplate(template: string, promptValues: PromptValues): string {
  let out = template;
  out = out.replace(/\{\{hidden:([^}:]+):([^}]*)\}\}/g, (_, _k, v) => v ?? '');
  out = out.replace(/\{\{variable:([^}:]+):([^}]*)\}\}/g, (_, _k, v) => v ?? '');
  out = out.replace(/\{\{info:([^}]*)\}\}/g, () => '');
  out = out.replace(/\{\{text:([^}:]+)(?::([^}]*))?\}\}/g, (_, k) => (typeof getVal(promptValues, 'text', k.trim()) === 'string' ? getVal(promptValues, 'text', k.trim()) : '') || `[${k.trim()}]`);
  out = out.replace(/\{\{textarea:([^}]+)\}\}/g, (_, k) => (typeof getVal(promptValues, 'textarea', k.trim()) === 'string' ? getVal(promptValues, 'textarea', k.trim()) : '') || `[${k.trim()}]`);
  out = out.replace(/\{\{number:([^}:]+):[^}:]+:[^}]+\}\}/g, (_, k) => {
    const v = getVal(promptValues, 'number', k.trim());
    return (v !== undefined && v !== null ? String(v) : '') || `[${k.trim()}]`;
  });
  out = out.replace(/\{\{select:([^}:]+):[^}]+\}\}/g, (_, k) => (typeof getVal(promptValues, 'select', k.trim()) === 'string' ? getVal(promptValues, 'select', k.trim()) : '') || `[${k.trim()}]`);
  out = out.replace(/\{\{multiselect:([^}:]+):[^}]+\}\}/g, (_, k) => {
    const v = getVal(promptValues, 'multiselect', k.trim());
    const arr = Array.isArray(v) ? v : [];
    return arr.length ? arr.join(', ') : `[${k.trim()}]`;
  });
  out = out.replace(/\{\{list:([^}]+)\}\}/g, (_, k) => {
    const v = getVal(promptValues, 'list', k.trim());
    const items = Array.isArray(v) ? v.filter((i): i is string => typeof i === 'string') : [];
    return items.length ? items.map((i) => '- ' + i).join('\n') : `[${k.trim()}]`;
  });
  out = out.replace(/\{\{table:([^}:]+):([^}]+)\}\}/g, (_, k, colsRaw) => {
    const cols = colsRaw.split(',').map((s: string) => s.trim());
    const v = getVal(promptValues, 'table', k.trim());
    const rows = Array.isArray(v) ? (v as string[][]) : [];
    if (!Array.isArray(rows) || rows.length === 0) return `[${k.trim()}]`;
    const cw = cols.map((c: string, ci: number) => Math.max(c.length, ...rows.map((r: string[]) => (r[ci] ?? '').length)) + 2);
    const hdr = cols.map((c: string, i: number) => c.padEnd(cw[i])).join('| ');
    const sep = cw.map((w: number) => '-'.repeat(w)).join('|-');
    const rws = rows.map((row: string[]) => row.map((cell: string, i: number) => (cell ?? '').padEnd(cw[i])).join('| ')).join('\n');
    return `${hdr}\n${sep}\n${rws}`;
  });
  out = out.replace(/\{\{switch:([^}]+)\}\}([\s\S]*?)\{\{\/switch\}\}/g, (_, k, body) => {
    const val = getVal(promptValues, 'select', k.trim());
    const sel = typeof val === 'string' ? val : '';
    const cr = /\{\{case:([^}]+)\}\}([\s\S]*?)\{\{\/case\}\}/g;
    let mm: RegExpExecArray | null;
    while ((mm = cr.exec(body)) !== null) {
      if (mm[1].trim() === sel) return mm[2].trim();
    }
    return '';
  });
  out = out.replace(/\{\{if:([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, inner) => (getVal(promptValues, 'if', k.trim()) === true ? inner : ''));
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function stateKey(type: string, key: string): string {
  return `${type}:${key}`;
}
