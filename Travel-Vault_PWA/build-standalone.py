#!/usr/bin/env python3
"""
build-standalone.py — Travel-Vault_PWA Standalone Bundler v4.2.0
=================================================================
Creates single-file HTML from ES module apps so they can be
opened by double-clicking on PC (file:// protocol, no server needed).

Usage:
    cd Travel-Vault_PWA
    python build-standalone.py

Output:
    dist/FamilyHub_Standalone.html
    dist/PrivateVault_Standalone.html

Strategy:
  - Each JS module wrapped in an IIFE to contain local variables
  - Exported names copied to window.* (globally accessible)
  - Dynamic import() replaced with Promise.resolve(window.__modReg[path])
  - CSS <link> tags replaced with inlined <style> blocks
  - CDN <script src="https://..."> tags kept as-is (need internet once, then cached)
  - CSP meta tag removed (inline scripts on file:// need relaxed policy)
  - 'use strict' kept once at top of combined script

Requirements: Python 3.6+ stdlib only. No pip installs needed.
"""

import re
import os
import sys
from pathlib import Path

# ── Configuration ─────────────────────────────────────────────────────────────

REPO_BASE = Path(__file__).parent  # Travel-Vault_PWA/

APPS = [
    {
        'name':    'FamilyHub',
        'dir':     'app-a-family-hub',
        'out':     'dist/FamilyHub_Standalone.html',
    },
    {
        'name':    'PrivateVault',
        'dir':     'app-b-private-vault',
        'out':     'dist/PrivateVault_Standalone.html',
    },
]

# ── Regex patterns ────────────────────────────────────────────────────────────

# Static import lines (all forms):
#   import { X } from './foo.js'
#   import X from './foo.js'
#   import * as X from './foo.js'
#   import './foo.js'  (side-effect)
RE_IMPORT_LINE = re.compile(
    r"""^[ \t]*import\s+(?:[^;'"]*?from\s+)?['"][^'"]+['"]\s*;?[ \t]*\r?\n?""",
    re.MULTILINE
)

# export function/async function/class/const/let/var Name
RE_EXPORT_DECL = re.compile(
    r"""\bexport\s+(async\s+function|function|class|const|let|var)\s+(\w+)"""
)

# export default function Name / export default class Name
RE_EXPORT_DEFAULT_NAMED = re.compile(
    r"""\bexport\s+default\s+(async\s+function|function|class)\s+(\w+)"""
)

# export default <anything> (bare default — after above is handled)
RE_EXPORT_DEFAULT_BARE = re.compile(
    r"""\bexport\s+default\s+"""
)

# export { X, Y as Z, ... } or export { X } from './other'
RE_EXPORT_LIST = re.compile(
    r"""\bexport\s*\{([^}]*)\}\s*(?:from\s*['"][^'"]+['"])?\s*;?"""
)

# dynamic import('...')
RE_DYNAMIC_IMPORT = re.compile(
    r"""\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)"""
)

# 'use strict'; line
RE_USE_STRICT = re.compile(r"""^[ \t]*['"]use strict['"];[ \t]*\r?\n?""", re.MULTILINE)

# <link rel="stylesheet" href="...">  (also href-first variant)
RE_CSS_LINK_REL_FIRST = re.compile(
    r"""<link\s[^>]*rel=['"]stylesheet['"][^>]*href=['"]([^'"]+)['"][^>]*/?>""",
    re.IGNORECASE
)
RE_CSS_LINK_HREF_FIRST = re.compile(
    r"""<link\s[^>]*href=['"]([^'"]+)['"][^>]*rel=['"]stylesheet['"][^>]*/?>""",
    re.IGNORECASE
)

# CSP meta tag
RE_CSP_META = re.compile(
    r"""<meta\s[^>]*http-equiv=['"]Content-Security-Policy['"][^>]*/?>""",
    re.IGNORECASE
)

# ── Path helpers ──────────────────────────────────────────────────────────────

def resolve_dep(specifier: str, from_file: Path) -> Path | None:
    """Resolve a relative import specifier. Returns None for CDN/external."""
    if not specifier.startswith('.'):
        return None
    resolved = (from_file.parent / specifier).resolve()
    # Try adding .js if no extension
    if not resolved.suffix:
        resolved = resolved.with_suffix('.js')
    return resolved


def path_key(abs_path: Path) -> str:
    """Normalised string key used in __modReg and dynamic import lookups."""
    return str(abs_path).replace('\\', '/')


# ── Module dependency graph ───────────────────────────────────────────────────

