import pdfplumber

with pdfplumber.open(r"C:\Users\zaydi\Downloads\quran_asad.pdf") as pdf:
    # Page 25 (index 24)
    page = pdf.pages[24]
    chars = page.chars
    print(f"Total chars on page 25: {len(chars)}")
    print("\nFirst 60 chars:")
    for c in chars[:60]:
        print(f"  size={c['size']:.1f} top={c['top']:.1f} x0={c['x0']:.1f} text={repr(c['text'])}")

    print("\n\nChars with size <= 6 (potential superscripts):")
    for c in chars:
        if c['size'] <= 6 and c['text'].strip():
            print(f"  size={c['size']:.1f} top={c['top']:.1f} x0={c['x0']:.1f} text={repr(c['text'])}")

    print("\n\nAll distinct sizes on this page:")
    sizes = sorted(set(round(c['size'], 1) for c in chars if c['text'].strip()))
    print(sizes)
