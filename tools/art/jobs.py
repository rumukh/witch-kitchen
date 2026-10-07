"""Art job catalogue: stable asset IDs, prompts and output specs. See docs/art/STYLE_BIBLE.md."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = Path(os.environ.get("ART_RAW_DIR", ROOT / ".art-raw"))
PICKS = Path(__file__).parent / "picks.json"

STYLE = (
    "Gouache painting on warm textured paper in the tradition of early-20th-century Russian book "
    "illustration: confident dark-brown ink contour over flat matte gouache fills, dry-brush edges, "
    "visible paper grain, decorative Slavic folk ornament. Warm candlelit palette of honey amber, "
    "ember orange, deep indigo and plum shadows. Cozy, gentle storybook mood; spirits are kind "
    "neighbours. Absolutely no text, letters, numerals, runes, writing, signature or watermark."
)
CUTOUT = (
    "Single subject, centered, fully visible with a small margin on all sides, isolated on a fully "
    "transparent background; no ground, no cast shadow, no frame, no border, no scenery."
)
CHAR = "Original character design, consistent clean silhouette, natural anatomy with exactly the stated number of arms, hands and fingers. "


def picks():
    return json.loads(PICKS.read_text(encoding="utf-8")) if PICKS.exists() else {}


def picked_raw(jid):
    p = picks().get(jid)
    if not p:
        raise SystemExit(f"no pick for reference {jid}")
    return RAW_DIR / jid / p["pick"]


JOBS = {}


def job(jid, kind, prompt, size, quality="high", transparent=False, refs=(), out=None, count=1):
    JOBS[jid] = dict(id=jid, kind=kind, prompt=prompt, size=size, quality=quality,
                     transparent=transparent, refs=list(refs), out=out or {}, count=count)


BG = {"type": "bg"}

# ---------------------------------------------------------------- backgrounds
TAVERN = (
    "Wide 16:9 interior of a cozy old Russian log-built tavern kitchen at night, straight-on view from "
    "the guests' side at eye level. LEFT third: a big whitewashed Russian clay stove with an arched "
    "mouth full of glowing embers, a copper cauldron, stacked firewood and a poker. CENTRE: a long carved "
    "wooden guest counter with four simple empty round wooden stools in front of it, two candles and an "
    "oil lamp on the counter. RIGHT third: a calm, plain log wall with three empty wooden wall shelves, "
    "uncluttered and visually quiet. TOP RIGHT corner, high on the wall: a carved wooden pendulum wall "
    "clock with pine-cone weights on chains, a small closed arched cuckoo door above the dial; the dial "
    "is marked only with dots, no numerals. Back wall: two small windows with ornate carved Slavic "
    "wooden window frames, deep blue night with stars outside. Bunches of dried herbs hang from the "
    "ceiling beams. No people, no creatures. The lower fifth of the image is a calm, dark wooden "
    "floor area. "
)
job("bg-tavern-night", "background", TAVERN + STYLE, "1920x1088", out=BG)
job("bg-tavern-predawn", "background",
    "Repaint image 1 as the same room shortly before dawn: keep the exact layout, camera, stove, counter, "
    "stools, shelves, clock and windows. Lighting becomes cooler and quieter: pale blue-grey dawn light "
    "from the windows, the stove embers low and soft, candles almost burnt down, lavender and grey-blue "
    "palette with a faint cold amber. Same gouache book-illustration style. No people. No text.",
    "1920x1088", refs=["bg-tavern-night"], out=BG)

# ---------------------------------------------------------------- feeling jars
JAR_BASE = (
    "Game item illustration of a small magical glass jar that holds a living feeling: a tiny glowing "
    "firefly spirit with a small expressive face inside the glass. " + STYLE + " " + CUTOUT
)
JAR_REF = "Image 1 is the style authority for the jar rendering: match its gouache texture, ink contour, glass treatment, scale and lighting, but use the new jar shape described. "
J = {"type": "sprite", "box": 512}
job("jar-joy", "feeling-jar",
    "A perfectly ROUND globe-shaped apothecary bottle with a short neck and a sun-shaped carved wooden stopper; "
    "inside, a plump golden firefly spirit laughing with closed happy eyes, warm golden glow. " + JAR_BASE,
    "1024x1024", "medium", True, out=J)
for jid, desc in {
    "jar-sadness": "A TALL TEARDROP-shaped glass bottle, narrow at the top with a small round cork; inside, a pale-blue firefly spirit with gently drooping sad eyes, soft blue glow.",
    "jar-anger": "A SQUAT, wide HEXAGONAL glass jar with flat faceted sides and dark iron bands and a riveted iron lid; inside, a red-orange firefly spirit frowning with puffed cheeks, hot ember glow.",
    "jar-fear": "A NARROW, TALL bottle with hunched sloping shoulders and a long crooked bent neck with a tiny cork; inside, a pale violet firefly spirit trembling with big wide eyes, faint violet glow.",
    "jar-nostalgia": "A classic JAM JAR with a checked cloth cover tied with twine and a bow; inside, a sepia-rose firefly spirit with a dreamy half-closed smile, soft warm glow like an old photograph.",
    "jar-loneliness": "A very THIN TEST TUBE vial standing on a TALL STEMMED wooden foot like a goblet stem; inside, a small grey-blue firefly spirit sitting alone, looking away, faint cool glow.",
    "jar-trepet": "A DOUBLE-GOURD bottle made of two stacked round glass bulbs joined by a narrow waist; in the upper bulb a golden firefly, in the lower bulb a violet firefly, reaching to hold hands through the waist, both shivering with excited wonder, shimmering glow.",
    "jar-hope": "A TALL TEARDROP-shaped glass bottle topped with a STAR-SHAPED glowing stopper and surrounded by a soft halo; inside, a pale sky-blue firefly spirit with a quiet hopeful smile, glowing with gentle golden light.",
    "jar-amber-joy": "An OVAL CAPSULE of solid translucent honey-coloured amber with polished ends, no cork; frozen inside like a fossil, a small round golden firefly spirit peacefully asleep with closed eyes.",
    "jar-burning-joy": "A perfectly ROUND globe-shaped bottle with a sun-shaped stopper, but the glass is sooty and smoke-darkened, a thin curl of smoke rising from the stopper and an ember-red smouldering rim at the bottom; inside, a tired dim orange firefly spirit, smouldering.",
    "jar-sediment": "A LOW, FLAT, WIDE round glass jar like a draughts piece, with a flat tin lid so it can be stacked; inside, murky brown-grey layered dregs and silt with a few dull bubbles, one sleepy bubble with tiny closed eyes.",
    "jar-empty": "A plain simple clear glass jar with a cork stopper, completely empty, clean glass highlights.",
}.items():
    job(jid, "feeling-jar", desc + " " + JAR_REF + JAR_BASE, "1024x1024", "medium", True, refs=["jar-joy"], out=J)
job("jar-murky-overlay", "feeling-jar",
    "A soft cloud of murky brownish-grey haze and swirling silt smoke, roughly jar-sized and oval, semi-transparent wisps with soft edges, "
    "gouache dry-brush texture. " + CUTOUT + " No jar, only the haze.",
    "1024x1024", "medium", True, out=J)

# ---------------------------------------------------------------- characters
MIRA = (
    "Mira, a 19-year-old young village witch-cook: slender, a long thick dark-blond single braid over her right shoulder, "
    "kind oval face with light freckles and grey-green eyes, embroidered white linen blouse with red folk embroidery on the sleeves, "
    "dark cherry-red sarafan, ochre apron with a wooden ladle in its pocket, a soft wool shawl with a faded floral pattern on her shoulders. "
    "Three-quarter-length view from head to knees, body turned slightly to the left, facing the viewer. "
)
C = {"type": "sprite", "h": 1024}
job("mira-neutral", "character", CHAR + MIRA + "Expression: calm, attentive, gentle neutral; hands loosely folded in front of the apron. " + STYLE + " " + CUTOUT,
    "1024x1536", transparent=True, out=C)
MIRA_REF = "Image 1 is Mira, the identity authority: keep her exact face, braid, clothes, colours, proportions, framing, scale and art style. Change only the expression and pose: "
for jid, d in {
    "mira-smile": "a warm open smile with crinkled eyes, hands clasped happily at her chest.",
    "mira-worried": "worried, brows raised and drawn together, biting her lip, one hand clutching the edge of her shawl.",
    "mira-determined": "determined, chin up, firm small smile, sleeves rolled up, holding the wooden ladle like a staff.",
}.items():
    job(jid, "character", MIRA_REF + d + " " + CUTOUT, "1024x1536", transparent=True, refs=["mira-neutral"], out=C)

GRANNY = (
    "Grandmother Agrafena, a small round-faced kind old Russian woman with soft wrinkles, rosy cheeks and bright twinkling eyes, "
    "a red-and-gold patterned headscarf tied under her chin, a dark blouse with a little brooch. Chest-up portrait framed INSIDE the "
    "small open arched wooden door of a carved pendulum wall clock: the carved arched door frame with folk ornament surrounds her "
    "like a portrait frame, the little door swung open to one side; behind her a warm golden glow and soft brass clockwork gears. "
    "The whole image is just this arched door with her inside it. "
)
G = {"type": "sprite", "h": 768}
job("grandma-agrafena-kind", "character", CHAR + GRANNY + "Expression: kind, warm, reassuring smile. " + STYLE + " " + CUTOUT,
    "1024x1024", transparent=True, out=G)
job("grandma-agrafena-whisper", "character",
    "Image 1 is grandmother Agrafena in the clock door, the identity authority: keep her exact face, headscarf, the arched clock-door frame, "
    "colours, framing and art style. Change only her pose: she leans slightly forward with one hand raised beside her mouth, whispering a secret, "
    "eyes twinkling, a faint golden shimmer of whisper near her lips. " + CUTOUT,
    "1024x1024", transparent=True, refs=["grandma-agrafena-kind"], out=G)

job("kupa", "character", CHAR +
    "Kupa, an original warmly grumpy stoker spirit of the tavern stove: short, broad, barrel-shaped body like a squat cast-iron stove, "
    "round soot-smudged face with a bushy charcoal-grey beard, glowing ember-orange eyes under heavy brows, a knitted red cap, a thick "
    "patched leather apron. He has exactly SIX strong arms with rolled-up sleeves arranged in three pairs: the top pair holds an iron "
    "poker and a birch log, the middle pair holds a small shovel of glowing coals and a soot-black kettle, the lowest pair is folded "
    "grumpily across his belly. Felt boots. Grumpy frown but clearly warm-hearted. Full body, three-quarter view. "
    + STYLE + " " + CUTOUT, "1024x1536", transparent=True, out={"type": "sprite", "h": 1024})

# ================================================================ batch 2
job("bg-mezhsvetye-day", "background",
    "Image 1 is the tavern interior, the authority for layout, camera and art style. Repaint the same room by sleepy daytime "
    "(the in-between hour): keep the exact camera, stove, counter, stools, shelves, wall clock and carved windows. The stove is cold "
    "with a faint wisp of warmth, candles are out, soft pale sunlight with floating dust beams comes through the windows, faded linen "
    "and dusty ochre palette with pale azure. A large hand-drawn pictorial map with little painted trees, a river and tiny houses, "
    "without any lettering, is unrolled on the counter, held flat by a teacup and a candlestick. Through the right window, outside, a "
    "small old tram-stop sign on a pole (a blank round enamel plate with no letters or numbers) and a strip of tram rails in grass. "
    "Sleepy, quiet, empty. No people. No text.",
    "1920x1088", refs=["bg-tavern-night"], out=BG)

GUEST = ("Seated half-body portrait of a guest spirit visiting a cozy tavern, visible from the waist up as if sitting at a counter, "
         "forearms resting forward, three-quarter view facing slightly left, friendly and a little melancholic. " + CHAR)
GB = {"type": "sprite", "box": 768}
GUESTS = {
    "guest-forest-1": "A small old forest spirit with a broad brown porcini-mushroom cap for a hat, a round mossy face with a kind wrinkled smile, a cloak of green moss and fern fronds, a little acorn pendant. Moss greens and bark browns.",
    "guest-forest-2": "A slender birch-tree maiden spirit with white-and-black birch-bark skin patterns on her arms, long pale-green hair with small birch leaves and catkins, a simple embroidered linen dress. Moss greens and bark browns.",
    "guest-forest-3": "A tall gentle elk-antlered woodcutter spirit with a soft brown fur coat, mossy beard, small bright eyes, a woven bast satchel; sad because his forest was cut, holding a small sapling in a pot. Moss greens and bark browns.",
    "guest-river-1": "An old frog-faced river ferryman spirit with a wide reed hat, a green-turquoise patched coat dripping a little water, kind bulging eyes, webbed hands holding a tiny paddle. Glass-green and turquoise palette.",
    "guest-river-2": "A young river maiden spirit with long wet dark hair braided with water lilies, a shawl shimmering like fish scales, a string of river pearls, calm sad eyes. Glass-green and turquoise palette.",
    "guest-river-3": "A whiskered catfish-like old fisherman spirit with long drooping barbels, a knitted turquoise cap, a fishing net over one shoulder, a small glass float in his hand. Glass-green and turquoise palette.",
    "guest-city-1": "A tall thin streetlamp spirit gentleman: his head is an old wrought-iron street lantern glowing warm amber with a kind face in the glass, a long grey coat and a striped scarf. Warm asphalt greys and amber bulbs.",
    "guest-city-2": "A plump old courtyard cat spirit in a knitted vest and a cap, grey-tabby, holding a saucer of milk, tired but cheerful eyes. Warm asphalt greys and amber bulbs.",
    "guest-city-3": "A young postwoman spirit made of folded blank paper, with a paper-pleated skirt, a leather satchel full of blank envelopes without writing, a bicycle bell on her wrist, round glasses. Warm asphalt greys and amber bulbs.",
    "guest-memorial-1": "A gentle faceless shadow of an old woman in a soft headscarf, her face a smooth calm darkness with no features, holding a lit wax candle in both hands, a faint silver glow around her. Candle-silver and soft blue palette, peaceful, not scary.",
    "guest-memorial-2": "A quiet faceless silhouette of an old man in a flat cap and an old soldier's greatcoat without insignia, his face a smooth soft shadow without features, holding a sprig of pussy willow, faint silver outline. Candle-silver and soft blue palette, peaceful, not scary.",
    "guest-memorial-3": "A translucent silvery-blue child-sized spirit with a soft smooth faceless head and a little knitted hat, holding a paper boat with a tiny candle in it, faint glow. Candle-silver and soft blue palette, tender and peaceful, not scary.",
}
for jid, d in GUESTS.items():
    job(jid, "guest", GUEST + d + " " + STYLE + " " + CUTOUT, "1024x1024", "high", True, out=GB)

DISH = ("Game item illustration of a magical dish served in a cozy Slavic witch tavern, three-quarter top view, on a small "
        "painted folk-style plate or in a wooden or clay vessel. ")
DB = {"type": "sprite", "box": 384}
DISH_REF = "Image 1 is the style authority for dish rendering: match its gouache texture, ink contour, viewing angle, scale and lighting, but paint the new dish described. "
job("dish-nimbus-ramen", "dish", DISH + "Nimbus ramen: a deep red-and-gold lacquered bowl of noodles in golden broth with a soft egg and spring onion; hovering just above the bowl is a tiny fluffy white cloud with a little face that cries a few rain drops from one side while laughing on the other, a small rainbow glint. " + STYLE + " " + CUTOUT, "1024x1024", "medium", True, out=DB)
DISHES = {
    "dish-smoke-tea": "Smoke tea: a glass of dark amber tea in an ornate brass glass-holder, a slow curl of blue-grey smoke rising from it, a slice of lemon.",
    "dish-tar-gingerbread": "Tar gingerbread: three dark, glossy, almost black gingerbread cookies shaped like a horse, a bird and a round rosette, decorated with white folk-pattern icing, on a small wooden board.",
    "dish-fog-ukha": "Fog ukha: a clay bowl of pale clear fish soup with potatoes and dill, soft white fog spilling over the rim like a little river mist.",
    "dish-thunder-perepechi": "Thunder perepechi: three small open-top round rye pies filled with golden egg and herbs, tiny bright-blue lightning sparks dancing above them, on a painted plate.",
    "dish-amber-ryapushka": "Amber ryapushka: three small whole fried silver fish laid in a row, glazed in a translucent golden amber coating, on a dark plate with lingonberries.",
    "dish-postcard-sbiten": "Postcard sbiten: a copper mug of hot spiced honey drink with steam and a cinnamon stick, an old faded blank picture postcard with no writing tucked behind it.",
    "dish-forgotten-names-kissel": "Kissel of forgotten names: a tall glass of thick lilac-pink berry kissel with soft swirling pale ribbons of light inside, a sprig of mint.",
    "dish-courage-tea": "Courage tea: a big blue enamel mug of strong red-brown tea with steam rising in the shape of a small brave flame, a lump of sugar on the saucer and a tiny knitted mitten beside it.",
    "dish-empty-shchi": "Empty shchi: a wooden bowl of very clear, pale, almost empty cabbage soup with a single cabbage leaf, a dull muted gold shimmer at the bottom like old coins, a wooden spoon; quiet and plain.",
    "dish-tram-ticket-boltushka": "Tram-ticket boltushka: a teacup of fluffy whipped golden batter with a small blank paper tram ticket stuck in it like a little flag, tiny electric sparks around the rim.",
    "dish-pryazhenets": "Pryazhenets: a grand festive braided ring loaf of golden bread with many glowing threads of different colours woven through the braid (gold, blue, red, violet, sepia, grey-blue, moss), on an embroidered towel, softly radiant.",
    "dish-memory-pie": "Memory pie: a round golden pie with a lattice top and a little pastry bird, a single glowing warm silver thread rising from the crust and curling into the air.",
}
for jid, d in DISHES.items():
    job(jid, "dish", DISH_REF + DISH + d + " " + STYLE + " " + CUTOUT, "1024x1024", "medium", True, refs=["dish-nimbus-ramen"], out=DB)

# ---------------------------------------------------------------- UI kit
ICON = ("Small game UI icon, bold readable silhouette, simple shapes, thick dark-brown ink contour and flat gouache fill, "
        "slight paper texture, warm folk-art palette, front view, readable at 48 pixels. ")
IB = {"type": "sprite", "box": 256, "margin": 0.04}
ICON_REF = "Image 1 is the style authority for icons: match its contour weight, flat gouache fill, palette and scale, but draw the new object described. "
job("icon-heat", "icon", ICON + "A single stylised flame of warm stove fire, orange and gold with a red core, folk-ornament curl at the tip. " + STYLE + " " + CUTOUT, "1024x1024", "medium", True, out=IB)
ICONS = {
    "icon-patience": "A short white wax candle in a small brass holder with a calm flame and a drip of wax.",
    "icon-key": "An ornate old brass clock-winding key with a trefoil bow.",
    "icon-memory-thread": "A small wooden spool with a glowing warm silver thread unwinding in a gentle curl.",
    "icon-empty-gold": "A dull hollow gold coin with an empty ring in the centre, a faint grey shimmer, plain without any marks.",
    "icon-sparks": "Three small bright golden sparks like tiny stars, a cluster of glittering embers.",
    "icon-story-card": "A small upright card with a rounded ornament border and a tiny painted house in the centre.",
    "icon-water": "A single round drop of clear turquoise river water with a highlight and a tiny wave inside.",
    "icon-burner": "A round cast-iron stove burner ring seen from above with a soft glow beneath.",
    "icon-tray": "A round painted wooden serving tray with red-and-gold folk flowers, seen at a slight angle, empty.",
    "icon-broom": "A small birch-twig broom tied with red string.",
    "icon-cuckoo": "A small carved wooden cuckoo bird peeking out of a tiny arched clock door.",
    "icon-tram-ticket": "A small blank paper tram ticket with a torn edge and a punched hole, no writing.",
    "icon-silence-jar": "A tall dark-blue clay jar sealed with wax and a cloth, a soft quiet glow and a little closed-eyes motif on it.",
    "icon-upgrade-chair": "A simple carved wooden stool with a small plus-shaped sparkle beside it.",
    "icon-upgrade-shelf": "A carved wooden wall shelf with two empty little jars on it.",
    "icon-upgrade-mittens": "A pair of thick soot-smudged red knitted oven mittens.",
    "icon-upgrade-double-stove": "A small whitewashed Russian stove with two arched fire mouths side by side, both glowing.",
}
for jid, d in ICONS.items():
    job(jid, "icon", ICON_REF + ICON + d + " " + STYLE + " " + CUTOUT, "1024x1024", "medium", True, refs=["icon-heat"], out=IB)
DOORS = {
    "door-forest": "An arched carved wooden door standing open, revealing a mossy night forest with fern and fireflies inside the doorway; green and bark palette.",
    "door-river": "An arched carved wooden door standing open, revealing a turquoise night river with reeds and a moon reflection inside the doorway; glass and turquoise palette.",
    "door-city": "An arched carved wooden door standing open, revealing a small night city street with warm amber streetlamps and brick houses inside the doorway; asphalt grey and amber palette.",
    "door-memorial": "An arched carved wooden door standing open, revealing a quiet night birch grove with many small candles glowing in silver and soft blue inside the doorway; peaceful.",
}
for jid, d in DOORS.items():
    job(jid, "icon", ICON_REF + ICON + d + " " + STYLE + " " + CUTOUT, "1024x1024", "medium", True, refs=["icon-heat"], out={"type": "sprite", "box": 384, "margin": 0.03})

UIB = "Game user-interface element, front orthographic view, perfectly symmetrical, flat, clean edges. "
job("ui-frame", "ui", UIB + "An ornamental rectangular frame: a uniform border band of carved and painted wood in the style of Slavic carved window frames, "
    "warm honey wood with red, gold and deep-green folk ornament, a rosette in each of the four corners, the four straight sides are a simple "
    "evenly repeating pattern of the same thickness all around. The entire inside of the frame is empty and fully transparent. "
    + STYLE + " Isolated on a fully transparent background.", "1024x1024", "high", True, out={"type": "sprite", "box": 512, "margin": 0.0})
job("ui-panel-paper", "ui", "Seamless flat texture of warm cream handmade paper with subtle gouache wash variations and soft fibres, evenly lit, "
    "no objects, no ornament, no vignette, no text, uniform over the whole image.", "1024x1024", "medium", out={"type": "tile", "size": 512})
job("ui-button", "ui", UIB + "A wide horizontal button plaque: a rounded rectangle of painted honey-coloured wood with a thin dark-red inner line, "
    "small carved folk-ornament scrolls at the left and right ends, the centre is plain and empty for a label. " + STYLE + " Isolated on a fully transparent background.",
    "1536x1024", "high", True, out={"type": "sprite", "box": 512, "margin": 0.0})
CARD = "A tall vertical game card with rounded corners, 2:3 proportions, front view, filling the whole height. "
job("card-story-back", "card", CARD + "The card back: deep indigo with a symmetric gold-and-red folk ornament, a sun rosette in the middle, a carved border. " + STYLE + " Isolated on a fully transparent background.", "1024x1536", "high", True, out={"type": "sprite", "h": 768, "margin": 0.0})
job("card-story-frame", "card", CARD + "The card face frame only: an ornate folk-ornament border in honey wood and red, with a large empty fully transparent window in the middle for a picture. " + STYLE + " Isolated on a fully transparent background.", "1024x1536", "high", True, out={"type": "sprite", "h": 768, "margin": 0.0})
TAROT = {
    "tarot-guest": "Grandmother's fortune card 'Guest': inside an ornate folk border, an open tavern door at night with the soft silhouette of a visitor in the doorway and a warm lantern.",
    "tarot-wind": "Grandmother's fortune card 'Wind': inside an ornate folk border, a swirling wind carrying autumn leaves, a feather and a birch twig across a night sky.",
    "tarot-whisper": "Grandmother's fortune card 'Whisper': inside an ornate folk border, a small carved cuckoo at an open clock door with a golden ribbon of whisper curling out, and a sprig of herbs.",
}
for jid, d in TAROT.items():
    job(jid, "card", CARD + d + " " + STYLE + " Isolated on a fully transparent background.", "1024x1536", "high", True, out={"type": "sprite", "h": 768, "margin": 0.0})
job("title-logo-ornament", "title", UIB + "A decorative horizontal title cartouche: a wide carved-wood folk-ornament banner shaped like the top of a carved window frame, with a sun rosette, "
    "birds and twisting vines on both sides and a small pendulum clock and crossroads signpost motif at the top centre; a large plain empty cream band across the middle for the title. "
    + STYLE + " Isolated on a fully transparent background.", "1536x1024", "high", True, out={"type": "sprite", "box": 1024, "margin": 0.0})

# ================================================================ batch 3
for jid, d in {
    "commis-mirror": "The travelling merchant from the Mirror: tall, thin, all in soft greys, a long grey coat, a wide-brimmed grey hat, a tall wooden peddler's box on his back with a round silver mirror set in it, his face softly silvery and reflective with sad kind eyes, holding a small grey glass vial. Three-quarter-length view.",
    "nameless-guest": "The Nameless Guest, 'silence enthroned': an empty, softly glowing outline of a seated cloaked figure, the inside is a calm deep-blue negative space with faint gentle star dust, no face and no features at all, sitting peacefully upright, a quiet pale-gold halo of light at the edges. Serene, mysterious, not scary.",
    "tram33-spirit": "The spirit of the cancelled tram line 33: a friendly little conductor spirit whose head is an old round tram headlamp glowing warm with two kind eyes, wearing a faded red-and-cream tram conductor's coat with brass buttons and a leather ticket bag, a trolley pole on his back with tiny sparks at its tip. Three-quarter-length view.",
    "dubodyor": "Dubodyor, the leshy, heart of the forest: a huge old gnarled stump-bodied forest grandfather with a long beard of green moss and lichen, branching antlers of oak twigs with a few leaves, small bright amber eyes, bark skin, bast shoes, leaning on a crooked staff; gruff but kind. Full body.",
    "tikhaya": "Tikhaya, the bereginya of the river: a pale, quiet river maiden, long hair flowing like a slow current of water, a dress of layered translucent glass-green and turquoise like river water, water lilies in her hair, a soft sad gentle smile, hands holding a small clay jug. Three-quarter-length view.",
    "prosha": "Prosha, the domovoy house spirit: a small, shaggy, round, bustling house elder with a big fluffy beard and brown fur, a red kaftan with a sash, bast shoes, a little broom in one hand and a bundle of keys on his belt, cheerful and fussy. Full body.",
    "guardian": "The Guardian of the Crossroads: a tall serene radiant spirit wearing a cloak sewn from four patches (moss-green forest, turquoise river, amber city, silver-blue candlelit), antlers like crossroads signposts, a soft dawn sun glowing in the chest, a calm kind face, arms open in welcome. Full body.",
}.items():
    job(jid, "character", CHAR + d + " " + STYLE + " " + CUTOUT, "1024x1536", "high", True, out=C)

DOOR_BG = ("Wide 16:9 view through the open double doors of a cozy carved wooden tavern, the doorway framed by ornate Slavic carved "
           "nalichnik ornament at the edges of the image, looking out into another world at night: ")
for jid, d in {
    "bg-door-forest": "a deep old mossy forest with huge fir trunks, ferns, mushrooms, fireflies and a winding path; moss greens and bark browns, soft green moonlight.",
    "bg-door-river": "a wide calm river of glass-clear turquoise water with reeds, lily pads, a small wooden pier and a pale moon reflected; glass and turquoise palette.",
    "bg-door-city": "a small old town street with wet warm-grey cobbles and asphalt, brick houses with glowing amber windows, strings of warm light bulbs and a tram rail curving away; no signs, no lettering.",
    "bg-door-memorial": "a quiet birch grove on a gentle hill with many small candles glowing in the grass, silver birch trunks, soft blue night and a thin mist; peaceful, tender remembrance, no graves, no crosses.",
}.items():
    job(jid, "background", DOOR_BG + d + " No people. " + STYLE, "1920x1088", out=BG)
job("bg-title", "background",
    "Wide 16:9 night landscape: a small cozy two-storey log tavern with a carved roof and glowing warm windows stands exactly where four roads meet; "
    "the four roads lead away into four different worlds — a mossy forest on the left, a turquoise river on the right, a distant warm amber old town behind, "
    "and a silver-blue birch grove with candles in the foreground corner. A pendulum clock motif in the carved gable, a crossroads signpost with blank boards, "
    "a big starry indigo sky. The upper third of the sky is calm and empty for the title. " + STYLE, "1920x1088", out=BG)
END = {"type": "bg"}
for jid, d in {
    "ending-wound": "Ending: inside the warm tavern, the carved pendulum wall clock glows softly from within like a gentle golden heart, its pendulum swinging; below it the young keeper Mira (long dark-blond braid, red sarafan, ochre apron) stands calmly with a candle, keeping watch, peaceful and bittersweet, seen from behind and in profile.",
    "ending-remember": "Ending: in the tavern, a little kind grandmother in a red patterned headscarf steps out of the open door of a big pendulum clock into warm light, smiling; beside the counter a softly glowing figure of light, once empty, now has a warm gentle glow and a calm face as he remembers; Mira (dark-blond braid, red sarafan) reaches out to her grandmother. Joyful and tender.",
    "ending-new-spring": "Ending: a dawn feast outside the tavern at the crossroads: long tables with dishes, forest, river, city spirits and gentle silver memorial shadows seated together, a tall radiant guardian spirit with a four-patch cloak and signpost antlers stands blessing the feast, pink-gold sunrise, blossoming birches. Warm, festive, hopeful.",
    "ending-letter": "Ending: a quiet still life: on a wooden table by the window, a folded letter with a wax seal (no visible writing), a stopped pendulum wall clock above with its little door open and a small carved cuckoo leaning out, a single candle, soft morning light. Bittersweet, gentle, hopeful.",
}.items():
    job(jid, "ending", "Wide 16:9 full-scene book illustration. " + d + " " + STYLE, "1920x1088", out=END)

job("jar-empty", "feeling-jar",
    "Image 1 is the style authority for the jar rendering: match its gouache texture, ink contour, folk ornament band, glass treatment and scale. "
    "Paint a plain round-shouldered glass jar with a cork stopper and the same painted folk ornament band at its base; the inside holds only clear, "
    "still air with soft glass reflections and a faint cool highlight — an unoccupied vessel waiting for a feeling. Game item illustration. "
    + STYLE + " " + CUTOUT, "1024x1024", "medium", True, refs=["jar-joy"], out=J)

