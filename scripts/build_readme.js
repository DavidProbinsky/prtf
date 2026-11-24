#!/usr/bin/env node
// Rebuilds the matrix table in README.md (between the MATRIX markers) from data/prtf.json.
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('data/prtf.json', 'utf8'));
const cols = d.tactics;
const rows = Math.max(...cols.map(t => t.techniques.length));
const esc = s => s.replace(/\|/g, '\\|');
let t = '| ' + cols.map(c => `**${c.id}**<br>${esc(c.name)}`).join(' | ') + ' |\n';
t += '|' + cols.map(() => '---').join('|') + '|\n';
for (let i = 0; i < rows; i++) {
  t += '| ' + cols.map(c => {
    const x = c.techniques[i];
    return x ? `[${x.id}](${x.url})<br>${esc(x.name)}` : '';
  }).join(' | ') + ' |\n';
}
const total = cols.reduce((a, c) => a + c.techniques.length, 0);
const tacList = cols.map(c => `- **${c.id} ${c.name}** (${c.techniques.length}): ${c.description || ''}`).join('\n');
const block = `<!-- MATRIX:START -->\n_PRTF v${d.version} · ${total} techniques across ${cols.length} tactics · generated from data/prtf.json_\n\n### Tactics\n\n${tacList}\n\n### Techniques\n\n${t}<!-- MATRIX:END -->`;
const readme = fs.readFileSync('README.md', 'utf8');
const next = readme.replace(/<!-- MATRIX:START -->[\s\S]*<!-- MATRIX:END -->/, block);
fs.writeFileSync('README.md', next);
console.log(`README matrix rebuilt: ${total} techniques`);
