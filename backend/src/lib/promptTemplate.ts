/**
 * Resolve a prompt template string with prompt_values (keys like "text:name", "select:secteur", etc.).
 * Port of the HTML updateOutput() logic. Used at workflow execution time to build the prompt sent to the agent API.
 */
export type PromptValues = Record<string, string | string[] | string[][] | boolean | undefined>;

function getVal(values: PromptValues, type: string, key: string): unknown {
  const k = `${type}:${key}`;
  return values[k];
}

export function resolvePromptTemplate(template: string, promptValues: PromptValues): string {
  let out = template;

  // hidden: use value as-is (from template)
  out = out.replace(/\{\{hidden:([^}:]+):([^}]*)\}\}/g, (_, _k, v) => v ?? '');

  // variable: use value as-is (from template)
  out = out.replace(/\{\{variable:([^}:]+):([^}]*)\}\}/g, (_, _k, v) => v ?? '');

  // info: editor-only hint, not included in generated prompt
  out = out.replace(/\{\{info:([^}]*)\}\}/g, () => '');

  // text
  out = out.replace(/\{\{text:([^}:]+)(?::([^}]*))?\}\}/g, (_, k) => {
    const v = getVal(promptValues, 'text', k.trim());
    return (typeof v === 'string' ? v : '') || `[${k.trim()}]`;
  });

  // textarea
  out = out.replace(/\{\{textarea:([^}]+)\}\}/g, (_, k) => {
    const v = getVal(promptValues, 'textarea', k.trim());
    return (typeof v === 'string' ? v : '') || `[${k.trim()}]`;
  });

  // number
  out = out.replace(/\{\{number:([^}:]+):[^}:]+:[^}]+\}\}/g, (_, k) => {
    const v = getVal(promptValues, 'number', k.trim());
    return (v !== undefined && v !== null ? String(v) : '') || `[${k.trim()}]`;
  });

  // select
  out = out.replace(/\{\{select:([^}:]+):[^}]+\}\}/g, (_, k) => {
    const v = getVal(promptValues, 'select', k.trim());
    return (typeof v === 'string' ? v : '') || `[${k.trim()}]`;
  });

  // multiselect
  out = out.replace(/\{\{multiselect:([^}:]+):[^}]+\}\}/g, (_, k) => {
    const v = getVal(promptValues, 'multiselect', k.trim());
    const arr = Array.isArray(v) ? v : [];
    return arr.length ? arr.join(', ') : `[${k.trim()}]`;
  });

  // list
  out = out.replace(/\{\{list:([^}]+)\}\}/g, (_, k) => {
    const v = getVal(promptValues, 'list', k.trim());
    const items = Array.isArray(v) ? v.filter((i): i is string => typeof i === 'string') : [];
    return items.length ? items.map((i) => '- ' + i).join('\n') : `[${k.trim()}]`;
  });

  // table
  out = out.replace(/\{\{table:([^}:]+):([^}]+)\}\}/g, (_: string, k: string, colsRaw: string) => {
    const cols = colsRaw.split(',').map((s: string) => s.trim());
    const v = getVal(promptValues, 'table', k.trim());
    const rows = Array.isArray(v) ? (v as string[][]) : [];
    if (!Array.isArray(rows) || rows.length === 0) return `[${k.trim()}]`;
    const cw = cols.map((c: string, ci: number) => Math.max(c.length, ...rows.map((r: string[]) => (r[ci] ?? '').length)) + 2);
    const hdr = cols.map((c: string, i: number) => c.padEnd(cw[i])).join('| ');
    const sep = cw.map((w: number) => '-'.repeat(w)).join('|-');
    const rws = rows
      .map((row: string[]) => row.map((cell: string, i: number) => (cell ?? '').padEnd(cw[i])).join('| '))
      .join('\n');
    return `${hdr}\n${sep}\n${rws}`;
  });

  // switch
  out = out.replace(/\{\{switch:([^}]+)\}\}([\s\S]*?)\{\{\/switch\}\}/g, (_, k, body) => {
    const val = getVal(promptValues, 'select', k.trim());
    const sel = typeof val === 'string' ? val : '';
    const cr = /\{\{case:([^}]+)\}\}([\s\S]*?)\{\{\/case\}\}/g;
    let m;
    while ((m = cr.exec(body)) !== null) {
      if (m[1].trim() === sel) return m[2].trim();
    }
    return '';
  });

  // if
  out = out.replace(/\{\{if:([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, inner) => {
    const v = getVal(promptValues, 'if', k.trim());
    return v === true ? inner : '';
  });

  return out.replace(/\n{3,}/g, '\n\n').trim();
}
