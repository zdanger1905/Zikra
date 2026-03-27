import json, os

for s in ["1", "2", "18", "36", "114"]:
    path = fr"C:\Users\zaydi\muslim-hub\public\footnotes\{s}.json"
    if not os.path.exists(path):
        print(f"Surah {s}: MISSING")
        continue
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    v = len(d["verses"])
    t = len(d["texts"])
    items = list(d["texts"].items())
    if items:
        k, meta = items[0]
        print(f"Surah {s}: {v} verses, {t} fns")
        print(f"  FN {k}: attaches_after={repr(meta.get('attaches_after',''))}")
        print(f"  text: {meta.get('text','')[:80]}")
    else:
        print(f"Surah {s}: {v} verses, {t} fns (no texts)")
    print()
