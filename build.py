src="src/"; html=open(src+'index.html').read(); css=open(src+'style.css').read()
css+='\n'+open(src+'opening.css').read()+'\n'+open(src+'tutorial.css').read()
html=html.replace('<link rel="stylesheet" href="style.css" />','<style>\n'+css+'\n</style>')
html=html.replace('\n  <link rel="stylesheet" href="opening.css" />','')
import base64, json, os
aud={n[:-4]: base64.b64encode(open(src+'audio/'+n,'rb').read()).decode() for n in sorted(os.listdir(src+'audio')) if n.endswith('.mp3')}
html=html.replace('<script src="audio.js"></script>','<script>window.__AUDIO='+json.dumps(aud)+';</script>\n<script src="audio.js"></script>')
for f in ['physics.js','planets.js','hangar.js','flight.js','phase3.js','audio.js','tutorial.js','opening.js']:
    js=open(src+f).read().replace('</script','<\\/script')
    tag=f'<script src="{f}"></script>'
    assert tag in html, tag
    html=html.replace(tag, f'<script>\n/* ===== {f} ===== */\n'+js+'\n</script>')
import sys
open(sys.argv[1] if len(sys.argv)>1 else 'dist/index.html','w').write(html)
print(len(html))
