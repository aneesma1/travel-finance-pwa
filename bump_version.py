import os

target_versions = ["v3.5.23", "v3.5.22", "v3.5.21", "v3.5.20", "v3.5.19", "v3.5.18", "v3.5.17"]
new_version = "v3.5.24"
target_dates = ["2026-03-25", "2026-03-24", "2026-03-23"]
new_date = "2026-03-26"

count = 0
for root, dirs, files in os.walk('.'):
    if '.git' in root or '.gemini' in root or 'node_modules' in root: continue
    for file in files:
        if file.endswith(('.js', '.html', '.css', '.json', '.webmanifest')):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                changed = False
                for tv in target_versions:
                    if tv in content:
                        content = content.replace(tv, new_version)
                        changed = True
                
                for td in target_dates:
                    if td in content:
                        content = content.replace(td, new_date)
                        changed = True
                
                if changed:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    count += 1
            except Exception as e:
                print(f"Error processing {path}: {e}")

print(f"Updated {count} files to {new_version}")
