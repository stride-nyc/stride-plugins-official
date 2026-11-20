import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function slugOf(shortName) {
  const s = String(shortName).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || `walkthrough-${createHash('sha1').update(String(shortName)).digest('hex').slice(0, 6)}`;
}

export function noteBaseOf(shortName) {
  return `Walkthrough - ${String(shortName).replace(/[*"\\/<>:|?#^\[\]]/g, ' ').replace(/ +/g, ' ').trim()}`;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const namesFor = (slug, noteBase, date, n) => {
  const tail = n > 1 ? `-${n}` : '', paren = n > 1 ? ` (${n})` : '';
  return { page: `${slug}-${date}${tail}.html`, data: `${slug}-${date}${tail}.walkthrough.json`, note: `${noteBase} ${date}${paren}.md` };
};
const baseNames = (slug, noteBase) => ({ page: `${slug}.html`, data: `${slug}.walkthrough.json`, note: `${noteBase}.md` });

// The notes of this journey already in the folder: the base note (dated by its `created`) and
// the dated ones (dated by their names), oldest first.
function existingNotes(folderPath, slug, noteBase) {
  let files = [];
  try { files = fs.readdirSync(folderPath); } catch { return []; }
  const dated = new RegExp(`^${escapeRe(noteBase)} (\\d{4}-\\d{2}-\\d{2})(?: \\((\\d+)\\))?\\.md$`);
  const found = [];
  for (const f of files) {
    if (f === `${noteBase}.md`) {
      let text = '';
      try { text = fs.readFileSync(path.join(folderPath, f), 'utf8'); } catch {}
      const created = text.match(/^created:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1] ?? '0000-00-00';
      found.push({ date: created, seq: 0, names: baseNames(slug, noteBase) });
      continue;
    }
    const m = f.match(dated);
    if (m) found.push({ date: m[1], seq: m[2] ? Number(m[2]) : 1, names: namesFor(slug, noteBase, m[1], m[2] ? Number(m[2]) : 1) });
  }
  return found.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
}

const noteOf = e => e.names.note.replace(/\.md$/, '');

export function chooseNames({ folderPath, slug, noteBase, date, sameDay }) {
  const notes = existingNotes(folderPath, slug, noteBase);
  const taken = names => Object.values(names).some(n => fs.existsSync(path.join(folderPath, n)));
  const firstFreeToday = () => { for (let n = 1; ; n++) { const c = namesFor(slug, noteBase, date, n); if (!taken(c)) return c; } };
  const latest = notes.at(-1);
  if (!latest) {
    const names = baseNames(slug, noteBase);
    return { ...(taken(names) ? firstFreeToday() : names), earlier: null, replace: false };
  }
  if (latest.date !== date) return { ...firstFreeToday(), earlier: noteOf(latest), replace: false };
  if (sameDay === 'keep') return { ...firstFreeToday(), earlier: noteOf(latest), replace: false };
  if (sameDay === 'replace') {
    const before = notes.slice(0, -1).at(-1);
    return { ...latest.names, earlier: before ? noteOf(before) : null, replace: true };
  }
  return { clash: [latest.names.page, latest.names.data, latest.names.note] };
}
