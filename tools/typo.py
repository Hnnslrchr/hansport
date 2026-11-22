# Normalisiert Schriftgrößen auf die iOS-Skala (Tokens --fs-*), Basis 1rem = 17 pt (Dynamic Type).
import re, sys, glob
def tok(px):
    if px < 11.5: return 'cap2'      # 11
    if px < 12.5: return 'cap'       # 12
    if px < 14: return 'foot'        # 13
    if px < 15.5: return 'sub'       # 15
    if px < 16.5: return 'callout'   # 16
    if px < 18.5: return 'body'      # 17
    if px < 21: return 't3'          # 20
    if px < 25: return 't2'          # 22
    if px < 31: return 't1'          # 28
    if px < 38: return 'large'       # 34
    if px < 50: return 'num-l'       # 44
    return 'num-xl'                  # 56
def px_of(v, unit):
    v = float(v)
    return v * 16 if unit == 'rem' else v
n = 0
def sub_size(m):
    global n
    n += 1
    return m.group(1) + 'var(--fs-' + tok(px_of(m.group(2), m.group(3))) + ')'
def sub_short(m):
    global n
    n += 1
    return m.group(1) + 'var(--fs-' + tok(float(m.group(2))) + ')' + m.group(3)
for f in sys.argv[1:]:
    s = open(f).read(); n0 = n
    s = re.sub(r'(font-size:\s*)([\d.]+)(px|rem)(?![\w-])', sub_size, s)
    s = re.sub(r"(fontSize:\s*')([\d.]+)(px|rem)'", lambda m: (sub_size(re.match(r'(.*)', '') or m) and None) or "fontSize: 'var(--fs-" + tok(px_of(m.group(2), m.group(3))) + ")'", s)
    s = re.sub(r'(font:\s*(?:\d00\s+)?)([\d.]+)px(\s)', sub_short, s)
    open(f, 'w').write(s)
    print(f, n - n0)