def collect_modules(file_path: Path, visited: dict, order: list):
    """
    Depth-first traversal: visit dependencies before self.
    visited: {abs_path: True}
    order:   list of abs_path in correct load order
    """
    if file_path in visited:
        return
    visited[file_path] = True

    try:
        code = file_path.read_text(encoding='utf-8')
    except (FileNotFoundError, OSError) as e:
        print(f'  [WARN] Cannot read {file_path}: {e}')
        return

    # Find all import specifiers in this file
    for m in re.finditer(r"""^[ \t]*import\s+(?:[^;'"]*?from\s+)?['"]([^'"]+)['"]""",
                         code, re.MULTILINE):
        spec = m.group(1)
        dep = resolve_dep(spec, file_path)
        if dep and dep.exists():
            collect_modules(dep, visited, order)

    order.append(file_path)


# ── Export name extraction ────────────────────────────────────────────────────

def get_export_names(code: str) -> list:
    """Return list of names exported by this module (for window.* assignment)."""
    names = []

    for m in RE_EXPORT_DECL.finditer(code):
        names.append(m.group(2))

    for m in RE_EXPORT_DEFAULT_NAMED.finditer(code):
        names.append(m.group(2))

    for m in RE_EXPORT_LIST.finditer(code):
        for item in m.group(1).split(','):
            parts = re.split(r'\s+as\s+', item.strip())
            # exported-as name is last part; skip if empty or 'default'
            name = parts[-1].strip()
            if re.match(r'^\w+$', name) and name != 'default':
                names.append(name)

    # Deduplicate preserving order
    seen = set()
    result = []
    for n in names:
        if n not in seen:
            seen.add(n)
            result.append(n)
    return result


# ── Module code processor ─────────────────────────────────────────────────────

def process_module(abs_path: Path) -> str:
    """
    Read a JS module, strip ES module syntax, wrap in IIFE,
    and register its exports on window.* and window.__modReg.
    """
    code = abs_path.read_text(encoding='utf-8')
    exported = get_export_names(code)
    rel_label = str(abs_path.relative_to(REPO_BASE)).replace('\\', '/')
    abs_key   = path_key(abs_path)

    # 1. Strip 'use strict'
    code = RE_USE_STRICT.sub('', code)

    # 2. export default function/class Name  →  function/class Name
    code = RE_EXPORT_DEFAULT_NAMED.sub(r'\1 \2', code)

    # 3. export default <anything>  →  remove keyword
    code = RE_EXPORT_DEFAULT_BARE.sub('', code)

    # 4. export function/class/const/let/var Name  →  function/class/const/let/var Name
    code = RE_EXPORT_DECL.sub(r'\1 \2', code)

    # 5. export { X, Y }  →  remove
    code = RE_EXPORT_LIST.sub('', code)

    # 6. Remove import lines (dependencies already in window.* from prior IIFEs)
    code = RE_IMPORT_LINE.sub('', code)

    # 7. Clean up excess blank lines (cosmetic)
    code = re.sub(r'\n{4,}', '\n\n', code.strip())

    # 8. Build window assignments for exported names
    win_assigns = '\n'.join(
        f"  if (typeof {n} !== 'undefined') window['{n}'] = {n};"
        for n in exported
    )

    # 9. Build module registry entry
    if exported:
        props = ', '.join(f"'{n}': window['{n}']" for n in exported)
        reg_entry = (
            f"window.__modReg['{abs_key}'] = {{ {props} }};\n"
            # Also register by relative-from-repo-root key (for dynamic imports in index.html)
            f"window.__modReg['{rel_label}'] = window.__modReg['{abs_key}'];"
        )
    else:
        reg_entry = ''

    result = f"""// ════ {rel_label} ════
(function() {{
{code}
{win_assigns}
}})();
{reg_entry}
"""
    return result


# ── Entry script processor ────────────────────────────────────────────────────

def process_entry_script(script_code: str, entry_file: Path) -> str:
    """
    Process the inline <script type="module"> from index.html:
    - Remove 'use strict'
    - Remove static import lines (all globals already on window.*)
    - Replace dynamic import('./path') with Promise.resolve(window.__modReg[key])
    """
    # Strip 'use strict'
    script_code = RE_USE_STRICT.sub('', script_code)

    # Remove static import lines
    script_code = RE_IMPORT_LINE.sub('', script_code)

    # Replace dynamic import() calls
    def replace_dyn(m):
        spec = m.group(1)
        dep  = resolve_dep(spec, entry_file)
        if dep:
            key = path_key(dep)
        else:
            key = spec  # CDN or non-relative — leave as best-effort key
        return f"Promise.resolve(window.__modReg['{key}'])"

    script_code = RE_DYNAMIC_IMPORT.sub(replace_dyn, script_code)

    return script_code.strip()


# ── HTML inline-CSS helper ────────────────────────────────────────────────────

def make_inline_css_replacer(app_dir: Path):
    def replacer(m):
        href = m.group(1)
        if href.startswith('http') or href.startswith('//') or href.startswith('data:'):
            return m.group(0)  # external — keep
        css_path = (app_dir / href).resolve()
        try:
            css_code = css_path.read_text(encoding='utf-8')
            print(f'    CSS inlined: {css_path.relative_to(REPO_BASE)}')
            return f'<style>\n{css_code}\n</style>'
        except (FileNotFoundError, OSError):
            print(f'  [WARN] CSS not found: {css_path}')
            return m.group(0)
    return replacer


