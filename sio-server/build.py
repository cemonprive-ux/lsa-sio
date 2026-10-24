#!/usr/bin/env python3
"""Assemble dist/worker.js (fichier unique) à partir de src/ et de la feuille de style de la maquette."""
import json, re, pathlib, xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).parent
MOCK = pathlib.Path("/home/claude/connecteurs-logiques-sio.html")
XML = pathlib.Path("/mnt/user-data/uploads/Connecteurs_logiques_1.xml")

roster = ["ABDOU HOUMADI Raphaël","AÏT BALLOUK Si Mohamed","ALI Toyboudine","BENCHEBAAT Mehdi","BOUSSISSI Sofiane","BOUTAYA Mehdi","CHENTOUFI Nizar","DELFORGE Alexy","DOUAOUI Sérine","DUBOURGNOUX Laura","FAVRY Ethan","FOURNIER Nolan","GUENDOUZ Soraya","HARBIT Safwane","JOLIN Titouan","LAISSAOUI Amine","LIBRINI Amaury","MARQUET GROISNE Mael","MOHAMMED S-H Warhel","MOINS Antonin","POUMARAT Nolhan","RAMADANI Denis","SALIM El-Yamin","TERRINHA Noah","THERY Eli","VANIER Lucas","VETTER Danaël","VIREMOT Miguël","YAQUBI Mustafa","ZAHMOUL Adam","ZURETTI Gabriel"]
g1 = roster[:15] + ["VANIER Lucas"]
assert len(roster) == 31 and len(set(roster)) == 31 and len(g1) == 16 and set(g1) <= set(roster)

# questions : réponses de la liste d'origine, + « additionally » pour « de plus »
qs = []
for q in ET.parse(XML).getroot().findall("question"):
    if q.get("type") != "shortanswer":
        continue
    fr = re.search(r"<strong>(.*?)</strong>", q.find("questiontext/text").text).group(1)
    acc = [a.find("text").text.strip().lower() for a in q.findall("answer") if a.get("fraction") == "100"]
    if fr == "de plus":
        acc.append("additionally")
    qs.append({"q": fr, "acc": acc})
assert len(qs) == 21

css = next(b for b in re.findall(r"<style>(.*?)</style>", MOCK.read_text(encoding="utf8"), re.S) if "--bg:#EDF0F4" in b)
css += "\nbody{margin:0}\n"

# Compléments d'interface (audit Apple HIG) : polices système, coche « répondue »,
# classes utilitaires remplaçant les styles inline des scripts.
css += """
body,button,input,select,textarea{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif}
h1,h2,.big,.qtext{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",system-ui,sans-serif}
.mono,code{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.nb.done::after{content:"\\2713";margin-left:.2em;font-size:.75em}
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.u-mpad{margin:0 var(--pad) 10px}.u-mt8{margin-top:8px}.u-mt12{margin-top:12px}.u-mt18{margin-top:18px}.u-mt22{margin-top:22px}
.u-mb8{margin-bottom:8px}.u-m16{margin:16px 0 0}
.u-ml8{margin-left:8px}.u-m10{margin:0 0 10px}.u-m26{margin:0 0 26px}.u-mt0{margin-top:0}.u-fs14{font-size:14px}
.u-grid{display:grid;gap:10px;justify-items:end}.u-flex{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
[tabindex="-1"]:focus{outline:none}
"""

def page(title, js_file):
    js = (ROOT / "src" / js_file).read_text(encoding="utf8")
    assert "</script" not in js
    return ('<!doctype html><html lang="fr"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<meta name="robots" content="noindex,nofollow"><title>%s</title>'
            '<style>%s</style></head><body><div id="app"></div><script>%s</script></body></html>'
            % (title, css, js))

dumps = lambda o: json.dumps(o, ensure_ascii=False)
w = (ROOT / "src" / "worker.js").read_text(encoding="utf8")
for k, v in {"__ROSTER__": dumps(roster), "__G1__": dumps(g1), "__QUESTIONS__": dumps(qs)}.items():
    assert w.count(k) == 1
    w = w.replace(k, v)
head = "const STUDENT_HTML = %s;\nconst PROF_HTML = %s;\n\n" % (
    dumps(page("Connecteurs logiques · BTS SIO", "student.js")),
    dumps(page("Espace enseignant · Connecteurs logiques", "prof.js")))
(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist" / "worker.js").write_text(head + w, encoding="utf8")
print("dist/worker.js", len(head + w), "octets")
