#!/bin/bash
# ====================================================================
# FarmSense bundler
# Concatenates css/styles.css + js/*.js into a single farmsense.html
# Run: bash build.sh
# Output: ../farmsense.html  (one file you can double-click or share)
# ====================================================================
set -e
cd "$(dirname "$0")"

python3 <<'PY'
import re, base64
from pathlib import Path

here = Path(__file__).parent if "__file__" in dir() else Path(".")
root = Path(".")

html = (root / "index.html").read_text(encoding="utf-8")
css  = (root / "css" / "styles.css").read_text(encoding="utf-8")

# Embed the logo as a base64 data URI so the bundle stays self-contained.
logo_b64 = base64.b64encode((root / "assets" / "logo.png").read_bytes()).decode("ascii")
html = html.replace('src="assets/logo.png"', f'src="data:image/png;base64,{logo_b64}"')

js_files = [
    "js/constants.js",
    "js/state.js",
    "js/ui-helpers.js",
    "js/analyzers.js",
    "js/analyzers-alerts.js",
    "js/schema-map.js",
    "js/history.js",
    "js/parser.js",
    "js/render.js",
    "js/render-health.js",
    "js/render-alerts.js",
    "js/render-analysis.js",
    "js/render-history.js",
    "js/sync-sheets.js",
    "js/exports.js",
    "js/main.js",
]
js_blob = "\n".join(
    f"// ===== {f} =====\n" + (root / f).read_text(encoding="utf-8")
    for f in js_files
)

# Inline the stylesheet link — accept any ?v=... cache-bust suffix.
import re as _re
html = _re.sub(
    r'<link rel="stylesheet" href="css/styles\.css(?:\?[^"]*)?">',
    lambda m: f"<style>\n{css}\n</style>",
    html,
)

# Replace the entire app-scripts block (8 <script src=...> lines + the comment marker)
# with one inline <script>
scripts_pattern = re.compile(
    r'<!-- ====== Application scripts \(load order matters\) ====== -->'
    r'(?:\s*<script src="js/[^"]+"></script>)+',
    re.MULTILINE,
)
inline_script = f"<script>\n{js_blob}\n</script>"
html, n = scripts_pattern.subn(lambda m: inline_script, html)
assert n == 1, f"Expected 1 script-block match, got {n}"

# Write the bundle to two places:
#   ../farmsense.html  — the familiar "double-click to open" file
#   ../index.html      — repo-root entry point so GitHub Pages serves the app
for name in ("../farmsense.html", "../index.html"):
    Path(name).write_text(html, encoding="utf-8")
size = Path("../index.html").stat().st_size
print(f"✓ Bundled: farmsense.html + index.html ({size:,} bytes)")
PY
