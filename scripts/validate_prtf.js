#!/usr/bin/env node
/**
 * PRTF integrity validator
 * -------------------------
 * Checks prtf.html for data-integrity problems in the technique "chains" data:
 *   1. A chain entry whose id doesn't exist in the matrix at all.
 *   2. A chain entry whose id exists, but whose displayed name doesn't match
 *      the technique actually stored at that id (the bug class this tool was
 *      built to catch — the pill shows one technique but navigates to another).
 *   3. A technique that lists itself as something it "chains into".
 *   4. Duplicate chain entries within the same technique's chains array.
 *   5. A technique with no entry in the `meta` ratings table (silently falls
 *      back to default difficulty/detection-risk ratings).
 *   6. A prerequisite string ("PRTF-X.YY — Label") whose id exists but whose
 *      label doesn't match the technique actually at that id — the same class
 *      of drift as #2, just in the `meta` prerequisites instead of `chains`.
 *      Labels may be abbreviated (e.g. "OSINT" for "Open Source Intelligence
 *      (OSINT)") — this only flags it when the label shares no words with the
 *      real name, to avoid false positives on legitimate abbreviations.
 *
 * Usage:
 *   node validate_prtf.js path/to/prtf.html
 *
 * Exit code is 0 if clean, 1 if any issues were found.
 *
 * How it works: technique ids (PRTF-X.YY) are NOT stored on each technique —
 * they're derived at runtime from array position (tactic index + position
 * within the tactic, across all sections). That means every time a technique
 * is added, removed, or reordered, every hand-typed {id, name} chain reference
 * elsewhere in the file can silently go stale. Run this after any edit to the
 * tactics data, before publishing.
 */

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node validate_prtf.js path/to/prtf.html');
  process.exit(2);
}

const html = fs.readFileSync(filePath, 'utf8');