# ── Main bundler ──────────────────────────────────────────────────────────────

def bundle_app(name: str, dir_name: str, out_rel: str):
    app_dir    = REPO_BASE / dir_name
    entry_html = app_dir / 'index.html'
    out_path   = REPO_BASE / out_rel

    print(f'\n' + '-'*60)
    print(f'  Bundling: {name}')
    print(f'  Entry:    {entry_html.relative_to(REPO_BASE)}')
    print(f'  Output:   {out_rel}')
    print('-'*60)

    out_path.parent.mkdir(parents=True, exist_ok=True)

    html = entry_html.read_text(encoding='utf-8')

    # ── Find inline <script type="module"> ──────────────────────────────────
    inline_match = re.search(
        r'(<script\s+type=["\']module["\'][^>]*>)(.*?)(</script>)',
        html, re.DOTALL | re.IGNORECASE
    )
    if not inline_match:
        print(f'  [ERROR] No <script type="module"> found — skipping {name}')
        return

    open_tag   = inline_match.group(1)
    script_src = inline_match.group(2)
    close_tag  = inline_match.group(3)
    span_start = inline_match.start()
    span_end   = inline_match.end()

    # ── Collect module dependency graph ─────────────────────────────────────
    order   = []
    visited = {}

    # Seed from all import lines in the inline script
    for m in re.finditer(r"""^[ \t]*import\s+(?:[^;'"]*?from\s+)?['"]([^'"]+)['"]""",
                         script_src, re.MULTILINE):
        spec = m.group(1)
        dep  = resolve_dep(spec, entry_html)
        if dep and dep.exists():
            collect_modules(dep, visited, order)

    print(f'  Modules ({len(order)}):')
    for p in order:
        print(f'    {p.relative_to(REPO_BASE)}')

    # ── Build combined JS ────────────────────────────────────────────────────
    js_parts = [
        "// Auto-generated by build-standalone.py — do not edit\n"
        "'use strict';\n",
        "window.__modReg = {};\n",
    ]

    for mod_path in order:
        js_parts.append(process_module(mod_path))

    entry_js = process_entry_script(script_src, entry_html)
    js_parts.append(
        f'\n// ENTRY: index.html inline script\n{entry_js}\n'
    )

    combined_js = '\n'.join(js_parts)

    # ── Step 1: replace the <script type="module"> block with a placeholder
    #    (must happen BEFORE CSS inlining, which changes string positions)
    PLACEHOLDER = '<!--__BUNDLED_SCRIPT_PLACEHOLDER__-->'
    html = html[:span_start] + PLACEHOLDER + html[span_end:]

    # ── Inline CSS ───────────────────────────────────────────────────────────
    replacer = make_inline_css_replacer(app_dir)
    html = RE_CSS_LINK_REL_FIRST.sub(replacer, html)
    html = RE_CSS_LINK_HREF_FIRST.sub(replacer, html)

    # ── Remove CSP meta (blocks inline scripts under file://) ───────────────
    html = RE_CSP_META.sub(
        '<!-- CSP removed: standalone file:// mode does not support strict CSP -->',
        html
    )

    # ── Step 2: swap placeholder for bundled script tag ──────────────────────
    bundled_tag = f'<script>\n{combined_js}\n</script>'
    html = html.replace(PLACEHOLDER, bundled_tag, 1)

    # ── Read version ─────────────────────────────────────────────────────────
    try:
        version = (REPO_BASE / 'HTML_VERSION').read_text(encoding='utf-8').strip()
    except OSError:
        version = 'unknown'

    # ── Prepend banner ───────────────────────────────────────────────────────
    banner = (
        f'<!-- {name} Standalone v{version} — generated by build-standalone.py\n'
        f'     Open this file by double-clicking. No web server required.\n'
        f'     Data is stored in browser IndexedDB (local to this browser/profile).\n'
        f'-->\n'
    )
    html = banner + html

    # ── Write output ─────────────────────────────────────────────────────────
    out_path.write_text(html, encoding='utf-8')
    size_kb = out_path.stat().st_size // 1024
    print(f'\n  [OK] {out_path.relative_to(REPO_BASE)}  ({size_kb} KB)')


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    # Ensure stdout handles UTF-8 (some Windows terminals default to cp1252)
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

    print('Travel-Vault_PWA Standalone Bundler')
    print('====================================')

    for app in APPS:
        try:
            bundle_app(app['name'], app['dir'], app['out'])
        except Exception as e:
            import traceback
            print(f'\n[ERROR] {app["name"]}: {e}')
            traceback.print_exc()

    print('\n====================================')
    print('Done! Double-click dist/*.html to open.')
