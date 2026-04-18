const fs = require('fs');
const path = require('path');

function getExports(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const exports = new Set();
  const patterns = [
    /^export\s+(?:async\s+)?function\s+(\w+)/gm,
    /^export\s+(?:const|let|var|class)\s+(\w+)/gm,
    /^export\s+\{([^}]+)\}/gm,
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(content)) !== null) {
      const raw = m[1];
      if (raw.includes(',') || raw.includes(' ')) {
        raw.split(',').map(function(s) { return s.trim().split(' ').pop(); }).filter(Boolean).forEach(function(e) { exports.add(e); });
      } else {
        exports.add(raw.trim());
      }
    }
  }
  return exports;
}

function getNamedImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = [];
  const re = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const names = m[1].split(',').map(function(s) { return s.trim().replace(/\s+as\s+\w+/, '').trim(); }).filter(Boolean);
    imports.push({ names: names, from: m[2], file: filePath });
  }
  return imports;
}

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir);
  for (let i = 0; i < items.length; i++) {
    const f = items[i];
    const full = dir + '/' + f;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'android') {
        results = results.concat(walk(full));
      }
    } else if (f.endsWith('.js') || f.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

const APPS = ['Travel_app/src', 'Personal_vault/src'];
const errors = [];

for (let a = 0; a < APPS.length; a++) {
  const app = APPS[a];
  const files = walk(app);
  
  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi];
    const imports = getNamedImports(file);
    
    for (let ii = 0; ii < imports.length; ii++) {
      const imp = imports[ii];
      if (imp.from.charAt(0) !== '.') continue;
      
      const targetPath = path.resolve(path.dirname(file), imp.from);
      let targetFile = null;
      if (fs.existsSync(targetPath)) {
        targetFile = targetPath;
      } else if (fs.existsSync(targetPath + '.js')) {
        targetFile = targetPath + '.js';
      }
      
      if (!targetFile) {
        errors.push('MISSING FILE: ' + file + ' -> ' + imp.from);
        continue;
      }
      
      const exports = getExports(targetFile);
      if (!exports) continue;
      
      for (let ni = 0; ni < imp.names.length; ni++) {
        const name = imp.names[ni];
        if (name === '*' || name === 'default') continue;
        if (!exports.has(name)) {
          errors.push('MISSING EXPORT [' + name + '] in ' + path.basename(targetFile) + ' (needed by ' + path.basename(file) + ')');
        }
      }
    }
  }
}

if (errors.length === 0) {
  console.log('ALL CLEAR: No missing exports or files found.');
} else {
  console.log('AUDIT REPORT: ' + errors.length + ' issues found:\n');
  for (let i = 0; i < errors.length; i++) {
    console.log('  [' + (i+1) + '] ' + errors[i]);
  }
}
