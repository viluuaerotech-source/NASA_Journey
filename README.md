# 🚀 Lunar Mission Designer

> **Explore. Learn. Launch.**

A browser game where you plan and fly a NASA-style science mission to the Moon, inspired by the real **Lunar Prospector** mission (1998). Pick a target, choose your science goals, engineer a rocket and spacecraft under a budget, then fly it yourself.

Built for **NASA Space Apps Challenge 2026 – Ho Chi Minh City**.

Plain HTML, CSS and JavaScript. No frameworks, no install, no dependencies.

## How the game works

| Phase | What you do |
|-------|-------------|
| **Opening** | Explore a pan/zoom Solar System, select the Moon, then choose missions on its surface (Polar Ice, Minerals, Gravity Map, Magnetic Field). Pick a flight mode: **Cadet** (auto-aim helps) or **Commander** (you steer the burns). |
| **1 · Hangar** | Design the launch vehicle and the spacecraft from real parts. Balance mass, power, Δv and a **$150M budget** against a 10-item launch-readiness checklist (inspired by NASA review gates). A Systems Engineer advisor explains every red or yellow light. |
| **2 · Flight** | Fly a 2D, true-scale Earth–Moon trajectory: launch and stage separation, trans-lunar injection, course correction, lunar orbit insertion, and the final south-pole dive. |
| **3 · Survey** | Fly one full lunar orbit and collect science: neutron spectrometer ice hunt, gamma-ray mineral spectroscopy, data downlink to Earth, and orbit trims. |

Five short **tutorials** run automatically the first time each screen appears and can be replayed from the Tutorial / Flight School buttons.

## Play

**Online:** open the GitHub Pages link for this repo (add it here once published).

**Locally:** serve the folder with any static server, then open the printed address:

```bash
python -m http.server 8000
# open http://localhost:8000
```

Use a desktop browser with a keyboard. An internet connection is needed for the Google Fonts and the NASA reference images.

## Controls (flight)

| Key | Action |
|-----|--------|
| `SPACE` | Engine on / off (`SHIFT+SPACE` = 25% throttle) |
| `A` / `D` | Rotate the nose |
| `Q` | Auto-aim on / off |
| `S` | SAS (stops the spin) |
| `G` | Separate an empty stage |
| `0`–`6` | Time warp, `W` = warp to next burn window |
| `M` | Cycle camera view, `B` switches reference frame |
| `P` / `R` | Pause / retry the stage |
| `T` | Pilot briefing, `H` clean view |

## Project structure

```
src/
├── index.html     # all screens (opening, hangar, flight HUD)
├── style.css      # hangar + flight styles
├── opening.css    # opening / mission-select styles
├── tutorial.css   # tutorial overlay styles
├── physics.js     # orbital mechanics and trajectory prediction
├── planets.js     # Solar System data
├── hangar.js      # Phase 1: parts, budget, checklist
├── flight.js      # Phase 2: flight simulation and HUD
├── phase3.js      # Phase 3: lunar survey mini-games
├── tutorial.js    # spotlight tutorials and flight/survey schools
└── opening.js     # opening sequence and mission selection
build.py           # bundles everything into one HTML file
```

## Build a single-file version

`build.py` inlines all CSS and JS from `src/` into one portable HTML file:

```bash
python build.py dist/index.html
```

If you add a new stylesheet or script, add it to `index.html` **and** to `build.py`, otherwise the built version will miss it. (`tutorial.css` is the one that is easy to forget in `index.html`.)

## Troubleshooting

- **Tutorials do not appear:** make sure `tutorial.css` is linked in `index.html`. They run once per browser; to see them again run `Tutorial.reset(); Tutorial.turnOn();` in the browser console and reload.
- **Blank or broken page:** open DevTools (`F12`) and check the Console and Network tabs for 404 errors. File names on GitHub Pages are case-sensitive.

## Credits

- Mission inspiration and facts: NASA **Lunar Prospector**.
- Gravity map: NASA GRAIL.
- Fonts: Press Start 2P, VT323, IBM Plex Mono, Be Vietnam Pro (Google Fonts).
- Made for NASA Space Apps Challenge 2026, Ho Chi Minh City.

This project is not affiliated with or endorsed by NASA.

## License

Add a license of your choice (for example MIT) as a `LICENSE` file.
