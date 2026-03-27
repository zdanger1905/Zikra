"""Debug word boundaries on page 25 around marker at x0=279.8, top=324.2"""
import pdfplumber

with pdfplumber.open(r"C:\Users\zaydi\Downloads\quran_asad.pdf") as pdf:
    page = pdf.pages[24]
    chars = page.chars

    # Find chars near the marker "11" at top~324, x0~279
    # Look at all chars in the y range 320-330
    line_chars = [c for c in chars if 318 <= c["top"] <= 330 and c["text"]]
    line_chars.sort(key=lambda c: c["x0"])

    print("All chars in y-range 318-330 on page 25:")
    for c in line_chars:
        print(f"  size={c['size']:.1f} x0={c['x0']:.1f} x1={c['x1']:.1f} text={repr(c['text'])}")

    print()
    print("Using extract_words on full page:")
    words = page.extract_words(extra_attrs=["size"])
    # Filter to words near top=324
    nearby = [w for w in words if abs(w["top"] - 324) <= 8]
    for w in nearby:
        print(f"  size={w.get('size',0):.1f} x0={w['x0']:.1f} x1={w['x1']:.1f} text={repr(w['text'])}")
