#!/usr/bin/env node
/**
 * Export PRTF data from prtf.html to machine-readable files.
 *   node scripts/export_json.js prtf.html
 * Writes data/prtf.json and data/techniques.csv. The HTML is the source of
 * truth; these files are generated from it so the two never drift apart.
 */
const fs = require('fs'), path = require('path'), os = require('os');
const src = process.argv[2] || 'prtf.html';
const html = fs.readFileSync(src, 'utf8');

function extractBlock(source, name, open, close) {
  const marker = `const ${name} = ${open}`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find "${marker}"`);
  let depth = 0;
  for (let i = start + marker.length - 1; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unbalanced block "${name}"`);
}
const code = ['const GH = "https://github.com/placeholder";',
  extractBlock(html, 'T', '{', '}') + ';',
  extractBlock(html, 'tactics', '[', ']') + ';',
  extractBlock(html, 'meta', '{', '}') + ';',
  'module.exports = { tactics, meta };'].join('\n');
const tmp = path.join(os.tmpdir(), `prtf_export_${Date.now()}.js`);
fs.writeFileSync(tmp, code);
let tactics, meta;
try { ({ tactics, meta } = require(tmp)); } finally { fs.unlinkSync(tmp); }

const version = (html.match(/class="intro-beta">v?([\d.]+[^<]*)</) || [])[1] || 'unknown';
const updated = (html.match(/class="intro-date">Updated ([^<]+)</) || [])[1] || null;
const level = ['', 'low', 'medium', 'high'];
const BASE = 'https://redteam.vip/prtf/#';

const out = {
  name: 'PRTF — Physical Red Team Framework',
  version, updated,
  url: 'https://redteam.vip/prtf/',
  license: 'CC-BY-4.0',
  attribution: 'PRTF — Physical Red Team Framework, RedTeam.vip (https://redteam.vip/prtf/)',
  id_policy: 'Technique IDs are permanent and never reused.',
  tactics: tactics.map(tac => ({
    id: tac.id, name: tac.name, description: tac.desc || null,
    techniques: tac.sections.flatMap(sec => sec.techniques.map(t => {
      const m = meta[t.id] || {};
      return {
        id: t.id, name: t.name, tactic: tac.id,
        section: sec.label || null,
        url: BASE + t.id,
        description: t.desc,
        difficulty: level[m.d] || null,
        detection_risk: level[m.r] || null,
        prerequisites: m.p || [],
        tools: (t.tools || []).map(x => x.u ? { name: x.n, url: x.u } : { name: x.n }),
        chains_into: (t.chains || []).map(c => c.id),
        references: (t.refs || []).map(r => ({ title: r.t, author: r.a, url: r.u || null })),
        blue_team: t.blue ? {
          detection: t.blue.det || null,
          countermeasures: t.blue.cm || null,
          references: (t.blue.refs || []).map(r => ({ title: r.t, author: r.a, url: r.u || null })),
        } : null,
      };
    })),
  })),
};
const total = out.tactics.reduce((a, t) => a + t.techniques.length, 0);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/prtf.json', JSON.stringify(out, null, 2) + '\n');
const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const rows = [['id', 'tactic_id', 'tactic', 'name', 'difficulty', 'detection_risk', 'url'].join(',')];
out.tactics.forEach(tac => tac.techniques.forEach(t =>
  rows.push([t.id, tac.id, tac.name, t.name, t.difficulty, t.detection_risk, t.url].map(q).join(','))));
fs.writeFileSync('data/techniques.csv', rows.join('\n') + '\n');
console.log(`Exported PRTF v${version}: ${out.tactics.length} tactics, ${total} techniques`);
