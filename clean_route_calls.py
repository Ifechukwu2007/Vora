from pathlib import Path
import re

patterns = [
    (re.compile(r"LoadingSpinner\.navigateTo\('([^']+)\.html\?([^']*)'\)"), lambda m: f"LoadingSpinner.navigateTo('{m.group(1)}.html?{m.group(2)}')"),
]

def strip_html_ext(value: str) -> str:
    return value.replace('.html', '')


def normalize_target(value: str) -> str:
    value = strip_html_ext(value)
    return value if value.startswith('/Vorabukeen/') else '/Vorabukeen/' + value


pattern1 = re.compile(r"LoadingSpinner\.navigateTo\((['\"])([^'\"]+)\1\)")
pattern2 = re.compile(r"window\.location\.href\s*=\s*(['\"])([^'\"]+)\1")

changed = []
for path in Path('.').glob('*.js'):
    text = path.read_text(encoding='utf-8')
    new_text = pattern1.sub(lambda m: f"LoadingSpinner.navigateTo({m.group(1)}{strip_html_ext(m.group(2))}{m.group(1)})", text)
    new_text = pattern2.sub(lambda m: f"window.location.href = {m.group(1)}{normalize_target(m.group(2))}{m.group(1)}", new_text)
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        changed.append(str(path))

print('UPDATED_FILES=' + str(len(changed)))
for item in changed:
    print(item)
