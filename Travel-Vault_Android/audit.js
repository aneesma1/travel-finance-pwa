const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('android')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.js') || file.endsWith('.html')) {
        results.push(file);
      }
    }
  });
  return results;
}

const apps = ['Travel_app/src', 'Personal_vault/src'];
let hasError = false;

apps.forEach(app => {
  const files = walk(app);
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    
    // Normal imports
    const regex = /import\s+(?:\{[^}]+\}\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const importPath = match[1];
      const dir = path.dirname(file);
      const resolvedPath = path.resolve(dir, importPath);
      if (!fs.existsSync(resolvedPath)) {
        console.error('ERROR: Missing static import in ' + file + ' -> ' + importPath);
        hasError = true;
      }
    }
    
    // Dynamic imports
    const dynRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynRegex.exec(content)) !== null) {
      const importPath = match[1];
      const dir = path.dirname(file);
      const resolvedPath = path.resolve(dir, importPath);
      if (!fs.existsSync(resolvedPath)) {
        console.error('ERROR: Missing dynamic import in ' + file + ' -> ' + importPath);
        hasError = true;
      }
    }
  });
});

if (!hasError) {
  console.log('All imports resolve correctly.');
} else {
  process.exit(1);
}
