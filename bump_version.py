import os

target_version = "v3.5.5"
new_version = "v3.5.6"
target_date = "2026-03-22"
new_date = "2026-03-23"

count = 0
for root, dirs, files in os.walk('.'):
    if '.git' in root: continue
    for file in files:
        if file.endswith(('.js', '.html', '.css', '.json', '.webmanifest')):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                if target_version in content:
                    content = content.replace(target_version, new_version)
                    if target_date != new_date:
                        content = content.replace(target_date, new_date)
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    count += 1
            except Exception as e:
                pass

print(f"Updated {count} files to {new_version}")
