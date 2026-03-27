import json

with open(r"C:\Users\zaydi\muslim-hub\public\footnotes\2.json", encoding="utf-8") as f:
    data = json.load(f)

print("Surah 2 verse entries (first 8):")
for v, fns in list(data["verses"].items())[:8]:
    print(f"  verse {v}: {fns}")

print()
print("Sample footnotes:")
for num in ["11", "12", "13", "14", "15"]:
    fn = data["texts"].get(num, {})
    print(f"FN {num}:")
    print(f"  attaches_after: {repr(fn.get('attaches_after', ''))}")
    print(f"  page: {fn.get('page', '?')}")
    print(f"  surah_ayah: {fn.get('surah_ayah', '?')}")
    print(f"  text: {fn.get('text', '')[:100]}")
    print()