// --- Extract a `const NAME = <value>` block by balanced bracket/brace matching,
// so this keeps working even as line numbers shift with future edits. ---
function extractBlock(source, constName, openChar, closeChar) {
  const marker = `const ${constName} = ${openChar}`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find "${marker}" in file`);
  const bodyStart = start + marker.length - 1; // include the opening char
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    const c = source[i];
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1); // "const NAME = { ... }"
      }
    }
  }
  throw new Error(`Unbalanced ${openChar}${closeChar} while extracting "${constName}"`);
}

const ghBlock = 'const GH = ' + JSON.stringify('https://github.com/placeholder') + ';';
const tBlock = extractBlock(html, 'T', '{', '}') + ';';
const tacticsBlock = extractBlock(html, 'tactics', '[', ']') + ';';
const metaBlock = extractBlock(html, 'meta', '{', '}') + ';';

const sandboxCode = `
${ghBlock}
${tBlock}
${tacticsBlock}
${metaBlock}
module.exports = { tactics, meta };
`;

const tmpModulePath = path.join(require('os').tmpdir(), `prtf_validate_${Date.now()}.js`);
fs.writeFileSync(tmpModulePath, sandboxCode);
let tactics, meta;
try {
  ({ tactics, meta } = require(tmpModulePath));
} finally {
  fs.unlinkSync(tmpModulePath);
}

// --- Build the same id index the app builds at runtime ---
// v1.0+: ids are stored on each technique (tech.id) and are permanent.
const techIndex = {};
const idProblems = [];
tactics.forEach(tac => {
  tac.sections.forEach((sec, si) => {
    sec.techniques.forEach((tech, ti) => {
      let off = 0;
      for (let s = 0; s < si; s++) off += tac.sections[s].techniques.length;
      const id = tech.id || `${tac.id}.${String(off + ti + 1).padStart(2, '0')}`;
      if (!tech.id) idProblems.push(`${id} "${tech.name}" has no fixed id`);
      else if (!tech.id.startsWith(tac.id + '.')) idProblems.push(`${tech.id} "${tech.name}" is under ${tac.id} but its id says otherwise`);
      if (techIndex[id]) idProblems.push(`${id} is used twice ("${techIndex[id].name}" and "${tech.name}")`);
      techIndex[id] = { tacId: tac.id, tacName: tac.name, name: tech.name };
    });
  });
});

const totalTechs = Object.keys(techIndex).length;

// --- Run checks ---
const missingIds = [];
const nameMismatches = [];
const selfRefs = [];
const dupChains = [];
const missingMeta = [];
const prereqMismatches = [];

const STOPWORDS = new Set(['and','the','of','or','with','for','via','from','into','on','in','a','an']);
function wordSet(s){
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS.has(w))
  );
}
function sharesAWord(a, b){
  const wa = wordSet(a), wb = wordSet(b);
  for (const w of wa) if (wb.has(w)) return true;
  return false;
}

tactics.forEach(tac => {
  tac.sections.forEach((sec, si) => {
    sec.techniques.forEach((tech, ti) => {
      let off = 0;
      for (let s = 0; s < si; s++) off += tac.sections[s].techniques.length;
      const myId = tech.id || `${tac.id}.${String(off + ti + 1).padStart(2, '0')}`;

      if (!meta[myId]) missingMeta.push({ id: myId, name: tech.name });

      (meta[myId]?.p || []).forEach(prereqStr => {
        // A prereq entry looks like "PRTF-5.06 — LF RFID Cloning" or
        // "PRTF-5.06 — LF RFID Cloning or PRTF-3.11 — Lishi"
        prereqStr.split(/\s+or\s+/i).forEach(chunk => {
          const m = chunk.trim().match(/^(PRTF-\d+\.\d+)\s*—\s*(.+)$/);
          if (!m) return;
          const [, refId, label] = m;
          if (!techIndex[refId]) {
            missingIds.push({ from: myId, fromName: tech.name, refId, refName: label, source: 'prerequisite' });
            return;
          }
          const actualName = techIndex[refId].name;
          if (!sharesAWord(label, actualName)) {
            prereqMismatches.push({ from: myId, fromName: tech.name, refId, label, actualName });
          }
        });
      });

      const seen = new Set();
      (tech.chains || []).forEach(ch => {
        if (!techIndex[ch.id]) {
          missingIds.push({ from: myId, fromName: tech.name, refId: ch.id, refName: ch.name });
          return;
        }
        if (techIndex[ch.id].name !== ch.name) {
          nameMismatches.push({
            from: myId, fromName: tech.name,
            refId: ch.id, refNameGiven: ch.name,
            actualName: techIndex[ch.id].name
          });
        }
        if (ch.id === myId) selfRefs.push({ id: myId, name: tech.name });
        const key = ch.id + '|' + ch.name;
        if (seen.has(key)) dupChains.push({ id: myId, name: tech.name, dup: ch });
        seen.add(key);
      });
    });
  });
});

// --- Report ---
function section(title, items, fmt) {
  console.log(`\n=== ${title}: ${items.length} ===`);
  items.forEach(it => console.log('  ' + fmt(it)));
}

console.log(`PRTF validator — ${filePath}`);
console.log(`Total techniques indexed: ${totalTechs} across ${tactics.length} tactics`);

section('Chain references pointing to a non-existent id', missingIds,
  m => `${m.from} "${m.fromName}" -> {id:"${m.refId}", name:"${m.refName}"} — no technique has this id`);

section('Chain id/name mismatches (pill will show the wrong technique)', nameMismatches,
  m => `${m.from} "${m.fromName}" -> shows "${m.refNameGiven}" but PRTF-${m.refId.replace('PRTF-','')} is actually "${m.actualName}"`);

section('Self-referencing chains', selfRefs,
  s => `${s.id} "${s.name}" lists itself as something it chains into`);

section('Duplicate chain entries within one technique', dupChains,
  d => `${d.id} "${d.name}" repeats {id:"${d.dup.id}", name:"${d.dup.name}"}`);

section('Techniques with no meta/ratings entry (falls back to default d:2,r:2)', missingMeta,
  m => `${m.id} "${m.name}"`);

section('Prerequisite id/label mismatches (label shares no words with the real technique)', prereqMismatches,
  m => `${m.from} "${m.fromName}" -> prereq says "${m.refId} — ${m.label}" but ${m.refId} is actually "${m.actualName}"`);

section('Fixed id problems (missing, wrong tactic, or reused)', idProblems, m => m);

const totalIssues = idProblems.length + missingIds.length + nameMismatches.length + selfRefs.length + dupChains.length + missingMeta.length + prereqMismatches.length;
console.log(`\n${totalIssues === 0 ? '✓ Clean — no issues found.' : `✗ ${totalIssues} issue(s) found.`}`);
process.exit(totalIssues === 0 ? 0 : 1);
