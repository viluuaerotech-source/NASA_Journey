src="src/"; html=open(src+'index.html').read(); css=open(src+'style.css').read()
css+='\n'+open(src+'opening.css').read()
html=html.replace('<link rel="stylesheet" href="style.css" />','<style>\n'+css+'\n</style>')
html=html.replace('\n  <link rel="stylesheet" href="opening.css" />','')
for f in ['physics.js','planets.js','hangar.js','flight.js','phase3.js','opening.js']:
    js=open(src+f).read().replace('</script','<\\/script')
    tag=f'<script src="{f}"></script>'
    assert tag in html, tag
    html=html.replace(tag, f'<script>\n/* ===== {f} ===== */\n'+js+'\n</script>')
import sys
open(sys.argv[1] if len(sys.argv)>1 else 'dist/index.html','w').write(html)
print(len(html))
