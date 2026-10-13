from pathlib import Path
p = Path(r"C:\Users\nauma\source\repos\marketing\src\app\api\events\signup\route.ts")
t = p.read_text(encoding="utf-8")
t2 = t.replace(
    'import { eq } from "drizzle-orm";',
    'import { and, eq } from "drizzle-orm";',
)
old = (
    '.where(eq(sequences.triggerEvent, "signup"))\n'
    '    .where(eq(sequences.active, true))'
)
new = '.where(and(eq(sequences.triggerEvent, "signup"), eq(sequences.active, true)))'
if old not in t2:
    old = old.replace('\n', '\r\n')
if old not in t2:
    raise SystemExit('where pattern not found')
t3 = t2.replace(old, new)
if 'and, eq' not in t3:
    raise SystemExit('import replace failed')
p.write_text(t3, encoding='utf-8', newline='\n')
print('ok')
