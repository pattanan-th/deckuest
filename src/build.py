# Builds D:\Game\Typing\index.html from the real-time backup (fonts, base CSS, UI strings, story text) + the new game.js
import re, sys, os
SRC = r"D:\Game\Typing\index_realtime_backup.html"
OUT = sys.argv[1] if len(sys.argv) > 1 else r"D:\Game\Typing\index.html"
HERE = os.path.dirname(os.path.abspath(__file__))
old = open(SRC, encoding="utf-8").read()

def one(pattern, flags=re.S):
    m = list(re.finditer(pattern, old, flags))
    assert len(m) == 1, (pattern[:60], len(m))
    return m[0]

# 1. <head> with the embedded fonts and the old stylesheet (everything up to </style>)
head = old[:one(r"</style>").start()]
assert head.count("@font-face") == 3
head = head.replace("<title>Typing Quest</title>", "<title>Deckuest</title>")
# 2. UI strings (I18N object only) and the book text
i18n = one(r"const I18N = \{.*?\n\};\n(?=let ui)").group(0)
kinghood = one(r"const KINGHOOD = \{.*?\};\n").group(0)
episode = one(r"const EPISODE = \{.*?\] \};\n").group(0)
assert '"talk"' in kinghood and "Chapter Third" in episode

css = open(os.path.join(HERE, "new.css"), encoding="utf-8").read()
body = open(os.path.join(HERE, "body.html"), encoding="utf-8").read()
game = open(os.path.join(HERE, "game.js"), encoding="utf-8").read()

out = head + css + "</style>\n</head>\n" + body + "<script>\n" + i18n + kinghood + episode + game + "</script>\n</body>\n</html>\n"
open(OUT, "w", encoding="utf-8", newline="\n").write(out)
print("built", OUT, len(out.encode("utf-8")), "bytes")
