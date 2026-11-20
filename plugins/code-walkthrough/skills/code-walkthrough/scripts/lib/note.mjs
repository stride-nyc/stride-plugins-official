import { OUTCOME, EMBED_HEIGHT, OPEN_LINK } from './settings.mjs';
import { builtLine, reasonCounts, outlineTail } from './words.mjs';

const q = JSON.stringify;
const list = (key, items) => (items.length ? [`${key}:`, ...items.map(i => `  - ${i}`)] : []);
const plainKey = k => (/^[A-Za-z0-9._-]+$/.test(k) ? k : q(String(k)));

export function noteText(data, names, { outcome = OUTCOME, embedHeight = EMBED_HEIGHT, openLink = OPEN_LINK } = {}) {
  const repos = data.repos || [], stops = data.stops || [];
  const multi = repos.length > 1;
  const dirty = repos.flatMap(r => (r.uncommitted || []).map(f => (multi ? `${r.name}: ${f}` : f)));
  const { recorded, notRecorded } = reasonCounts(data);
  const front = [
    '---',
    'type: code-walkthrough',
    `client: ${data.client}`,
    `created: ${data.built}`,
    ...list('repos', repos.map(r => q(`[[${r.name}]]`))),
    ...list('commits', repos.map(r => q(`${r.name}@${r.commit}`))),
    ...list('uncommitted', repos.flatMap(r => (r.uncommitted || []).map(f => q(`${r.name}: ${f}`)))),
    `journey: ${q(data.journey)}`,
    `stops: ${stops.length}`,
    `reasons_recorded: ${recorded}`,
    `reasons_not_recorded: ${notRecorded}`,
    ...list('jira', (data.jira || []).map(plainKey)),
    '---',
  ];
  const builtText = `${builtLine(data)}${dirty.length ? ` (${dirty.map(f => `\`${f}\``).join(', ')})` : ''}. The code may have changed since.`;
  const embed = `![[${names.page}|height: ${embedHeight}px]]`;
  const body = ['', `# ${data.journey}`, ''];
  if (outcome === 2) {
    body.push(openLink === 'button'
      ? 'Use the "open in external browser" button on the page below to read this walkthrough.'
      : `Open [[${names.page}]] in your browser to read this walkthrough.`, '');
  }
  body.push(data.summary, '', builtText, '', embed, '');
  body.push(`Not showing, or too small? Open [[${names.page}]], or use the "open in external browser" button on the page above.`, '');
  if (names.earlier) body.push(`Earlier walkthrough of this journey: [[${names.earlier}]].`, '');
  body.push('## Stops', '');
  stops.forEach((s, i) => {
    const code = s.code || [];
    const first = code.length ? `\`${code[0].file}:${code[0].lines[0]}-${code[0].lines[1]}\`${code.length > 1 ? ` (+${code.length - 1} more)` : ''}` : '';
    body.push(`${i + 1}. **${s.name}** · ${first ? `${first} · ` : ''}${s.summary} ${outlineTail(s)}`);
  });
  const nameOf = new Map(stops.map((s, i) => [s.id, i + 1]));
  if ((data.extend || []).length) {
    body.push('', '## Where to extend', '');
    for (const e of data.extend) body.push(`- \`${e.file}:${e.lines[0]}-${e.lines[1]}\` (stop ${nameOf.get(e.stop)}): ${e.text}`);
  }
  return [...front, ...body, ''].join('\n');
}
