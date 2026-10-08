# Placeholders

Art placeholders are procedural SVG/CSS generated in code (src/ui/dom.ts, src/ui/art.ts) and used for any ID missing from assets/art/manifest.json. Audio placeholders are silence: any cue missing from assets/audio/manifest.json is skipped (captions still shown). The game stays fully playable without assets/art and assets/audio.
