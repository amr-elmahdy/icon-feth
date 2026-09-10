const fs = require('fs');
const path = require('path');

const ICONS_FILE = path.join(__dirname, 'icons.txt');
const ICONS_DIR = path.join(__dirname, 'icons');
const OUTPUT_FILE = path.join(__dirname, 'ICONS.md');

const API_BASE =
  process.env.API_BASE ||
  'https://charmly.amrelmahdy001-b28.workers.dev';

// ---------- Utilities ----------

function slugify(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

function getExistingIcons() {
  if (!fs.existsSync(ICONS_DIR)) return [];
  return fs
    .readdirSync(ICONS_DIR)
    .filter(f => f.endsWith('.svg'))
    .map(f => f.replace('.svg', ''));
}

/**
 * Parse icons.txt and return an ordered map of { category: [icons] }.
 */
function parseCategories() {
  if (!fs.existsSync(ICONS_FILE)) return {};
  
  const lines = fs.readFileSync(ICONS_FILE, 'utf8').split('\n');
  const categories = {};
  let currentCategory = 'Uncategorized';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('//')) continue;
    
    if (trimmed.startsWith('#')) {
      currentCategory = trimmed.replace(/^#+\s*/, '').trim();
      if (!categories[currentCategory]) categories[currentCategory] = [];
    } else {
      if (!categories[currentCategory]) categories[currentCategory] = [];
      categories[currentCategory].push(trimmed.toLowerCase().replace(/\s+/g, '-'));
    }
  }
  
  return categories;
}

// ---------- Table Generation ----------

function generateTable(icons) {
  const ICONS_PER_ROW = 3;
  const rows = Math.ceil(icons.length / ICONS_PER_ROW);
  const lines = [];
  
  lines.push('<table>');
  lines.push('  <tbody>');
  
  for (let row = 0; row < rows; row++) {
    lines.push('    <tr>');
    for (let col = 0; col < ICONS_PER_ROW; col++) {
      const idx = row * ICONS_PER_ROW + col;
      const icon = icons[idx];
      
      if (icon) {
        const url = `${API_BASE}/icons?i=${icon}&perline=1`;
        lines.push(`      <td align="center"><code>${icon}</code></td>`);
        lines.push(`      <td align="center"><img src="${url}" alt="${icon}" width="48" height="48"></td>`);
      } else {
        lines.push('      <td></td>');
        lines.push('      <td></td>');
      }
    }
    lines.push('    </tr>');
  }
  
  lines.push('  </tbody>');
  lines.push('</table>');
  
  return lines.join('\n');
}

// ---------- Markdown Generation ----------

function generateMarkdown() {
  const categories = parseCategories();
  const existingIcons = getExistingIcons();
  const existingSet = new Set(existingIcons);
  
  if (existingIcons.length === 0) {
    console.error('❌ No icons found in icons/');
    process.exit(1);
  }
  
  const md = [];
  
  md.push('## Available Icons');
  md.push('');
  md.push(`Total icons: **${existingIcons.length}**. Use the \`id\` shown next to each icon in your API call, e.g. \`?i=flutter,html,swift\`.`);
  md.push('');
  
  md.push('### Table of Contents');
  md.push('');
  for (const category of Object.keys(categories)) {
    const present = categories[category].filter(i => existingSet.has(i));
    if (present.length > 0) {
      md.push(`- [${category}](#${slugify(category)})`);
    }
  }
  md.push('');
  
  for (const [category, iconIds] of Object.entries(categories)) {
    const present = iconIds.filter(id => existingSet.has(id));
    if (present.length === 0) continue;
    
    md.push(`### ${category}`);
    md.push('');
    md.push(generateTable(present));
    md.push('');
  }
  
  // Any icons not in icons.txt (shouldn't normally happen)
  const categorizedSet = new Set(Object.values(categories).flat());
  const orphans = existingIcons.filter(i => !categorizedSet.has(i));
  
  if (orphans.length > 0) {
    md.push('### Uncategorized');
    md.push('');
    md.push(generateTable(orphans));
    md.push('');
  }
  
  return md.join('\n');
}

function main() {
  const markdown = generateMarkdown();
  fs.writeFileSync(OUTPUT_FILE, markdown);
  
  const categories = parseCategories();
  console.log('');
  console.log('========================================');
  console.log('  ICONS.md Generated');
  console.log('========================================');
  console.log(`  Icons:      ${getExistingIcons().length}`);
  console.log(`  Categories: ${Object.keys(categories).length}`);
  console.log('========================================');
}

main();