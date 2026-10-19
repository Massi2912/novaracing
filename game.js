'use strict';

if (typeof THREE === 'undefined') {
  window.addEventListener('load', function () {
    var s = document.getElementById('overlaySub');
    if (s) s.textContent = 'Three.js konnte nicht geladen werden – bitte Internetverbindung prüfen.';
    var b = document.getElementById('startBtn');
    if (b) b.disabled = true;
  });
  throw new Error('THREE nicht geladen');
}

// ─── Konstanten ───────────────────────────────────────────────────────────────
const TRACK_W      = 13;
const HALF_W       = TRACK_W / 2;
const N            = 1400;          // Abtastpunkte entlang der Kurve
let   TOTAL_LAPS   = 3;             // wird pro Strecke aus TRACKS[].laps gesetzt
const CP_N         = 32;            // Checkpoints pro Runde
const GROUND_Y     = -0.5;

const MAX_SPEED    = 46;            // Einheiten pro Sekunde
const ACCEL        = 24;
const BRAKE        = 42;
const REVERSE_MAX  = MAX_SPEED * 0.3;
const DRAG         = 0.42;
const TURN_RATE    = 2.3;           // rad/s
const WALL_LIMIT   = HALF_W - 1.1;  // max. seitlicher Abstand der Automitte
const CAR_R        = 1.25;          // Kollisionsradius des Autos gegen feste Hindernisse (Brückenpfeiler)
const SEARCH_W     = 60;            // Suchfenster (Samples) für den nächsten Kurvenpunkt
const COUNTDOWN_STEP = 900;         // ms pro Zahl
const START_GAP_M  = 9;             // Startposition hinter der Ziellinie (Meter)
const RECORDS_KEY  = 'rennspiel_records_v1';   // Rekorde (JSON, versioniert)
const LEGACY_KEY   = 'rennspiel3d_best_v2';    // alter Key: wird einmalig übernommen

// ─── Strecken ─────────────────────────────────────────────────────────────────
// Neue Strecke freischalten: `locked: false` setzen und `points` (Mittellinie) ergänzen.
// Kartenvorschau, Rundenzahl, Rekorde und Auswahl im Menü folgen automatisch aus diesem Array.
//   id           eindeutig, nur a-z, 0-9 und '-' (Teil des localStorage-Keys der Rekorde)
//   name         Anzeigename im Menü
//   difficulty   1–5 Sterne
//   laps         Rundenzahl
//   locked       true = ausgegraut mit "Bald verfügbar", nicht wählbar
//   points       Kontrollpunkte der geschlossenen Mittellinie [x, Höhe, z] (Pflicht, sobald locked: false)
//   startOffset  Index, ab dem die Punktliste rotiert wird (Start/Ziel soll auf einem flachen Abschnitt liegen)
//   preview      SVG-Pfad in einer 120 × 64 Box für die Kartenvorschau – nur nötig, solange `points` fehlt
const TRACKS = [
  {
    id: 'daemmerung-acht',
    name: 'Dämmerungs-Acht',
    difficulty: 2,
    laps: 3,
    locked: false,
    startOffset: 2,
    // [x, Höhe, z] – Acht mit Kreuzung im Ursprung (unten = Unterführung, oben = Brücke)
    points: [
      [0, 0, 0],            // 0  Unterführung (untere Strecke)
      [58.6, 1, 45.3],
      [100, 2, 60],
      [135, 6, 22],
      [131.6, 9, -25.2],    // Hügelkuppe
      [105.5, 5, -56.5],    // Abfahrt
      [58.6, 4, -45.3],
      [0, 11.5, 0],         // 7  Brücke (obere Strecke)
      [-58.6, 5, 45.3],
      [-100, 1, 60],
      [-131.6, 0, 25.2],
      [-122, 0, -30],       // Tunnel-Kurve
      [-105.5, 2, -56.5],
      [-58.6, 1.5, -45.3]
    ]
  },
  {
    id: 'neon-stadt',
    name: 'Neon-Stadt',
    difficulty: 3,
    laps: 3,
    locked: false,
    theme: 'neon',          // Schlüssel in THEMES (Himmel, Licht, Farben)
    scene: {                // Overrides für SCENE: Natur raus, Stadt rein
      PINES: 0, NEAR_PINES: 0, LEAFY: 0, POPLARS: 0, BUSHES: 0, ROCKS: 0, BUILDINGS: 0, SAND_PATCHES: 0,
      CLOUDS: 7, BIRDS: 0, WIND: 0, FENCES: false, GRASS: 0, FLOWERS: 0, HAY: 0, MARSHALS: 0, FAN_GROUPS: 0,
      TENTS: 0, CARAVANS: 0, PONDS: 0, TURBINES: 0, BALLOONS: 0, FIREFLIES: 0,
      BANK_K: 2.2, BANK_MAX: 0.07,                     // Stadtstrassen: weniger Querneigung
      TOWERS: 210, FAR_TOWERS: 90, SIGNS: 64,          // Hochhäuser nahe/fern, Wand-Reklamen
      GANTRY_AT: [0.36, 0.66, 0.5],                    // Sektor-Torbögen (die ersten zwei = Sektor 2 und 3)
      FOOTBRIDGES: [0.86], OVERHEADS: [0.62, 0.8],     // Fussgängerbrücke, Hänge-Reklamen (Anteil der Runde)
      DRONES: 34, RAIN: 360, STEAM: 14, ZEPPELIN: true
    },
    // Mittellinie [x, Höhe, z]: acht-förmig. Grosser Lobe (Start/Ziel, Tunnel, S-Schikane), kleiner Lobe (Haarnadel
    // um den Plaza-Block, Rampe), Kreuzung im Ursprung: oben die Hochstrasse (y ≈ 10,5), unten die Unterführung.
    startOffset: 7,
    points: [
      [0, 0, 126], [-2.8, 0, 139.5], [-10, 0, 150], [-21.4, 0, 157.6],
      [-34, 0, 160], [-55.8, 0, 160], [-77.7, 0, 160], [-99.5, 0, 160],
      [-122.3, 0, 160], [-144.2, 0, 160], [-166, 0, 160], [-179.5, 0, 157.2],
      [-190, 0, 150], [-197.6, 0, 138.6], [-200, 0, 126], [-200.6, 0, 95.3],
      [-200.6, 0, 64.7], [-200, 0, 34], [-197.2, 0, 20.5], [-190, 0, 10],
      [-178.6, 0, 2.4], [-166, 0, 0], [-149.8, 0, -1.3], [-127.3, 0, -12.5],
      [-116.3, 0, -16.4], [-103.7, 0, -16.4], [-92.7, 0, -12.5], [-78.1, 0, -4.5],
      [-69.2, 0, -1], [-29.8, 0, 0], [0.2, 0, 0], [32.1, 0, 0],
      [63.1, 0, 0], [95, 0, 0], [126, 0, 0], [138.3, 0, -3.4],
      [146.6, 0, -11.7], [150, 0, -24], [146.6, 0, -36.3], [137.4, 0, -45.1],
      [126, 0, -48], [100.3, 0.59, -48], [74.5, 2.48, -48], [48.8, 5.04, -48],
      [24, 7.56, -48], [11.7, 8.7, -44.6], [3.4, 9.56, -36.3], [0, 10.21, -24],
      [0, 10.5, -0.2], [0, 9.43, 31.6], [0, 5.65, 63.4], [0, 1.63, 95.2]
    ]
  },
  {
    id: 'bergpass',
    name: 'Bergpass',
    difficulty: 4,
    laps: 3,
    locked: false,
    theme: 'alpine',        // Schlüssel in THEMES (Alpenglühen, Gipfel, Talnebel)
    scene: {                // Overrides für SCENE: Natur-Defaults raus, Alpen-Schlüssel rein
      PINES: 0, NEAR_PINES: 0, LEAFY: 0, POPLARS: 0, BUSHES: 0, ROCKS: 0, BUILDINGS: 0, SAND_PATCHES: 0,
      CLOUDS: 6, BIRDS: 0, WIND: 0.8, FENCES: false, GRASS: 0, FLOWERS: 0, HAY: 0, MARSHALS: 0, FAN_GROUPS: 0,
      TENTS: 0, CARAVANS: 0, PONDS: 0, TURBINES: 0, BALLOONS: 0, FIREFLIES: 0, CONES: false, APEX_KERBS: true,
      BANK_K: 3.0, BANK_MAX: 0.08,                       // Bergstrasse: moderate Querneigung
      GANTRY_AT: [0.34, 0.66],                           // Sektor-Torbögen (Sektor 2 und 3)
      ALP_PINES: 330, ALP_BUSHES: 260, ALP_ROCKS: 210, ALP_SPIRES: 70, ALP_FLOWERS: 420, ALP_SCREE: 26,
      ALP_CHALETS: 13, ALP_CHAPEL: true, ALP_GALLERY: true, ALP_WATERFALL: true,
      ALP_CABLEWAY: true, ALP_EAGLES: 7, ALP_SNOWFALL: 220, ALP_PENNANTS: true, ALP_POLES: 1
    },
    startOffset: 0,
    // [x, Höhe, z] – Acht-Form: Kehren-Aufstieg im Nordosten (z < 0), Kreuzung im Ursprung
    // (oben = Steinbogen-Viadukt y = 31, unten = Unterführung y = 12), Felstunnel ganz im Westen.
    // Fahrtrichtung: Start auf der Passhöhe nach Westen.
    points: [
      [95, 44, -132],     // 0  START/ZIEL, Passhöhen-Gerade (Boxengasse, Tribüne), flach y = 44
      [72.5, 44, -132], [40, 44, -132],
      [20, 42.16, -126.6], [5.4, 39.84, -112],   // Linkskurve nach Süden
      [0, 38, -92], [0, 35.85, -61.3], [0, 33.15, -30.7],
      [0, 31, 0],         // 8  Mitte Brücke/Viadukt (obere Ebene)
      [0, 30.08, 35], [0, 28.92, 70], [0, 28, 105],
      [-6, 27.08, 127.5], [-22.5, 25.92, 144], [-45, 25, 150],   // Rechtskurve nach Westen
      [-70, 24, 150], [-95, 23, 150],
      [-117.5, 21.92, 144], [-134, 20.58, 127.5],                // Rechtskurve nach Norden
      [-140, 19.5, 105],
      [-142.3, 19.02, 80], [-142.3, 18.62, 55],   // 20–21  FELSTUNNEL (kleinstes x der Strecke, leichter Bogen)
      [-140, 18.2, 30],
      [-136, 16.91, 15], [-125, 15.29, 4],        // Rechtskurve nach Osten
      [-110, 14, 0], [-80, 12, 0], [-50, 12, 0],
      [-13.3, 12, 0], [23.3, 12, 0],              // 28–29  Unterführung (untere Ebene), flach y = 12
      [60, 12, 0], [96.7, 12.92, 0], [133.3, 14.08, 0], [170, 15, 0],
      [181, 15.54, -2.9], [189.1, 16.23, -11], [192, 17, -22], [189.1, 17.77, -33], [181, 18.46, -41.1],   // Kehre 1 (links)
      [170, 19, -44], [139.3, 21.15, -44], [108.7, 23.85, -44], [78, 26, -44],
      [67, 26.4, -46.9], [58.9, 26.92, -55], [56, 27.5, -66], [58.9, 28.08, -77], [67, 28.6, -85.1],       // Kehre 2 (rechts)
      [78, 29, -88], [108.7, 31.46, -88], [139.3, 34.54, -88], [170, 37, -88],
      [181, 37.67, -90.9], [189.1, 38.54, -99], [192, 39.5, -110], [189.1, 40.46, -121], [181, 41.33, -129.1], // Kehre 3 (links)
      [170, 42, -132], [137.5, 44, -132]          // zurück auf die Passhöhe (Schluss vor Punkt 0)
    ]
  },
  {
    id: 'mondlicht-ring',
    name: 'Mondlicht-Ring',
    difficulty: 5,
    laps: 3,
    locked: false,
    theme: 'moonring',
    startOffset: 0,
    // Eisige Vollmondnacht: die längste und schwerste Strecke (~1,9 km). Start/Ziel auf der langen Geraden, die unter der
    // Brücke hindurchführt; dann Schikane, Mondfalle (enge Haarnadel-Linkskurve), Eselsrücken-Esses, Mondbogen mit Tunnel,
    // Schikane, Eis-Haarnadel und die lange Rampe hinauf auf die Brücke.
    scene: {
      PINES: 300, NEAR_PINES: 140, LEAFY: 0, POPLARS: 0, BUSHES: 0, ROCKS: 70, BUILDINGS: 0, SAND_PATCHES: 0, CLOUDS: 6, BIRDS: 0,
      WIND: 0.45, GRASS: 0, FLOWERS: 0, HAY: 0, TENTS: 0, CARAVANS: 0, TURBINES: 0, BALLOONS: 0, PONDS: 0, FIREFLIES: 160,
      BANK_K: 5.0, BANK_MAX: 0.17,
      MR_GATES: 7, MR_CRYSTALS: 14, MR_LANTERNS: 80, MR_SNOW: 300, MR_LAKE: true
    },
    points: [
      [190, 0.6, 0], [160, 0.6, 0], [130, 0.6, 0], [100, 0.6, 0],
      [70, 0.6, 0], [40, 0.6, 0], [10, 0.6, 0], [-20, 0.6, 0],
      [-50, 0.6, 0], [-80, 0.6, 0], [-110, 0.6, 0], [-122, 0.6, 0],
      [-134.01, 0.63, -0.13], [-145.85, 0.74, -2.06], [-157.11, 0.84, -6.24], [-167.34, 0.95, -12.51],
      [-176.18, 1.05, -20.63], [-183.29, 1.15, -30.31], [-188.4, 1.26, -41.17], [-191.32, 1.36, -52.82],
      [-191.94, 1.46, -64.81], [-190.24, 1.57, -76.69], [-186.28, 1.67, -88.02], [-180.21, 1.78, -98.38],
      [-172.26, 1.88, -107.37], [-162.72, 1.98, -114.67], [-152.34, 2.17, -120.69], [-141.95, 2.37, -126.69],
      [-131.76, 2.59, -132.92], [-124.5, 2.85, -142.13], [-121.1, 3.11, -153.45], [-114.55, 3.37, -163.19],
      [-104.61, 3.58, -169.7], [-77.78, 3.98, -185.19], [-50.95, 4.38, -200.68], [-24.11, 4.78, -216.18],
      [-12.86, 4.95, -222.67], [-6.63, 4.85, -225.92], [0.38, 4.52, -226.51], [6.88, 4.18, -223.85],
      [11.46, 3.84, -218.51], [13.11, 3.5, -211.68], [13.11, 4.1, -199.68], [13.11, 4.9, -183.68],
      [13.11, 5.5, -171.68], [12.19, 6.06, -158.89], [9.47, 6.61, -146.36], [5.15, 7.23, -134.27],
      [1.75, 7.97, -121.91], [0.14, 8.71, -109.18], [0, 9.49, -96.21], [0, 11.33, -66.06],
      [0, 12, -36], [0, 12, -6], [0, 12, 24], [0, 12, 54],
      [0, 9.97, 84], [0, 7.87, 114], [0, 5.84, 143], [0, 5, 155],
      [1.05, 4.85, 167.91], [4.17, 4.69, 180.48], [9.27, 4.54, 192.38], [16.23, 4.38, 203.3],
      [24.86, 4.23, 212.96], [34.93, 4.07, 221.1], [46.06, 4, 227.78], [72.04, 4, 242.78],
      [82.44, 4, 248.78], [92.84, 4.02, 254.8], [102.29, 4.24, 262.48], [109.34, 4.46, 272.41],
      [115.55, 5.06, 282.9], [124.27, 5.72, 291.4], [134.59, 6.12, 297.69], [160.59, 6.66, 312.7],
      [186.58, 7.2, 327.7], [212.57, 7.73, 342.71], [222.96, 7.95, 348.71], [231.24, 7.42, 352.31],
      [239.27, 6.65, 352], [246.37, 5.87, 348.21], [251.11, 5.1, 341.72], [254.22, 4.9, 333.26],
      [261.06, 4.65, 314.47], [265.16, 4.5, 303.19], [272.05, 3.88, 292.33], [282.44, 3.38, 284.63],
      [290.38, 3.07, 274.5], [294.96, 3, 262.35], [302.83, 3, 240.74], [306.93, 3, 229.46],
      [308.82, 2.83, 216.81], [305.59, 2.66, 204.42], [299.38, 2.5, 193.17], [297.31, 2.33, 180.55],
      [300.25, 2.19, 168.03], [310.55, 2.14, 139.73], [320.85, 2.09, 111.44], [331.15, 2.03, 83.14],
      [335.27, 2.01, 71.82], [338.91, 1.9, 60.38], [339.94, 1.71, 47.46], [337.6, 1.52, 34.71],
      [332.07, 1.33, 22.98], [323.71, 1.14, 13.07], [313.09, 0.95, 5.65], [300.91, 0.76, 1.2],
      [288, 0.6, 0], [258, 0.6, 0], [228, 0.6, 0], [198, 0.6, 0]
    ]
  }
];

const TRACK_KEY      = 'rennspiel_track_v1';        // zuletzt gewählte Strecke
const RECORDS_PREFIX = 'rennspiel_records_v2_';     // + Track-ID = Rekorde dieser Strecke
const AUTOSTART_KEY  = 'rennspiel_autostart';       // sessionStorage: nach Strecken-Wechsel (Reload) direkt starten
const trackUsable = t => !!t && !t.locked && Array.isArray(t.points) && t.points.length > 3;

let selTrack = (function () {
  let id = null;
  try { id = localStorage.getItem(TRACK_KEY); } catch (e) { /* ignorieren */ }
  const saved = TRACKS.find(t => t.id === id);
  return trackUsable(saved) ? saved : (TRACKS.find(trackUsable) || TRACKS[0]);
})();
let builtTrack = selTrack;      // Strecke, für die die 3D-Welt gebaut wurde (buildCurve liest daraus)

// ─── Szene-Einstellungen (hier lassen sich Umgebung und Dichte anpassen) ─────
const SCENE = {
  THEME:        'dusk',   // 'dusk' = Abendsonne, 'night' = Nacht mit Mond und Sternen
  PINES:        230,      // Kiefern (weit weg von der Strecke)
  NEAR_PINES:   150,      // Kiefern nahe der Strecke
  LEAFY:        70,       // Laubbäume
  POPLARS:      46,       // schlanke Pappeln
  BUSHES:       170,
  ROCKS:        120,
  BUILDINGS:    40,       // Stadt-Kulisse im Hintergrund
  SAND_PATCHES: 36,       // Sandflächen neben der Strecke
  CLOUDS:       12,
  BIRDS:        14,       // 0 = keine Vögel
  WIND:         1.0,      // Stärke der Wind-Animation bei Bäumen/Büschen (0 = aus)
  FENCES:       true,     // Holzzäune entlang gerader Abschnitte
  PIT_LANE:     true,     // Boxengasse vor den Garagen
  WARN_SIGNS:   true,     // Warnschilder vor engen Kurven
  APEX_KERBS:   true,     // zusätzliche rot-weisse Curbs an der Kurveninnenseite
  GRASS:        500,      // Grasbüschel (je 3 Halme)
  FLOWERS:      240,      // Blumengruppen
  HAY:          10,       // Heuballen-Pyramiden am Streckenrand
  MARSHALS:     8,        // Streckenposten-Häuschen mit Fahne
  FAN_GROUPS:   16,       // Zuschauergruppen hinter dem Zaun
  CONES:        true,     // Leitkegel an der Boxengasse
  TENTS:        10,       // Zelte (mit Laternen)
  CARAVANS:     8,        // Wohnwagen
  PONDS:        4,        // Teiche mit Schilf und Sonnenreflex
  TURBINES:     5,        // Windräder im Hintergrund
  BALLOONS:     3,        // Heissluftballons am Himmel
  FIREFLIES:    140,      // Glühwürmchen
  BANK_K:       4.0,      // Querneigung = Krümmung * BANK_K (begrenzt durch BANK_MAX)
  BANK_MAX:     0.13,
  TOWERS: 0, FAR_TOWERS: 0, SIGNS: 0,               // nur Neon-Stadt: Hochhäuser, Reklamen
  GANTRY_AT: [0.16, 0.34, 0.6, 0.8],                // Positionen der Torbögen (Anteil der Runde)
  FOOTBRIDGES: [], OVERHEADS: [],                   // Fussgängerbrücken, Hänge-Reklamen (Anteil der Runde)
  DRONES: 0, RAIN: 0, STEAM: 0, ZEPPELIN: false,    // lebendige Stadt: Flugautos, Regen, Dampf, Zeppelin
  ALP_PINES: 0, ALP_BUSHES: 0, ALP_ROCKS: 0, ALP_SPIRES: 0, ALP_FLOWERS: 0, ALP_SCREE: 0,   // nur Bergpass: Bergwelt
  ALP_CHALETS: 0, ALP_CHAPEL: false, ALP_GALLERY: false, ALP_WATERFALL: false,           // Hütten, Kapelle, Lawinengalerie, Wasserfall
  ALP_CABLEWAY: false, ALP_EAGLES: 0, ALP_SNOWFALL: 0, ALP_PENNANTS: false, ALP_POLES: 0, // Seilbahn, Adler, Schneeflocken, Wimpel, Schneestangen
  MR_GATES: 0, MR_CRYSTALS: 0, MR_LANTERNS: 0, MR_SNOW: 0, MR_LAKE: false                  // nur Mondlicht-Ring: Mondtore, Eiskristalle, Himmelslaternen, Schnee, zugefrorener See
};
// Pro-Strecke-Theming: Strecken dürfen `theme` und `scene` (Overrides) mitbringen. Ein Strecken-Wechsel lädt die Seite
// neu, daher genügt es, die Werte beim Laden zu bestimmen.
if (builtTrack.scene) Object.assign(SCENE, builtTrack.scene);
if (builtTrack.theme) SCENE.THEME = builtTrack.theme;
const THEMES = {
  dusk: {
    fog: 0x6a4a6e, fogDensity: 0.0036,
    sky: [[0, '#17235c'], [0.28, '#2c3c86'], [0.43, '#8a5ea2'], [0.492, '#ff9a62'], [0.508, '#ff9a62'], [0.545, '#6a4a6e'], [1, '#4a3552']],
    hemiSky: 0x9a9cd8, hemiGround: 0x3a2e38, hemiI: 1.05,
    sun: 0xffc690, sunI: 1.5,
    cloud: 0xffb0a0, cloudOp: 0.4,
    mtn: [['#6a5090', '#3a2d62'], ['#463a78', '#2c2456'], ['#2c2656', '#1c1838']],
    stars: 0.55, moon: false, sunVisible: true, birdColor: 0x120d18
  },
  night: {
    fog: 0x0b1330, fogDensity: 0.0042,
    sky: [[0, '#03050f'], [0.3, '#08102a'], [0.46, '#1a2c5c'], [0.5, '#2b4380'], [0.54, '#16244a'], [1, '#0b1330']],
    hemiSky: 0x5577aa, hemiGround: 0x141c24, hemiI: 1.0,
    sun: 0x9ab0d4, sunI: 1.1,
    cloud: 0x4a5f9a, cloudOp: 0.22,
    mtn: [['#2a3f78', '#101a3a'], ['#17244d', '#0b1330'], ['#0d1634', '#0a1028']],
    stars: 1, moon: true, sunVisible: false, birdColor: 0x05060c
  },
  moonring: {             // Mondlicht-Ring: eisige Vollmondnacht mit Polarlicht, Saturn-Mond und Frostlandschaft
    moonring: true, moon: true,
    fog: 0x0d1d44, fogDensity: 0.0034,
    sky: [[0, '#02040e'], [0.2, '#06103a'], [0.34, '#0c2a60'], [0.43, '#16477e'], [0.475, '#2c78a4'], [0.497, '#69b4cc'], [0.505, '#4f94b4'], [0.54, '#13365c'], [1, '#0a1630']],
    hemiSky: 0x8ab8ff, hemiGround: 0x1a2a46, hemiI: 1.15,
    sun: 0xbcd8ff, sunI: 1.4,
    ldir: [-48, 46, -58],
    cloud: 0x6f8fd0, cloudOp: 0.15,
    mtn: [['#e6f2ff', '#6384c4'], ['#c3d8f6', '#46659f'], ['#94b0e0', '#2e4a82']],
    mtnBase: '#10224a', mtnLit: '215,238,255',
    stars: 1, starCount: 900, moonScale: 1, sunVisible: false, birdColor: 0x05060c, firefly: 0x9fe8ff,
    kerb: ['#35c8ff', '#f4fcff'],
    seats: ['#3cc8ff', '#a8e4ff', '#6a7cff', '#e8f6ff'],
    chev: ['#08122c', '#6fe6ff', '#08122c'],
    march: [[90, 220, 255], [160, 240, 255], [235, 252, 255]],
    beam: 0x5a6e92, pier: 0x6a7ea6, emb: 0x7f95bd, embSlope: 0.9,
    tunEmi: 0x0e1d3a, tunOuter: 0x9db2d6, portal: 0x3c5484, lip: 0x34507e, tunRim: 0x5fd8ff, tunStrip: 0xbfeaff, tunStrip2: 0x6a8cff,
    house: 0xd6f0ff, pool: 0x8fd0ff, cone: 0x9fd8ff, glowTun: 0x8fd8ff, glowUnder: 0x7fb0ff,
    under: 0x6fb0ff, underI: 1.8, tunLight: 0xaed8ff, carGlow: 0x80b8ff, bar: [0x7fe0ff, 0xb48cff]
  },
  neon: {                 // Cyberpunk-Metropole im Regen-Nachglanz
    city: true,
    fog: 0x2e1254, fogDensity: 0.0047,
    sky: [[0, '#04020d'], [0.22, '#10053a'], [0.36, '#2a0d66'], [0.44, '#6d1a8e'], [0.478, '#c8268f'], [0.496, '#ff4fa8'], [0.504, '#2ee6ff'], [0.516, '#4a1a8a'], [0.56, '#1d0a44'], [1, '#080316']],
    hemiSky: 0x9a82ff, hemiGround: 0x2e1a54, hemiI: 1.25,
    sun: 0xff7fc4, sunI: 0.95, tunTint: 0x7f70b0,
    cloud: 0xc060d8, cloudOp: 0.2,
    mtn: [['#5a2096', '#1c0d44'], ['#38146c', '#140a38'], ['#200c48', '#0b0522']],   // Skyline-Ebenen (fern -> nah)
    stars: 0.3, moon: false, sunVisible: true, retroSun: true, birdColor: 0x05060c,
    ldir: [-80, 22, -40],
    kerb: ['#19e6ff', '#f4fcff'],
    seats: ['#ff2bd6', '#18e6ff', '#a65bff', '#ff8a1a'],
    chev: ['#0a0818', '#ff3d9a', '#0a0818'],
    march: [[24, 230, 255], [120, 240, 255], [225, 255, 255]],
    beam: 0x3c4160, pier: 0x2f3452, emb: 0x2a2e48, embSlope: 0.55,
    tunEmi: 0x1a0f33, tunOuter: 0x232845, portal: 0x2c3150, lip: 0x252a45, tunRim: 0xff2bd6, tunStrip: 0x18e6ff, tunStrip2: 0xa65bff,
    house: 0xcff6ff, pool: 0x9a6bff, cone: 0x7a5bff, glowTun: 0xb08cff, glowUnder: 0xff4fd8,
    under: 0xff2bd6, underI: 2.4, tunLight: 0xb59bff, carGlow: 0xa070ff,
    bar: [0x18e6ff, 0xff2bd6]
  },
  alpine: {                 // Bergpass: Alpenglühen am frühen Morgen, klare Luft, weicher Talnebel
    alpine: true,
    fog: 0xc6d2e6, fogDensity: 0.0019,
    sky: [[0, '#0a2a78'], [0.2, '#1a4a9e'], [0.35, '#4688d2'], [0.44, '#9fc6ee'], [0.482, '#ffd9b4'], [0.5, '#ffc08e'], [0.518, '#ffd8bc'], [0.56, '#c6d2e6'], [1, '#b2c2de']],
    hemiSky: 0xcfe0ff, hemiGround: 0x7a705e, hemiI: 1.1,
    sun: 0xffd2a0, sunI: 1.95,
    cloud: 0xffd9d2, cloudOp: 0.5,
    mtn: [['#fff0f4', '#8f9cc4'], ['#f4e6ee', '#7b86ad'], ['#e2dae6', '#6a7599']],      // Gipfel-Ebenen (fern -> nah): Schnee / Fels
    stars: 0, moon: false, sunVisible: true, birdColor: 0x2a2118,
    ldir: [86, 26, 44],                                        // flache Morgensonne aus Ost-Südost -> lange Schatten
    kerb: ['#d8352b', '#f6f3ea'],
    seats: ['#7a4e2c', '#a8743f', '#5e3a20', '#c18a52'],
    march: [[255, 150, 40], [255, 190, 90], [255, 240, 200]],
    beam: 0x8f8a7d, pier: 0x8a8578, emb: 0x4a5a34, embSlope: 1.2,
    tunEmi: 0x1a1308, tunOuter: 0x6b665c, portal: 0x7a746a, lip: 0x8c867a, tunRim: 0xffa23a, tunStrip: 0xffd9a0, tunStrip2: 0xff9a2a,
    house: 0xfff0c8, pool: 0xffc070, cone: 0xffd9a0, glowTun: 0xffb060, glowUnder: 0xffb060,
    under: 0xffa860, underI: 1.4, tunLight: 0xffc070, carGlow: 0x90a8ff,
    bar: [0xffb347, 0xffcf80]
  }
};
const THEME = THEMES[SCENE.THEME] || THEMES.dusk;
const CITY = !!THEME.city;                 // Neon-Stadt: Stadt-Geometrie statt Natur
const ALPINE = !!THEME.alpine;             // Bergpass: Höhengelände, Stein, Holz, Alpenglühen
const MOONRING = !!THEME.moonring;         // Mondlicht-Ring: Frostnacht mit Saturn-Mond, Polarlicht, Mondtoren
const MTN_Y = ALPINE ? 56 : 44;            // Höhe der Gipfel-Ebenen (folgen der Kamera)

// Boost (Shift)
const BOOST_SPEED       = MAX_SPEED * 1.15;
const BOOST_ACCEL       = 16;     // zusätzliche Beschleunigung
const BOOST_DRAIN       = 0.55;   // ≈ 1,8 s Dauer
const BOOST_REGEN       = 0.07;   // ≈ 14 s bis voll
const BOOST_REGEN_DELAY = 2.0;    // Pause nach dem Boosten (s)
const BOOST_MIN_START   = 0.4;    // nach Leerlauf erst ab 40 % wieder nutzbar

// Effekt-Einstellungen (zum Abschwächen Werte verkleinern, 0 = Effekt aus)
const FX = {
  BOOST_FOV_KICK: 9,      // kurzer FOV-Stoss beim Boost-Start (Grad)
  BOOST_LINES:    0.42,   // Deckkraft der Speedlines beim Boost
  SHAKE:          1.0,    // Kamera-Shake (Faktor)
  SKID_ALPHA:     0.6,    // Dunkelheit der Reifenspuren (0..1)
  SKID_LIFE:      16,     // Sekunden, bis eine Reifenspur verblasst ist
  SMOKE_STEP:     0.022,  // Sekunden zwischen zwei Rauchpuffs (höher = weniger Rauch)
  SMOKE_ALPHA:    0.4,    // maximale Deckkraft eines Rauchpuffs
  SPARKS:         1.0,    // Funken-Faktor
  CROWD_ANIM:     1.0     // Stärke der Publikums- und Fahnen-Animation
};

// Sound-Einstellungen (Lautstärken 0..1, Frequenzen in Hz)
const SFX = {
  MASTER:            0.55,    // Gesamtlautstärke
  SMOOTH:            0.06,    // Glättung der Motor-Parameter (s, größer = träger)
  ENGINE_VOL_IDLE:   0.05,    // Motor im Leerlauf
  ENGINE_VOL_MAX:    0.11,    // Motor bei Höchsttempo (vorher 0.17)
  ENGINE_HZ_IDLE:    46,      // Grundton im Leerlauf
  ENGINE_HZ_MAX:     150,     // Grundton bei Höchsttempo (vorher 175)
  ENGINE_BOOST_MULT: 1.15,    // Tonlage-Faktor beim Boost (vorher 1.3)
  ENGINE_CUTOFF_IDLE: 240,    // Tiefpass (Klangfarbe) im Leerlauf
  ENGINE_CUTOFF_MAX: 950,     // Tiefpass bei Höchsttempo (vorher 1500)
  ENGINE_Q:          1.0,     // Resonanz des Tiefpasses (vorher 3 = schrilles Pfeifen)
  ENGINE_DETUNE:     1.007,   // 3. Oszillator leicht verstimmt -> weicher, "lebendiger" Klang
  ENGINE_WOBBLE:     8,       // Tonhöhen-Zittern in Cent (verhindert den statischen Dauerton)
  ENGINE_OFFTHR:     0.72,    // Lautstärke-Faktor ohne Gas (Motor ist unter Last lauter)
  ENGINE_NOISE_VOL:  0.05,    // Luft-/Motorrauschen bei Höchsttempo
  HISS_VOL:          0.09,    // Zischen beim Boost
  HISS_HZ:           3200,
  SKID_VOL:          0.11,    // Reifenquietschen
  SKID_HZ:           1800,
  SCRAPE_VOL:        0.22,    // Schleifen an der Leitplanke (vorher 0.15)
  IMPACT_VOL:        0.5,     // Aufprall an der Leitplanke (Schlag + Krachen + metallisches Klingen)
  SCRAPE_HZ:         800,
  BEEP_HZ:           440,     // Countdown 3, 2, 1
  GO_HZ:             880,     // Countdown GO!
  BEEP_VOL:          0.22,
  BEEP_LEN:          0.16,
  GO_LEN:            0.5,
  NOTE_GAP:          0.09,    // Abstand der Jingle-Töne (s)
  NOTE_LEN:          0.14,
  LAP_VOL:           0.2,
  LAP_NOTES:         [659, 880],
  BEST_VOL:          0.22,
  BEST_NOTES:        [523, 659, 784, 1047],
  FINISH_VOL:        0.24,
  FINISH_NOTES:      [523, 523, 523, 784, 659, 784, 1047],
  FINISH_BEST_NOTES: [523, 659, 784, 1047, 784, 1047, 1319, 1047, 1319, 1568],
  EMPTY_HZ:          95,      // "Boost leer"
  EMPTY_VOL:         0.25,
  KEEPALIVE_VOL:     0.002    // unhörbares Dauer-Rauschen, damit der Ausgang nicht wieder einschläft
};

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = i => ((i % N) + N) % N;
const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const wrapIdx = d => { d = mod(d); return d > N / 2 ? d - N : d; };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function setText(el, s) {
  if (el && el._t !== s) { el._t = s; el.textContent = s; }
}

function formatTime(ms) {
  const t = Math.max(0, Math.floor(ms / 100));   // Zehntelsekunden
  const m = Math.floor(t / 600);
  const sec = (t % 600) / 10;
  return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(1);
}

// ─── Globale Zustände ─────────────────────────────────────────────────────────
let scene, camera, renderer, container;
let curve, trackLen, DS;
let ROAD_VLEN = 10, KERB_VLEN = 4;
let maxAniso = 4, pixelRatio = 1;
let fovAspectBonus = 0;       // zusätzlicher vertikaler FOV bei schmalen Fenstern (aspect < 1.4)
let fxClock = 0;              // Effekt-Uhr in Sekunden (läuft nicht in der Pause)
let camFovBase = 62, fovKick = 0, prevBoostOn = false;
const crowdUni = { time: { value: 0 }, amp: { value: 1 } };   // gemeinsame Shader-Uniforms für Publikum und Fahnen
let flameK = 0, boostGlow = null;
let skidMesh = null, skidPos = null, skidI = null, skidBorn = null, skNext = 0;
let smokeTex = null, marchTex = null;
const standSpots = [], gantrySpots = [], crowdList = [];
let MR_LAKE = null;     // zugefrorener See (Mondlicht-Ring): wird vor der Szenerie festgelegt, damit dort keine Bäume stehen
const solids = [];     // feste Hindernisse (Brückenpfeiler): orientierte Boxen im Grundriss, gelten nur unterhalb von top
function addSolid(f, cx, cz, hw, hd, top) {
  solids.push({ x: cx, z: cz, lhx: f.Lh.x, lhz: f.Lh.z, thx: f.Th.x, thz: f.Th.z, hw, hd, top, r2: Math.pow(Math.hypot(hw, hd) + CAR_R + 1, 2) });
}
const frames = [];
let crossing = null, bridgeR = null, underR = null, tunnelR = null;

let car, moon, tunnelLight, carGlow, underLight;
const carWheels = [];
const carUp = new THREE.Vector3(0, 1, 0);
const exhaustPool = [];
let exhaustNext = 0, exhaustTimer = 0;

const keys = {};
let state = 'menu';       // menu | countdown | racing | paused | finished
let lastFrame = 0, fpsFrames = 0, fpsTime = 0;
let loopStarted = false;
let toastHideAt = 0, lastCdText = '';
let toastPhase = 0, toastCur = null;       // 0 = frei, 1 = sichtbar, 2 = gleitet aus
const toastQueue = [];

const cs  = { x: 0, z: 0, y: 0, angle: 0, speed: 0, steer: 0, idx: 0, braking: false, pitch: 0 };
const boost = { energy: 1, on: false, locked: false, idle: 0 };
let mountains = null, brakeGlow = null, underGlow = null;
const windUni = { value: SCENE.WIND };      // Wind-Stärke für Bäume/Büsche (Vertex-Shader)
const cloudSprites = [];                    // driften langsam um die Kamera
let birdMesh = null;
const sceneryPts = [];                     // x,z-Paare aller gestreuten Bäume/Büsche/Steine
const birdData = [];
const carFlames = [];
let skyGroup = null, speedLines = null, quality = 2;
const smokePool = [], carSteerPivots = [], carTailGlows = [];
let smokeNext = 0, smokeTimer = 0;
const trk = { i: 0, d: 0, py: 0, tanB: 0, thx: 0, thz: 1, lhx: 1, lhz: 0, up: new THREE.Vector3(0, 1, 0) };
const race = {
  startWall: 0, pausedAccum: 0, pauseStart: 0, cdStart: 0, goHideAt: 0,
  progress: 0, maxProgress: 0, prevIdx: 0, cp: 0, lapStart: 0,
  laps: [], wrongTimer: 0, finalTime: 0, lapRecord: false
};
let best = { total: null, lap: null };

const IDQ = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);

// ─── Rekorde (localStorage, pro Strecke getrennt) ─────────────────────────────
// Key je Strecke: RECORDS_PREFIX + Track-ID. Der gesamte Speicherzugriff steckt in loadRecords / saveRecords / clearRecords.
// Für Supabase o. Ä. nur diese drei Funktionen austauschen (Rückgabewerte: { total, lap } in ms oder null).
const validTime = v => Number.isFinite(v) && v > 0 ? v : null;
const recKey = id => RECORDS_PREFIX + id;

function loadRecords(id) {
  id = id || selTrack.id;
  const empty = { total: null, lap: null };
  try {
    let raw = localStorage.getItem(recKey(id));
    // Rekorde aus der Zeit vor den Strecken gehören zur ersten Strecke (einmalige Übernahme)
    if (!raw && id === TRACKS[0].id) raw = localStorage.getItem(RECORDS_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return empty;
    const o = JSON.parse(raw);
    return { total: validTime(o && o.total), lap: validTime(o && o.lap) };
  } catch (e) { return empty; }          // kein Speicher / defekte Daten: Spiel läuft ohne Rekorde weiter
}
function saveRecords(rec, id) {
  id = id || selTrack.id;
  try {
    localStorage.setItem(recKey(id), JSON.stringify({ v: 2, total: rec.total, lap: rec.lap }));
    return true;
  } catch (e) { return false; }          // z. B. privater Modus: still ignorieren
}
function clearRecords(id) {
  id = id || selTrack.id;
  try {
    localStorage.removeItem(recKey(id));
    if (id === TRACKS[0].id) { localStorage.removeItem(RECORDS_KEY); localStorage.removeItem(LEGACY_KEY); }
  } catch (e) { /* ignorieren */ }
}
// Setzt nur die gewählte Strecke zurück; die Rückfrage übernimmt das Menü (Rekorde-Karte)
function resetRecords() {
  best = { total: null, lap: null };
  clearRecords();
  updateBestDisplay();
}

// ─── Einstellungen (localStorage): Qualität, Lautstärke, Tastenbelegung, Kamera ──
// Alles liegt in einem JSON-Objekt unter SETTINGS_KEY. Fehlende oder defekte Werte fallen auf die Standardwerte zurück.
const SETTINGS_KEY = 'rennspiel_settings_v1';
const QUALITY_MODES = ['auto', 'high', 'medium', 'low'];
const QUALITY_NAMES = { auto: 'Auto', high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };
const QUALITY_LEVEL = { high: 2, medium: 1, low: 0 };      // interne Stufe (siehe setQuality)
const QUALITY_INFO = {
  auto:   'Passt sich automatisch deinem Gerät an.',
  high:   'Beste Optik – für starke Geräte.',
  medium: 'Weniger Details für bessere Leistung.',
  low:    'Wenig Details für die beste Leistung – ideal für schwache Geräte.'
};
// Kamera-Modi (Reihenfolge = Reihenfolge beim Umschalten)
const CAM_MODES = [
  { id: 'chase',   name: 'Verfolger',     info: 'Standard: Kamera hinter dem Auto.' },
  { id: 'cockpit', name: 'Cockpit',       info: 'Blick aus dem Helm des Fahrers.' },
  { id: 'heli',    name: 'Helikopter',    info: 'Von oben schräg hinter dem Auto, schwebt leicht.' }
];
// Belegbare Aktionen: je zwei Tasten (physische Tastencodes, unabhängig vom Tastaturlayout)
const ACTIONS = [
  { id: 'up',     label: 'Gas',                def: ['KeyW', 'ArrowUp'] },
  { id: 'down',   label: 'Bremse / Rückwärts', def: ['KeyS', 'ArrowDown'] },
  { id: 'left',   label: 'Links lenken',       def: ['KeyA', 'ArrowLeft'] },
  { id: 'right',  label: 'Rechts lenken',      def: ['KeyD', 'ArrowRight'] },
  { id: 'boost',  label: 'Boost',              def: ['ShiftLeft', 'ShiftRight'] },
  { id: 'camera', label: 'Kamera wechseln',    def: ['KeyC', ''] },
  { id: 'pause',  label: 'Pause',              def: ['KeyP', 'Escape'] },
  { id: 'mute',   label: 'Ton an/aus',         def: ['KeyM', ''] }
];

const settings = { quality: 'auto', volume: 1, camera: 0, keys: {} };
const defaultKeys = () => { const k = {}; ACTIONS.forEach(a => { k[a.id] = a.def.slice(); }); return k; };

function loadSettings() {
  settings.keys = defaultKeys();
  try {
    const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!o || typeof o !== 'object') return;
    if (QUALITY_MODES.indexOf(o.quality) >= 0) settings.quality = o.quality;
    if (typeof o.volume === 'number' && Number.isFinite(o.volume)) settings.volume = clamp(o.volume, 0, 1);
    if (Number.isInteger(o.camera) && o.camera >= 0 && o.camera < CAM_MODES.length) settings.camera = o.camera;
  } catch (e) { /* kein Speicher / defekte Daten: Standardwerte */ }
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ v: 1, quality: settings.quality, volume: settings.volume, camera: settings.camera }));
  } catch (e) { /* z. B. privater Modus: still ignorieren */ }
}

// Ist eine der Tasten der Aktion gerade gedrückt? / Gehört dieser Tastencode zur Aktion?
const act = id => { const k = settings.keys[id]; return !!((k[0] && keys[k[0]]) || (k[1] && keys[k[1]])); };
const isBound = (id, code) => !!code && settings.keys[id].indexOf(code) >= 0;

// Tastennamen: Sondertasten fest, Buchstaben über die Layout-Tabelle des Browsers (QWERTZ: Y/Z stimmen dann)
let kbLayout = null;
const KEY_NAMES = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Leertaste', Enter: 'Enter', NumpadEnter: 'Num Enter',
  Escape: 'Esc', Backspace: '⌫', Delete: 'Entf', Insert: 'Einfg', Home: 'Pos1', End: 'Ende', PageUp: 'Bild ↑', PageDown: 'Bild ↓',
  ShiftLeft: 'Shift L', ShiftRight: 'Shift R', ControlLeft: 'Strg L', ControlRight: 'Strg R', AltLeft: 'Alt L', AltRight: 'Alt R',
  CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', IntlBackslash: '<'
};
function keyLabel(code) {
  if (!code) return '–';
  if (kbLayout) {
    const ch = kbLayout.get(code);
    if (ch && ch.length === 1 && ch !== ' ') return ch.toUpperCase();
  }
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6).replace('Multiply', '*').replace('Add', '+').replace('Subtract', '−').replace('Divide', '/').replace('Decimal', ',');
  return code;
}
// Kurzname für Hinweise: Links-/Rechts-Paare (Shift L + Shift R) werden zu einem Namen
function hintLabel(id) {
  const k = settings.keys[id].filter(Boolean);
  if (!k.length) return '–';
  const base = c => c.replace(/(Left|Right)$/, '');
  if (k.length === 2 && k[0] !== k[1] && base(k[0]) === base(k[1])) return keyLabel(k[0]).replace(/ [LR]$/, '');
  return keyLabel(k[0]);
}

// ─── Sound (Web Audio API, alles per Code – keine externen Dateien) ──────────
const SOUND_KEY = 'rennspiel3d_sound_v1';
let actx = null, sfxOk = true, sfxMuted = false, sfxAcc = 0, sfxAway = false;
const sfx = {};                 // dauerhafte Nodes, einmal erzeugt und wiederverwendet
const sfxPending = [];          // Töne, die kamen, bevor der AudioContext lief (werden nachgeholt)
let sfxWallFree = 1, sfxWallHold = 0, sfxRetry = 0;   // Leitplanke: Zeit seit letztem Kontakt / Zeit im Dauerkontakt

function loadMuted() {
  try { return localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { return false; }
}
function saveMuted() {
  try { localStorage.setItem(SOUND_KEY, sfxMuted ? '1' : '0'); } catch (e) { /* ignorieren */ }
}

function applyMuteUI() {
  const b = $('muteBtn');
  if (!b) return;
  b.classList.toggle('muted', sfxMuted);
  b.setAttribute('aria-pressed', sfxMuted ? 'true' : 'false');
  const mk = hintLabel('mute'), sfx_ = mk === '–' ? '' : ' (' + mk + ')';
  b.title = (sfxMuted ? 'Ton an' : 'Ton aus') + sfx_;
  const sb = $('setMuteBtn');
  if (sb) {
    sb.setAttribute('aria-checked', sfxMuted ? 'false' : 'true');
    const sl = sb.querySelector('.sw-label');
    if (sl) sl.textContent = sfxMuted ? 'Ton aus' : 'Ton an';
  }
}
function setMuted(m) {
  sfxMuted = m;
  saveMuted();
  if (actx && sfx.master) sfx.master.gain.setTargetAtTime(m ? 0 : masterVol(), actx.currentTime, 0.03);
  applyMuteUI();
}
function masterVol() { return SFX.MASTER * settings.volume; }
function applyVolume() {
  if (actx && sfx.master && !sfxMuted) sfx.master.gain.setTargetAtTime(masterVol(), actx.currentTime, 0.03);
}
function toggleMute() { audioInit(); setMuted(!sfxMuted); }

// Erst nach einer Nutzeraktion erstellen bzw. fortsetzen; ohne Web Audio läuft das Spiel stumm weiter
function audioInit() {
  if (!sfxOk) return;
  try {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { sfxOk = false; return; }
      actx = new AC();
      actx.onstatechange = sfxFlush;      // sobald der Context läuft, ausstehende Töne abspielen
      buildAudio();
      try {                               // stiller 1-Sample-Puffer: öffnet den Ausgang sicher (Safari/iOS-Unlock)
        const ub = actx.createBuffer(1, 1, 22050), us = actx.createBufferSource();
        us.buffer = ub; us.connect(actx.destination); us.start(0);
      } catch (e2) { /* ignorieren */ }
    }
    audioResume();
  } catch (e) { sfxOk = false; actx = null; }
}
function audioResume() {
  sfxAway = false;
  if (actx && actx.state !== 'running') {
    try { const p = actx.resume(); if (p && p.then) p.then(sfxFlush, function () {}); } catch (e) { /* ignorieren */ }
  }
}
function sfxDefer(fn) {                         // Context startet noch (erster Klick): Ton kurz vormerken
  if (!actx || sfxAway) return;
  sfxPending.push({ fn: fn, at: performance.now() });
  if (sfxPending.length > 8) sfxPending.shift();
  audioResume();
}
function sfxFlush() {
  if (!actx || actx.state !== 'running' || !sfxPending.length) return;
  const now = performance.now(), q = sfxPending.splice(0);
  q.forEach(function (e) { if (now - e.at < 1500) e.fn(); });
}
function audioSilence() {                       // alle Dauerklänge weich auf 0
  if (!actx || !sfx.eGain) return;
  const t = actx.currentTime;
  sfx.eGain.gain.setTargetAtTime(0, t, 0.015);
  sfx.eNoise.gain.setTargetAtTime(0, t, 0.015);
  sfx.hiss.gain.setTargetAtTime(0, t, 0.015);
  sfx.skid.gain.setTargetAtTime(0, t, 0.015);
  sfx.scrape.gain.setTargetAtTime(0, t, 0.015);
}
function audioAway() {                          // Tab-Wechsel / Fokusverlust: leise, dann Context anhalten
  sfxAway = true;
  audioSilence();
  if (!actx) return;
  setTimeout(function () {
    if (!sfxAway || !actx || actx.state !== 'running') return;
    try { const p = actx.suspend(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignorieren */ }
  }, 120);
}

function buildAudio() {
  const c = actx;
  sfx.master = c.createGain();
  sfx.master.gain.value = sfxMuted ? 0 : masterVol();
  if (c.createDynamicsCompressor) {             // sanfter Limiter gegen Übersteuern
    const comp = c.createDynamicsCompressor();
    sfx.master.connect(comp); comp.connect(c.destination);
  } else sfx.master.connect(c.destination);

  // Motor: 2 leicht verstimmte Sägezähne + Sub-Rechteck -> Tiefpass -> Tremolo -> Gain
  // (laufen dauerhaft, nur Parameter ändern sich). Zwei langsame LFOs lassen die Tonhöhe leicht
  // "arbeiten", damit Dauer-Vollgas nicht wie ein starrer Brummton klingt.
  sfx.e1 = c.createOscillator(); sfx.e1.type = 'sawtooth'; sfx.e1.frequency.value = SFX.ENGINE_HZ_IDLE;
  sfx.e2 = c.createOscillator(); sfx.e2.type = 'square';   sfx.e2.frequency.value = SFX.ENGINE_HZ_IDLE * 0.5;
  sfx.e3 = c.createOscillator(); sfx.e3.type = 'sawtooth'; sfx.e3.frequency.value = SFX.ENGINE_HZ_IDLE * SFX.ENGINE_DETUNE;
  const m1 = c.createGain(); m1.gain.value = 0.5;
  const m2 = c.createGain(); m2.gain.value = 0.35;
  const m3 = c.createGain(); m3.gain.value = 0.3;
  sfx.eFilter = c.createBiquadFilter(); sfx.eFilter.type = 'lowpass';
  sfx.eFilter.frequency.value = SFX.ENGINE_CUTOFF_IDLE; sfx.eFilter.Q.value = SFX.ENGINE_Q;
  sfx.eTrem = c.createGain(); sfx.eTrem.gain.value = 1;
  sfx.eGain = c.createGain(); sfx.eGain.gain.value = 0;
  sfx.e1.connect(m1); sfx.e2.connect(m2); sfx.e3.connect(m3);
  m1.connect(sfx.eFilter); m2.connect(sfx.eFilter); m3.connect(sfx.eFilter);
  sfx.eFilter.connect(sfx.eTrem); sfx.eTrem.connect(sfx.eGain); sfx.eGain.connect(sfx.master);
  const wob = c.createGain(); wob.gain.value = SFX.ENGINE_WOBBLE;           // Cent
  const lfoA = c.createOscillator(); lfoA.type = 'sine'; lfoA.frequency.value = 5.7;
  const lfoB = c.createOscillator(); lfoB.type = 'sine'; lfoB.frequency.value = 8.3;
  const lfoC = c.createOscillator(); lfoC.type = 'sine'; lfoC.frequency.value = 0.31;
  const lfoCg = c.createGain(); lfoCg.gain.value = SFX.ENGINE_WOBBLE * 1.2;
  lfoA.connect(wob); lfoB.connect(wob); lfoC.connect(lfoCg);
  [sfx.e1, sfx.e2, sfx.e3].forEach(o => { wob.connect(o.detune); lfoCg.connect(o.detune); });
  const lfoT = c.createOscillator(); lfoT.type = 'sine'; lfoT.frequency.value = 11;   // leichtes Tremolo
  const lfoTg = c.createGain(); lfoTg.gain.value = 0.05;
  lfoT.connect(lfoTg); lfoTg.connect(sfx.eTrem.gain);
  sfx.e1.start(); sfx.e2.start(); sfx.e3.start();
  lfoA.start(); lfoB.start(); lfoC.start(); lfoT.start();

  // Rauschen: 2 s Puffer, je Klang eine geloopte Quelle
  const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  sfx.nb = nb;
  const noiseSrc = () => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; return s; };
  const bandpass = (hz, q) => { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hz; f.Q.value = q; return f; };

  // Boost-Zischen
  const hs = noiseSrc(), hf = bandpass(SFX.HISS_HZ, 0.7);
  sfx.hiss = c.createGain(); sfx.hiss.gain.value = 0;
  hs.connect(hf); hf.connect(sfx.hiss); sfx.hiss.connect(sfx.master); hs.start();

  // Reifenquietschen (schmalbandiges Rauschen)
  const ks = noiseSrc();
  sfx.skidF = bandpass(SFX.SKID_HZ, 7);
  sfx.skid = c.createGain(); sfx.skid.gain.value = 0;
  ks.connect(sfx.skidF); sfx.skidF.connect(sfx.skid); sfx.skid.connect(sfx.master); ks.start();

  // Wandschleifen: Rauschen, per LFO rau zerhackt (modGain schwingt zwischen 0 und 1)
  const ss = noiseSrc(), sf = bandpass(SFX.SCRAPE_HZ, 1.2);
  const mod = c.createGain(); mod.gain.value = 0.5;
  const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 31;
  const lfoAmp = c.createGain(); lfoAmp.gain.value = 0.5;
  sfx.scrape = c.createGain(); sfx.scrape.gain.value = 0;
  ss.connect(sf); sf.connect(mod); mod.connect(sfx.scrape); sfx.scrape.connect(sfx.master);
  lfo.connect(lfoAmp); lfoAmp.connect(mod.gain);
  // zusätzlich ein helles, metallisches Kreischen (folgt dem Tempo), läuft durch denselben Zerhacker
  const hs2 = noiseSrc(), hiMix = c.createGain(); hiMix.gain.value = 0.6;
  sfx.scrapeHiF = bandpass(2400, 6);
  hs2.connect(sfx.scrapeHiF); sfx.scrapeHiF.connect(hiMix); hiMix.connect(mod);
  ss.start(); lfo.start(); hs2.start(0, 0.7);
  // unhörbares Dauer-Rauschen (ca. -55 dB): hält Bluetooth-/Lautsprecher-Ausgänge wach
  const ka = noiseSrc(), kg = c.createGain(); kg.gain.value = SFX.KEEPALIVE_VOL;
  ka.connect(kg); kg.connect(sfx.master); ka.start(0, 0.3);

  // Luft-/Motorrauschen: legt sich über den Grundton und macht Dauer-Vollgas weniger "rein"
  const ns = noiseSrc();
  sfx.eNoiseF = bandpass(500, 0.6);
  sfx.eNoise = c.createGain(); sfx.eNoise.gain.value = 0;
  ns.connect(sfx.eNoiseF); sfx.eNoiseF.connect(sfx.eNoise); sfx.eNoise.connect(sfx.master); ns.start();
}

// Dauerklänge: Parameter nur weich (setTargetAtTime), ca. 33x pro Sekunde
function updateAudio(dt) {
  if (actx && actx.state !== 'running' && !sfxAway && (state === 'countdown' || state === 'racing')) {   // Resume erneut versuchen
    sfxRetry -= dt;
    if (sfxRetry <= 0) { sfxRetry = 0.4; audioResume(); }
  }
  if (!actx || actx.state !== 'running' || !sfx.eGain) return;
  sfxAcc += dt;
  if (sfxAcc < 0.03) return;
  const step = sfxAcc;
  sfxAcc = 0;
  const t = actx.currentTime, k = SFX.SMOOTH;
  const live = state === 'racing' || state === 'countdown' || state === 'finished';
  const racing = state === 'racing';
  const sp = Math.abs(cs.speed), fr = clamp(sp / MAX_SPEED, 0, 1.3);

  // Motor: Tonhöhe und Lautstärke folgen dem Tempo; Boost = höhere Lage + Zischen.
  // Ohne Gas klingt der Motor leiser und dumpfer (Lastwechsel), dazu kommt tempoabhängiges Rauschen.
  if (live) {
    const frc = Math.min(fr, 1);
    const load = racing && (act('up') || boost.on) ? 1 : SFX.ENGINE_OFFTHR;
    const hz = (SFX.ENGINE_HZ_IDLE + (SFX.ENGINE_HZ_MAX - SFX.ENGINE_HZ_IDLE) * frc) * (boost.on ? SFX.ENGINE_BOOST_MULT : 1);
    const fin = state === 'finished' ? 0.6 : 1;
    const vol = (SFX.ENGINE_VOL_IDLE + (SFX.ENGINE_VOL_MAX - SFX.ENGINE_VOL_IDLE) * frc) * fin * load;
    sfx.e1.frequency.setTargetAtTime(hz, t, k);
    sfx.e2.frequency.setTargetAtTime(hz * 0.5, t, k);
    sfx.e3.frequency.setTargetAtTime(hz * SFX.ENGINE_DETUNE, t, k);
    sfx.eFilter.frequency.setTargetAtTime((SFX.ENGINE_CUTOFF_IDLE + (SFX.ENGINE_CUTOFF_MAX - SFX.ENGINE_CUTOFF_IDLE) * frc) * (0.75 + 0.25 * load), t, k);
    sfx.eGain.gain.setTargetAtTime(vol, t, k);
    sfx.eNoise.gain.setTargetAtTime(SFX.ENGINE_NOISE_VOL * frc * frc * fin, t, 0.1);
    sfx.eNoiseF.frequency.setTargetAtTime(350 + 700 * frc, t, 0.1);
  } else {
    sfx.eGain.gain.setTargetAtTime(0, t, 0.05);
    sfx.eNoise.gain.setTargetAtTime(0, t, 0.05);
  }
  sfx.hiss.gain.setTargetAtTime(live && boost.on ? SFX.HISS_VOL : 0, t, 0.05);

  // Quietschen: gleiche Bedingungen wie slide/brake/drift in updateFx (aber unabhängig von der Grafik-Qualität)
  const brake = racing && cs.braking && sp > 8;
  const drift = racing && sp > 16 && Math.abs(cs.steer) > 0.6;
  const slide = racing && sp > 14 && (Math.abs(cs.steer) > 0.65 || (cs.braking && sp > 18));
  sfx.skid.gain.setTargetAtTime(slide || brake || drift ? SFX.SKID_VOL * clamp(sp / MAX_SPEED, 0.25, 1.2) : 0, t, 0.04);
  sfx.skidF.frequency.setTargetAtTime(SFX.SKID_HZ * (0.8 + 0.5 * fr), t, 0.08);

  // Leitplanke: Aufprall (einmal pro Kontakt, ab 0,12 s Pause) + Schleifen; im Dauerkontakt leises Rumpeln
  const wall = racing && sp > 4 && Math.abs(trk.d) > WALL_LIMIT - 0.05;
  if (wall) {
    if (sfxWallFree > 0.12) { sfxImpact(clamp(sp / MAX_SPEED, 0.2, 1.2)); sfxWallHold = 0; }
    else if ((sfxWallHold += step) > 0.5) { sfxImpact(0.35 * clamp(sp / MAX_SPEED, 0.3, 1)); sfxWallHold = 0; }
    sfxWallFree = 0;
  } else sfxWallFree += step;
  sfx.scrape.gain.setTargetAtTime(wall && sp > 6 ? SFX.SCRAPE_VOL * clamp(sp / MAX_SPEED, 0.3, 1) : 0, t, 0.03);
  sfx.scrapeHiF.frequency.setTargetAtTime(1800 + 1800 * clamp(fr, 0, 1), t, 0.1);
}

// Einzeltöne (nur bei Ereignissen, je Ton ein kurzlebiger Oszillator)
function sfxTone(freq, delay, dur, type, vol, toFreq) {
  if (!actx || !sfx.master || sfxMuted) return;
  if (actx.state !== 'running') { sfxDefer(function () { sfxTone(freq, delay, dur, type, vol, toFreq); }); return; }
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.setValueAtTime(vol, t + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfx.master);
  o.start(t); o.stop(t + dur + 0.03);
  o.onended = function () { o.disconnect(); g.disconnect(); };
}
// Aufprall an der Leitplanke: dumpfer Schlag + Krachen (Rauschstoß) + kurzes metallisches Klingen
function sfxImpact(strength) {
  if (!actx || !sfx.master || sfxMuted || actx.state !== 'running' || !sfx.nb) return;
  const c = actx, t = c.currentTime, V = SFX.IMPACT_VOL * clamp(strength, 0.15, 1.2);
  const done = function (src, nodes) { src.onended = function () { nodes.forEach(function (n) { n.disconnect(); }); }; };
  // 1) Schlag
  const o = c.createOscillator(), og = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
  og.gain.setValueAtTime(V, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(og); og.connect(sfx.master); o.start(t); o.stop(t + 0.26); done(o, [o, og]);
  // 2) Krachen
  const ns = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
  ns.buffer = sfx.nb; nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.8;
  ng.gain.setValueAtTime(V * 0.9, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  ns.connect(nf); nf.connect(ng); ng.connect(sfx.master); ns.start(t, Math.random() * 1.5); ns.stop(t + 0.3); done(ns, [ns, nf, ng]);
  // 3) Metall-Klingen (unharmonische Teiltöne, leicht zufällig verstimmt)
  [[610, 0.30, 0.40], [1130, 0.20, 0.30], [1790, 0.12, 0.20]].forEach(function (p) {
    const m = c.createOscillator(), mg = c.createGain();
    m.type = 'triangle'; m.frequency.value = p[0] * (0.97 + Math.random() * 0.06);
    mg.gain.setValueAtTime(V * p[1], t); mg.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
    m.connect(mg); mg.connect(sfx.master); m.start(t); m.stop(t + p[2] + 0.02); done(m, [m, mg]);
  });
}
function sfxMelody(notes, vol) {
  for (let i = 0; i < notes.length; i++) {
    const last = i === notes.length - 1;
    const len = SFX.NOTE_LEN * (last ? 3 : 1);
    sfxTone(notes[i], i * SFX.NOTE_GAP, len, 'square', vol);
    sfxTone(notes[i] * 0.5, i * SFX.NOTE_GAP, len, 'triangle', vol * 0.8);
  }
}
function sfxCountdown(text) {
  if (text === 'GO!') sfxTone(SFX.GO_HZ, 0, SFX.GO_LEN, 'square', SFX.BEEP_VOL * 1.1);
  else sfxTone(SFX.BEEP_HZ, 0, SFX.BEEP_LEN, 'square', SFX.BEEP_VOL);
}
function sfxLap(isBest) { sfxMelody(isBest ? SFX.BEST_NOTES : SFX.LAP_NOTES, isBest ? SFX.BEST_VOL : SFX.LAP_VOL); }
function sfxFinish(newBest) { sfxMelody(newBest ? SFX.FINISH_BEST_NOTES : SFX.FINISH_NOTES, SFX.FINISH_VOL); }
function sfxBoostEmpty() { sfxTone(SFX.EMPTY_HZ, 0, 0.22, 'sawtooth', SFX.EMPTY_VOL, SFX.EMPTY_HZ * 0.7); }

// ─── Texturen (Canvas) ────────────────────────────────────────────────────────
function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d') };
}
function toTexture(c, repeatT) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = repeatT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = maxAniso;
  return t;
}

function makeCheckerTexture() {
  const { c, g } = newCanvas(128, 32);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 16; k++) {
    g.fillStyle = (r + k) % 2 === 0 ? '#f4f4f4' : '#111111';
    g.fillRect(k * 8, r * 8, 8, 8);
  }
  return toTexture(c, false);
}

function makeBannerTexture() {
  const { c, g } = newCanvas(512, 96);
  g.fillStyle = '#0c1020'; g.fillRect(0, 0, 512, 96);
  for (let k = 0; k < 64; k++) {
    g.fillStyle = k % 2 === 0 ? '#f4f4f4' : '#d01830';
    g.fillRect(k * 8, 0, 8, 8); g.fillRect(k * 8, 88, 8, 8);
  }
  g.fillStyle = '#ffffff'; g.font = 'bold 54px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('START / ZIEL', 256, 50);
  return toTexture(c, false);
}

function makeSeatTexture() {
  const { c, g } = newCanvas(8, 64);
  const cols = THEME.seats || ['#d22a2a', '#2a46d2', '#eeeeee', '#e8c820'];
  for (let k = 0; k < 4; k++) { g.fillStyle = cols[k]; g.fillRect(0, k * 16, 8, 16); }
  return toTexture(c, true);
}

function makeGlowTexture() {
  const { c, g } = newCanvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,240,200,0.55)');
  gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

// ─── Rauschen & Geometrie-Helfer ──────────────────────────────────────────────
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { return vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.2; }
const smooth01 = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// mehrere indizierte Geometrien (position/normal/uv) zu einer zusammenfassen
function mergeGeos(list) {
  let nv = 0, ni = 0;
  list.forEach(g => { nv += g.attributes.position.count; ni += g.index.count; });
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv < 65535 ? new Uint16Array(ni) : new Uint32Array(ni);
  let vo = 0, io = 0;
  list.forEach(g => {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count; io += g.index.count;
  });
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

let _glowTex = null;
function getGlowTex() { return _glowTex || (_glowTex = makeGlowTexture()); }
function glowPoints(arr, size, color, opacity) {
  if (!arr.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    size, map: getGlowTex(), transparent: true, depthWrite: false, opacity: opacity || 1,
    blending: THREE.AdditiveBlending, color: color || 0xfff0c8
  }));
  p.frustumCulled = false;
  scene.add(p);
  return p;
}
// Zeichnet fn an (x, y) und an den verschobenen Kopien, damit Texturen nahtlos kacheln
function drawWrapped(S, x, y, r, fn) {
  for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
    const px = x + ox, py = y + oy;
    if (px + r < 0 || px - r > S || py + r < 0 || py - r > S) continue;
    fn(px, py);
  }
}
function blob(g, x, y, r, rgb, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
  gr.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}
function crack(g, rnd, x, y, len, depth) {
  g.beginPath(); g.moveTo(x, y);
  let a = Math.PI / 2 + (rnd() - 0.5) * 1.6;
  for (let s = 0; s < len; s++) {
    a += (rnd() - 0.5) * 0.9;
    x += Math.cos(a) * (4 + rnd() * 8); y += Math.sin(a) * (4 + rnd() * 8);
    g.lineTo(x, y);
    if (depth > 0 && rnd() < 0.18) { const sx = x, sy = y; g.stroke(); crack(g, rnd, sx, sy, 3 + (rnd() * 4 | 0), depth - 1); g.beginPath(); g.moveTo(sx, sy); }
  }
  g.stroke();
}

// ─── Texturen (detailliert) ───────────────────────────────────────────────────
function makeRoadTexture() {
  const S = 512;
  const { c, g } = newCanvas(S, S);
  g.fillStyle = '#25272f'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(7);
  // Asphaltwolken (hell/dunkel), nahtlos
  for (let i = 0; i < 34; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 80, dark = rnd() < 0.55, a = 0.05 + rnd() * 0.06;
    drawWrapped(S, x, y, r, (px, py) => blob(g, px, py, r, dark ? '0,0,0' : '255,255,255', dark ? a : a * 0.6));
  }
  // Flicken (ausgebesserte Stellen)
  for (let i = 0; i < 7; i++) {
    const w = 40 + rnd() * 110, h = 28 + rnd() * 70, x = 50 + rnd() * (S - 100 - w), y = 20 + rnd() * (S - 40 - h);
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.045)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
  }
  // Körnung
  for (let i = 0; i < 26000; i++) {
    const a = 0.04 + rnd() * 0.08;
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + (a * 1.6) + ')';
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
  }
  // Risse
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
  for (let i = 0; i < 9; i++) crack(g, rnd, 50 + rnd() * (S - 100), 30 + rnd() * (S - 160), 6 + (rnd() * 6 | 0), 1);
  // Markierungen: kantenscharf, leicht abgenutzt
  g.fillStyle = '#ecece8';
  g.fillRect(24, 0, 12, S); g.fillRect(476, 0, 12, S);
  g.fillStyle = '#e6d36a';
  g.fillRect(250, 0, 12, 256);
  for (let i = 0; i < 1100; i++) {
    const reg = rnd();
    const x = reg < 0.33 ? 24 + rnd() * 12 : reg < 0.66 ? 476 + rnd() * 12 : 250 + rnd() * 12;
    g.fillStyle = 'rgba(37,39,47,' + (0.45 + rnd() * 0.5) + ')';
    g.fillRect(x, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 5);
  }
  return toTexture(c, true);
}

function makeKerbTexture() {
  const { c, g } = newCanvas(32, 128);
  const kc = THEME.kerb || ['#e03030', '#f2f2f2'];
  g.fillStyle = kc[0]; g.fillRect(0, 0, 32, 64);
  g.fillStyle = kc[1]; g.fillRect(0, 64, 32, 64);
  const rnd = mulberry32(5);
  for (let i = 0; i < 520; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.14)';
    g.fillRect(rnd() * 32, rnd() * 128, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(0, 0, 2, 128); g.fillRect(30, 0, 2, 128);
  g.fillStyle = 'rgba(0,0,0,0.20)'; g.fillRect(0, 62, 32, 2); g.fillRect(0, 126, 32, 2);
  return toTexture(c, true);
}

function makeGroundTexture() {
  const S = 256;
  const { c, g } = newCanvas(S, S);
  g.fillStyle = '#0e1d10'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(99);
  const greens = ['40,95,45', '25,70,35', '70,100,40', '15,45,25', '60,80,35'];
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 50, col = greens[(rnd() * greens.length) | 0];
    drawWrapped(S, x, y, r, (px, py) => blob(g, px, py, r, col, 0.10 + rnd() * 0.12));
  }
  for (let i = 0; i < 1800; i++) {
    const a = 0.06 + rnd() * 0.12;
    g.fillStyle = rnd() < 0.55 ? 'rgba(80,140,70,' + a + ')' : 'rgba(0,0,0,' + a * 1.4 + ')';
    g.fillRect(rnd() * S, rnd() * S, 1, 2 + rnd() * 3);        // Grashalme
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = 'rgba(120,100,70,' + (0.08 + rnd() * 0.12) + ')';
    g.fillRect(rnd() * S, rnd() * S, 2, 2);                    // Erdkrümel
  }
  const t = toTexture(c, true);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(140, 140);
  return t;
}

function makeGravelTexture() {
  const { c, g } = newCanvas(128, 128);
  g.fillStyle = '#4b4741'; g.fillRect(0, 0, 128, 128);
  const rnd = mulberry32(17);
  const cols = ['#6a655c', '#3a3733', '#7d776b', '#2c2a27', '#57524a'];
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
  }
  // äusserer Rand läuft weich ins Gras aus (Alpha)
  g.globalCompositeOperation = 'destination-out';
  const gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'source-over';
  return toTexture(c, true);
}

function makeTunnelTexture() {
  const S = 256;
  const { c, g } = newCanvas(S, S);
  g.fillStyle = '#3b414d'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(61);
  for (let i = 0; i < 16; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 40, dark = rnd() < 0.6;
    drawWrapped(S, x, y, r, (px, py) => blob(g, px, py, r, dark ? '0,0,0' : '255,255,255', dark ? 0.12 : 0.05));
  }
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)';
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // Betonplatten-Fugen
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 3, S); g.fillRect(128, 0, 3, S); g.fillRect(0, 0, S, 3); g.fillRect(0, 128, S, 3);
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.fillRect(3, 0, 1, S); g.fillRect(131, 0, 1, S); g.fillRect(0, 3, S, 1); g.fillRect(0, 131, S, 1);
  // Nieten
  g.fillStyle = 'rgba(0,0,0,0.5)';
  [[12, 12], [116, 12], [12, 116], [116, 116], [140, 12], [244, 12], [140, 116], [244, 116],
   [12, 140], [116, 140], [12, 244], [116, 244], [140, 140], [244, 140], [140, 244], [244, 244]].forEach(p => g.fillRect(p[0], p[1], 3, 3));
  // Wasserspuren
  for (let i = 0; i < 9; i++) {
    const x = rnd() * S, y = rnd() * S * 0.5, h = 40 + rnd() * 100;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x, y, 2 + rnd() * 3, h);
  }
  const t = toTexture(c, true);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Fassade (Basis) + Leuchtfenster (Emissive)
function makeFacadeTextures() {
  const S = 256;
  const a = newCanvas(S, S), b = newCanvas(S, S);
  a.g.fillStyle = '#1b2438'; a.g.fillRect(0, 0, S, S);
  b.g.fillStyle = '#000000'; b.g.fillRect(0, 0, S, S);
  const rnd = mulberry32(404);
  const warm = ['#ffd98a', '#ffc46b', '#fff1c9', '#9fd8ff', '#ffb36b'];
  for (let i = 0; i < 400; i++) {
    a.g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.12)';
    a.g.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  for (let cy = 0; cy < 8; cy++) {
    a.g.fillStyle = 'rgba(255,255,255,0.05)'; a.g.fillRect(0, cy * 32 + 1, S, 2);
    for (let cx = 0; cx < 8; cx++) {
      const x = cx * 32 + 7, y = cy * 32 + 8;
      a.g.fillStyle = '#0a0f1e'; a.g.fillRect(x, y, 18, 16);
      if (rnd() < 0.38) {
        const col = warm[(rnd() * warm.length) | 0];
        a.g.fillStyle = col; a.g.fillRect(x, y, 18, 16);
        b.g.fillStyle = col; b.g.fillRect(x, y, 18, 16);
        b.g.fillStyle = 'rgba(0,0,0,0.35)'; b.g.fillRect(x, y + 7, 18, 2);
      }
    }
  }
  const map = toTexture(a.c, true), emi = toTexture(b.c, true);
  map.wrapS = emi.wrapS = THREE.RepeatWrapping;
  return { map, emi };
}

function makeBlobTexture() {
  const { c, g } = newCanvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

function makeCloudTexture() {
  const { c, g } = newCanvas(128, 64);
  const rnd = mulberry32(12);
  for (let i = 0; i < 16; i++) blob(g, 20 + rnd() * 88, 20 + rnd() * 24, 14 + rnd() * 16, '255,255,255', 0.22);
  return toTexture(c, false);
}

function makeTreadTexture() {
  const { c, g } = newCanvas(64, 64);
  g.fillStyle = '#17171a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#08080a';
  [8, 24, 40, 56].forEach(y => g.fillRect(0, y, 64, 3));      // Längsrillen
  for (let x = 0; x < 64; x += 8) { g.fillRect(x, 0, 2, 8); g.fillRect(x + 4, 16, 2, 8); g.fillRect(x, 32, 2, 8); g.fillRect(x + 4, 48, 2, 8); }
  const t = toTexture(c, true);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(18, 1);
  return t;
}

// Sponsoren (frei erfunden) für Banden, Fahnen und Torbögen
const SPONSORS = [
  { name: 'NOVA',     a: '#ff2a6d', b: '#7a0f3a', fg: '#ffffff' },
  { name: 'TURBO-X',  a: '#ffb02a', b: '#8a4a00', fg: '#1a0f00' },
  { name: 'VELOCITY', a: '#2aa8ff', b: '#0a3a7a', fg: '#ffffff' },
  { name: 'AURORA',   a: '#2dff9a', b: '#0a6a44', fg: '#021a10' },
  { name: 'KRONOS',   a: '#a65bff', b: '#35107a', fg: '#ffffff' },
  { name: 'ZENITH',   a: '#f2f2f2', b: '#555a66', fg: '#101420' }
];

function makeSponsorTexture(sp) {
  const { c, g } = newCanvas(1024, 256);
  const gr = g.createLinearGradient(0, 0, 1024, 0);
  gr.addColorStop(0, sp.a); gr.addColorStop(1, sp.b);
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  for (let x = -256; x < 1024; x += 96) {
    g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 64, 256); g.lineTo(x + 192, 0); g.lineTo(x + 128, 0); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 1024, 18); g.fillRect(0, 238, 1024, 18);
  g.fillStyle = sp.fg; g.font = 'italic 900 140px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 14;
  const tw = g.measureText(sp.name).width;                                     // lange Markennamen verkleinern
  if (tw > 940) g.font = 'italic 900 ' + Math.floor(140 * 940 / tw) + 'px Arial, sans-serif';
  g.fillText(sp.name, 512, 132);
  return toTexture(c, false);
}

function makeFlagTexture(sp) {
  const { c, g } = newCanvas(256, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, sp.a); gr.addColorStop(1, sp.b);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 52, 256, 24);
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.arc(46, 64, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = sp.fg; g.font = 'italic 900 52px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(sp.name.charAt(0), 46, 66);
  g.font = 'italic 900 34px Arial, sans-serif';
  g.fillText(sp.name.length > 6 ? sp.name.slice(0, 6) : sp.name, 162, 66);
  return toTexture(c, false);
}

// Banner über dem Torbogen
function makeGantryTexture(text) {
  const { c, g } = newCanvas(1024, 128);
  const gr = g.createLinearGradient(0, 0, 1024, 0);
  gr.addColorStop(0, '#0a0e22'); gr.addColorStop(0.5, '#1a1f44'); gr.addColorStop(1, '#0a0e22');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 128);
  for (let k = 0; k < 64; k++) {
    g.fillStyle = k % 2 === 0 ? '#f4f4f4' : '#d01830';
    g.fillRect(k * 16, 0, 16, 8); g.fillRect(k * 16, 120, 16, 8);
  }
  g.strokeStyle = 'rgba(68,170,255,0.8)'; g.lineWidth = 3; g.strokeRect(6, 14, 1012, 100);
  g.fillStyle = '#ffffff'; g.font = 'italic 900 62px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(68,170,255,0.9)'; g.shadowBlur = 16;
  g.fillText(text, 512, 66);
  return toTexture(c, false);
}

// Gelb-schwarze Kurvenschilder (dir = 1: Pfeil nach rechts, -1: nach links)
function makeChevronTexture(dir) {
  const { c, g } = newCanvas(128, 128);
  const cv = THEME.chev || ['#101010', '#f2c200', '#101010'];
  g.fillStyle = cv[0]; g.fillRect(0, 0, 128, 128);
  g.fillStyle = cv[1]; g.fillRect(6, 6, 116, 116);
  if (dir < 0) { g.translate(128, 0); g.scale(-1, 1); }
  g.fillStyle = cv[2];
  [8, 52].forEach(x => {
    g.beginPath();
    g.moveTo(x + 14, 22); g.lineTo(x + 38, 22); g.lineTo(x + 68, 64); g.lineTo(x + 38, 106); g.lineTo(x + 14, 106); g.lineTo(x + 44, 64);
    g.closePath(); g.fill();
  });
  return toTexture(c, false);
}

function makeSignTexture(text, bg, fg) {
  const { c, g } = newCanvas(512, 128);
  g.fillStyle = '#e8e8ee'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = bg; g.fillRect(8, 8, 496, 112);
  g.fillStyle = fg; g.font = 'bold 76px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = g.measureText(text).width;
  if (tw > 470) g.font = 'bold ' + Math.floor(76 * 470 / tw) + 'px Arial, sans-serif';
  g.fillText(text, 256, 68);
  return toTexture(c, false);
}

// Laufende Lichtstriche an den Tunnelwänden (Textur-Offset wird animiert)
function makeMarchTexture() {
  const { c, g } = newCanvas(16, 64);
  const gr = g.createLinearGradient(0, 4, 0, 40);
  const mc = (THEME.march || [[255, 150, 40], [255, 190, 90], [255, 240, 200]]).map(a => a.join(','));
  gr.addColorStop(0, 'rgba(' + mc[0] + ',0)'); gr.addColorStop(0.35, 'rgba(' + mc[1] + ',1)');
  gr.addColorStop(0.7, 'rgba(' + mc[2] + ',1)'); gr.addColorStop(1, 'rgba(' + mc[0] + ',0)');
  g.fillStyle = gr; g.fillRect(0, 4, 16, 36);
  return toTexture(c, true);
}

// Weicher Rauchpuff (mehrere überlagerte Blobs, Rand läuft sicher auf 0 aus)
function makeSmokeTexture() {
  const { c, g } = newCanvas(64, 64);
  const rnd = mulberry32(44);
  blob(g, 32, 32, 30, '255,255,255', 0.28);
  for (let i = 0; i < 9; i++) blob(g, 26 + rnd() * 12, 26 + rnd() * 12, 12 + rnd() * 5, '255,255,255', 0.32);
  return toTexture(c, false);
}

// Fake-Umgebung für Lack/Glas/Felgen (Equirect -> PMREM), ohne externe Dateien
function makeEnvMap(rdr) {
  try {
    const { c, g } = newCanvas(256, 128);
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#0a1230'); gr.addColorStop(0.42, '#25407e'); gr.addColorStop(0.5, '#5f7bba');
    gr.addColorStop(0.53, '#161d30'); gr.addColorStop(1, '#05070d');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    blob(g, 62, 26, 24, '230,240,255', 1);                       // Mond
    const rnd = mulberry32(3);
    for (let i = 0; i < 26; i++) blob(g, rnd() * 256, 62 + rnd() * 6, 4 + rnd() * 5, '255,190,110', 0.9);  // Lampenreihen
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 60, 256, 2);
    const tex = new THREE.CanvasTexture(CITY ? makeCityEnvCanvas() : ALPINE ? makeAlpineEnvCanvas() : c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(rdr || renderer);
    const rt = pm.fromEquirectangular(tex);
    pm.dispose(); tex.dispose();
    return rt.texture;
  } catch (e) { return null; }
}

// ─── Kurve & Frames ───────────────────────────────────────────────────────────
function buildCurve() {
  // Mittellinie der gebauten Strecke (siehe TRACKS)
  const base = builtTrack.points, off = builtTrack.startOffset | 0;
  const rot = base.slice(off).concat(base.slice(0, off)); // Start/Ziel auf flachem Abschnitt
  curve = new THREE.CatmullRomCurve3(rot.map(p => new THREE.Vector3(p[0], p[1], p[2])), true, 'centripetal');
  curve.arcLengthDivisions = 4000;
  curve.updateArcLengths();
  trackLen = curve.getLength();
  DS = trackLen / N;
  ROAD_VLEN = trackLen / Math.max(1, Math.round(trackLen / 10));
  KERB_VLEN = trackLen / Math.max(1, Math.round(trackLen / 4));
}

function smoothCircular(arr, r) {
  const n = arr.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -r; j <= r; j++) s += arr[(i + j + n) % n];
    out[i] = s / (2 * r + 1);
  }
  return out;
}

function buildFrames() {
  frames.length = 0;
  const Y = new THREE.Vector3(0, 1, 0);
  const raw = [];
  for (let i = 0; i < N; i++) {
    const u = i / N;
    raw.push({ P: curve.getPointAt(u), T: curve.getTangentAt(u).normalize() });
  }
  const psi = raw.map(f => Math.atan2(f.T.x, f.T.z));
  const kappa = new Array(N);
  for (let i = 0; i < N; i++) {
    kappa[i] = wrapAngle(psi[(i + 1) % N] - psi[(i - 1 + N) % N]) / (2 * DS);
  }
  const bank = smoothCircular(kappa.map(k => clamp(k * SCENE.BANK_K, -SCENE.BANK_MAX, SCENE.BANK_MAX)), 20);

  // Tunnel-Kurve: Querneigung senkt den rechten Strassenrand unter die Boden-Plane (GROUND_Y).
  // Strecke daher nur dort anheben, wo nötig (Rand inkl. Kerb >= GROUND_Y + 0.3), weich ausgeblendet.
  const EDGE_W = HALF_W + 0.8, EDGE_CLEAR = 0.3, LIFT_R = 15;
  const need = raw.map((f, i) => Math.max(0, GROUND_Y + EDGE_CLEAR + Math.abs(Math.sin(bank[i])) * EDGE_W - f.P.y));
  const needMax = need.map((_, i) => {          // Maximum im Umkreis 2*LIFT_R, damit die Glättung nie darunter fällt
    let m = 0;
    for (let j = -2 * LIFT_R; j <= 2 * LIFT_R; j++) m = Math.max(m, need[(i + j + N) % N]);
    return m;
  });
  const lift = smoothCircular(smoothCircular(needMax, LIFT_R), LIFT_R);
  for (let i = 0; i < N; i++) {
    const T = raw[i].T, hl = Math.hypot(T.x, T.z);
    const slope = T.y / hl + (lift[(i + 1) % N] - lift[(i - 1 + N) % N]) / (2 * DS * hl);
    raw[i].P.y += lift[i];
    T.set(T.x / hl, slope, T.z / hl).normalize();   // Tangente an die neue Steigung anpassen
  }

  for (let i = 0; i < N; i++) {
    const T = raw[i].T;
    const Th = new THREE.Vector3(T.x, 0, T.z).normalize();
    const Lh = new THREE.Vector3(Th.z, 0, -Th.x);            // links (horizontal)
    const phi = bank[i];
    const Lat = Lh.clone().multiplyScalar(Math.cos(phi)).addScaledVector(Y, -Math.sin(phi)).normalize();
    const Up = new THREE.Vector3().crossVectors(T, Lat).normalize();
    // orthonormale Basis für Ausrichtungen
    const Bx = Lat.clone().addScaledVector(T, -Lat.dot(T)).normalize();
    const By = new THREE.Vector3().crossVectors(T, Bx).normalize();
    frames.push({ P: raw[i].P, T, Th, Lh, Lat, Up, Bx, By, bank: phi, kappa: kappa[i] });
  }
}

function inRange(i, r) { return !!r && Math.abs(wrapIdx(i - r.c)) <= r.h; }
const inBridge = i => inRange(i, bridgeR);
const inTunnel = i => inRange(i, tunnelR);
const inUnder  = i => inRange(i, underR);

// Kreuzung (Brücke/Unterführung) und Tunnel werden aus der Kurve berechnet
function detectRegions() {
  const minSep = Math.floor(N * 0.2);
  let bestD = Infinity, bi = 0, bj = 0;
  for (let i = 0; i < N; i += 2) {
    const pi = frames[i].P;
    for (let j = i + minSep; j <= i + N - minSep && j < N; j += 2) {
      const pj = frames[j].P;
      const dx = pi.x - pj.x, dz = pi.z - pj.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; bi = i; bj = j; }
    }
  }
  const hi = frames[bi].P.y > frames[bj].P.y ? bi : bj;
  const lo = hi === bi ? bj : bi;
  const BR_HALF = Math.round(46 / DS);
  crossing = { hi, lo, dist: Math.sqrt(bestD), dy: Math.abs(frames[bi].P.y - frames[bj].P.y) };
  bridgeR = { c: hi, h: BR_HALF };
  underR  = { c: lo, h: BR_HALF };

  let tc = 0;
  for (let i = 1; i < N; i++) if (frames[i].P.x < frames[tc].P.x) tc = i;
  tunnelR = { c: tc, h: Math.round(34 / DS) };
}

// zusammenhängende Index-Läufe (zirkulär), in denen ok[i] wahr ist
function buildRuns(ok) {
  const start = ok.findIndex((v, i) => v && !ok[(i - 1 + N) % N]);
  if (start === -1) return ok.every(Boolean) ? [{ a: 0, b: N }] : [];
  const runs = [];
  let i = start, count = 0;
  while (count < N) {
    if (ok[i % N]) {
      const a = i;
      while (count < N && ok[i % N]) { i++; count++; }
      runs.push({ a, b: i - 1 });
    } else { i++; count++; }
  }
  return runs;
}

// ─── Geometrie-Werkzeuge ──────────────────────────────────────────────────────
function wp(f, lat, up) {
  return new THREE.Vector3(
    f.P.x + f.Lat.x * lat + f.Up.x * up,
    f.P.y + f.Lat.y * lat + f.Up.y * up,
    f.P.z + f.Lat.z * lat + f.Up.z * up
  );
}
function upForWorldY(f, lat, wy) { return (wy - f.P.y - f.Lat.y * lat) / f.Up.y; }
// Bodenhöhe neben der Strecke: flache Ebene, beim Bergpass das Höhengelände
function gAt(f, lat) { return ALPINE ? alpineHeightAt(f.P.x + f.Lat.x * lat, f.P.z + f.Lat.z * lat) : GROUND_Y; }

// Band entlang der Kurve; profileFn(frame, index) liefert [[lat, up], ...]
function buildStrip(a, b, profileFn, opt) {
  opt = opt || {};
  const rows = b - a + 1;
  const pos = [], uv = [], idx = [];
  const vLen = opt.vLen || 8;
  let segs = 0;
  for (let r = 0; r < rows; r++) {
    const gi = a + r;
    const f = frames[mod(gi)];
    const prof = profileFn(f, mod(gi));
    segs = prof.length - 1;
    const v = (gi * DS) / vLen;
    for (let c = 0; c < segs; c++) {
      for (let k = 0; k < 2; k++) {
        const pr = prof[c + k];
        const p = wp(f, pr[0], pr[1]);
        pos.push(p.x, p.y, p.z);
        uv.push(opt.uvU ? opt.uvU[c + k] : (c + k) / segs, v);
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < segs; c++) {
      const a0 = (r * segs + c) * 2, a1 = a0 + 1;
      const b0 = ((r + 1) * segs + c) * 2, b1 = b0 + 1;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  if (opt.cap) {
    [a, b].forEach(gi => {
      const f = frames[mod(gi)];
      const prof = profileFn(f, mod(gi));
      const base = pos.length / 3;
      prof.forEach(pr => { const p = wp(f, pr[0], pr[1]); pos.push(p.x, p.y, p.z); uv.push(0, 0); });
      for (let k = 1; k < prof.length - 1; k++) idx.push(base, base + k, base + k + 1);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Fläche zwischen zwei Profil-Linien (z. B. Tunnelportal)
function buildBand(f, polyA, polyB) {
  const pos = [], idx = [];
  const A = polyA.map(p => wp(f, p[0], p[1]));
  const B = polyB.map(p => wp(f, p[0], p[1]));
  for (let k = 0; k < A.length - 1; k++) {
    const base = pos.length / 3;
    [A[k], A[k + 1], B[k + 1], B[k]].forEach(v => pos.push(v.x, v.y, v.z));
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function addMesh(geo, mat, opts) {
  const m = new THREE.Mesh(geo, mat);
  if (opts) { m.castShadow = !!opts.cast; m.receiveShadow = !!opts.recv; }
  scene.add(m);
  return m;
}

function lambert(color, extra) {
  return new THREE.MeshLambertMaterial(Object.assign({ color, side: THREE.DoubleSide }, extra || {}));
}

function makeInstanced(geo, mat, items) {
  if (!items.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const M = new THREE.Matrix4();
  items.forEach((it, i) => {
    M.compose(it.p, it.q || IDQ, it.s || ONE);
    m.setMatrixAt(i, M);
    if (it.c) m.setColorAt(i, it.c);
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false;   // sonst verschwinden Instanzen (Bounding-Sphere liegt im Ursprung)
  scene.add(m);
  return m;
}

function frameQuat(f) {
  const m = new THREE.Matrix4().makeBasis(f.Bx, f.By, f.T);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
function yawQuat(f) {
  const m = new THREE.Matrix4().makeBasis(f.Lh, new THREE.Vector3(0, 1, 0), f.Th);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function minDistToTrack2(x, z, stopBelow) {
  let best = Infinity;
  for (let i = 0; i < N; i++) {
    const p = frames[i].P;
    const dx = x - p.x, dz = z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; if (best < stopBelow) return best; }
  }
  return best;
}

// ─── Strecke aufbauen ─────────────────────────────────────────────────────────
function buildTrack() {
  const glowLamps = [], glowTunnel = [], glowUnder = [], poolItems = [], coneItems = [], tunHouse = [];

  // Fahrbahn
  const road = addMesh(
    buildStrip(0, N, () => [[-HALF_W, 0], [HALF_W, 0]], { vLen: ROAD_VLEN }),
    roadMaterial(), { recv: true });
  road.name = 'road';

  // Kerbs
  const kerbMat = kerbMaterial();
  [1, -1].forEach(sg => {
    addMesh(buildStrip(0, N, () => [[sg * HALF_W, 0.0], [sg * (HALF_W + 0.12), 0.1], [sg * (HALF_W + 0.68), 0.1], [sg * (HALF_W + 0.8), 0.0]], { vLen: KERB_VLEN }), kerbMat);
  });

  // Brückenträger
  if (ALPINE) buildAlpineViaduct(); else {
  const beamMat = lambert(THEME.beam || 0x5a606c);
  const bw = HALF_W + 1.1;
  addMesh(buildStrip(bridgeR.c - bridgeR.h, bridgeR.c + bridgeR.h, () => [
    [-HALF_W, -0.03], [-bw, -0.03], [-bw, -1.7], [bw, -1.7], [bw, -0.03], [HALF_W, -0.03]
  ], { cap: true }), beamMat, { cast: true });

  // Brückenpfeiler
  const pierItems = [];
  [-1, 1].forEach(sd => {
    [bridgeR.h - 3, Math.round(bridgeR.h * 0.6)].forEach(o => {
      const f = frames[mod(bridgeR.c + sd * o)];
      [-1, 1].forEach(sg => {
        const lat = sg * (HALF_W - 1.2);
        const topY = f.P.y + f.Lat.y * lat - 1.7;
        const h = topY - GROUND_Y;
        addSolid(f, f.P.x + f.Lat.x * lat, f.P.z + f.Lat.z * lat, 0.55, 0.55, topY);
        pierItems.push({
          p: new THREE.Vector3(f.P.x + f.Lat.x * lat, GROUND_Y + h / 2, f.P.z + f.Lat.z * lat),
          q: yawQuat(f), s: new THREE.Vector3(1.1, h, 1.1)
        });
      });
    });
  });
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: THEME.pier || 0x4d5360 }), pierItems);
  if (CITY) cityPierGlow(pierItems);            // leuchtende Stützpfeiler
  }

  // Dämme (Böschung) – überall ausser Brücke und Tunnel (Bergpass: Stützmauern am Gelände)
  if (ALPINE) buildAlpineBanks(); else {
  const embMat = lambert(THEME.emb || 0x16241a);
  const okEmb = [];
  for (let i = 0; i < N; i++) okEmb.push(!inBridge(i) && !inTunnel(i));
  buildRuns(okEmb).forEach(run => {
    [1, -1].forEach(sg => {
      addMesh(buildStrip(run.a, run.b, f => {
        const lat0 = sg * (HALF_W + 3.4);
        const edgeY = f.P.y + f.Lat.y * lat0 + f.Up.y * -0.05;
        const h = Math.max(0.15, edgeY - GROUND_Y);
        const latB = sg * (HALF_W + 3.4 + (THEME.embSlope || 1.3) * h);
        return [[sg * (HALF_W - 0.3), -0.05], [lat0, -0.05], [latB, upForWorldY(f, latB, GROUND_Y - 0.3)]];
      }, { cap: true }), embMat);
    });
  });
  }

  // Tunnel
  const tA = tunnelR.c - tunnelR.h, tB = tunnelR.c + tunnelR.h;
  const tw = HALF_W + 1.1;
  const inner = () => [[-tw, -0.05], [-tw, 4.2], [-tw + 1.6, 5.9], [tw - 1.6, 5.9], [tw, 4.2], [tw, -0.05]];
  const outer = f => {
    const ow = tw + 9.5;
    return [
      [-ow, upForWorldY(f, -ow, GROUND_Y - 0.3)], [-(tw + 5), 4.5], [-(tw + 2.5), 9.2],
      [tw + 2.5, 9.2], [tw + 5, 4.5], [ow, upForWorldY(f, ow, GROUND_Y - 0.3)]
    ];
  };
  const inP = inner(), uvU = [0];
  for (let k = 0; k < inP.length - 1; k++) uvU.push(uvU[k] + Math.hypot(inP[k + 1][0] - inP[k][0], inP[k + 1][1] - inP[k][1]) / 8);
  addMesh(buildStrip(tA, tB, inner, { uvU, vLen: 8 }), lambert(THEME.tunTint || 0xffffff, { map: makeTunnelTexture(), emissive: THEME.tunEmi || 0x12151b }));
  if (ALPINE) buildAlpineTunnelRock(tA, tB, tw, inner);          // Felsmassiv-Hügel + Felsportale
  else {
  addMesh(buildStrip(tA, tB, outer), lambert(THEME.tunOuter || 0x1c3a22), { cast: true });
  [tA, tB].forEach(gi => {
    const f = frames[mod(gi)];
    addMesh(buildBand(f, inner(), outer(f)), lambert(THEME.portal || 0x5b6270));
  });
  }
  // Portal-Details: erhabene Einfassung + leuchtende Kante
  const lipMat = lambert(THEME.lip || 0x39404c, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const rimMat2 = new THREE.MeshBasicMaterial({ color: THEME.tunRim || 0xffa23a, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const lipP = () => [[-tw - 0.7, -0.05], [-tw - 0.7, 4.4], [-tw + 1.4, 6.6], [tw - 1.4, 6.6], [tw + 0.7, 4.4], [tw + 0.7, -0.05]];
  const rimP = () => [[-tw - 0.2, -0.05], [-tw - 0.2, 4.3], [-tw + 1.5, 6.1], [tw - 1.5, 6.1], [tw + 0.2, 4.3], [tw + 0.2, -0.05]];
  [tA, tB].forEach(gi => {
    const f = frames[mod(gi)];
    addMesh(buildBand(f, rimP(), lipP()), lipMat);
    addMesh(buildBand(f, inner(), rimP()), rimMat2);
  });
  const stripLight = new THREE.MeshBasicMaterial({ color: THEME.tunStrip || 0xfff1c9, side: THREE.DoubleSide });
  const stripOrange = new THREE.MeshBasicMaterial({ color: THEME.tunStrip2 || 0xff8a1a, side: THREE.DoubleSide });
  [1, -1].forEach(sg => {
    addMesh(buildStrip(tA, tB, () => [[sg * 2.6, 5.86], [sg * 3.1, 5.86]]), stripLight);
    addMesh(buildStrip(tA, tB, () => [[sg * (tw - 0.04), 0.5], [sg * (tw - 0.04), 0.85]]), stripOrange);
  });
  const lampStep = Math.max(1, Math.round(7 / DS));
  for (let i = tA; i <= tB; i += lampStep) {
    const lf = frames[mod(i)];
    const p = wp(lf, 0, 5.6);
    glowTunnel.push(p.x, p.y, p.z);
    tunHouse.push({ p: wp(lf, 0, 5.72), q: frameQuat(lf) });
    poolItems.push({ p: wp(lf, 0, 0.06), q: frameQuat(lf), s: new THREE.Vector3(9, 1, 9), tun: true });
    coneItems.push({ p: wp(lf, 0, 3.05), tun: true });
  }

  // Unterführung: Lichter unter der Brücke + eigene Lichtquelle
  const hiY = frames[crossing.hi].P.y;
  [-9, 0, 9].forEach(m => {
    const p = frames[mod(crossing.lo + m)].P;
    (CITY ? glowUnder : glowTunnel).push(p.x, hiY - 2.4, p.z);
  });
  const lp = frames[crossing.lo].P;
  underLight = new THREE.PointLight(THEME.under || 0xffaa55, THEME.underI || 1.6, 30);
  underLight.position.set(lp.x, ALPINE ? lp.y + 6.5 : 6.5, lp.z);
  scene.add(underLight);

  // Leitplanken (nicht im Tunnel) – in der Stadt: Betonbarrieren mit Neon-Streifen
  if (CITY) buildCityBarriers(); else {
  const railMat = lambert(0xb0c0d2, { emissive: 0x10141a });
  const okRail = [];
  for (let i = 0; i < N; i++) okRail.push(!inTunnel(i));
  buildRuns(okRail).forEach(run => {
    [1, -1].forEach(sg => {
      addMesh(buildStrip(run.a, run.b, () => [
        [sg * (HALF_W + 0.95), 0.34], [sg * (HALF_W + 1.01), 0.42], [sg * (HALF_W + 0.93), 0.54], [sg * (HALF_W + 1.01), 0.64],
        [sg * (HALF_W + 0.93), 0.76], [sg * (HALF_W + 1.01), 0.86], [sg * (HALF_W + 0.95), 1.0]
      ]), railMat);   // Wellenprofil (W-Beam)
    });
  });
  const postItems = [], reflItems = [], reflGlowW = [], reflGlowR = [];
  const postStep = Math.max(1, Math.round(3.4 / DS));
  const cWhite = new THREE.Color(0xffffff), cRed = new THREE.Color(0xff2a3a);
  let pc = 0;
  for (let i = 0; i < N; i += postStep, pc++) {
    if (inTunnel(i)) continue;
    const f = frames[i];
    [1, -1].forEach(sg => {
      postItems.push({ p: wp(f, sg * (HALF_W + 0.95), 0.5), q: frameQuat(f) });
      if (pc % 2 === 0) {      // Reflektoren: links weiss, rechts rot
        const rp = wp(f, sg * (HALF_W + 0.88), 0.8);
        reflItems.push({ p: rp, q: frameQuat(f), c: sg > 0 ? cWhite : cRed });
        (sg > 0 ? reflGlowW : reflGlowR).push(rp.x, rp.y, rp.z);
      }
    });
  }
  makeInstanced(new THREE.BoxGeometry(0.14, 1.0, 0.14), new THREE.MeshLambertMaterial({ color: 0x7d8a99 }), postItems);
  makeInstanced(new THREE.BoxGeometry(0.03, 0.1, 0.18), new THREE.MeshBasicMaterial({ color: 0xffffff }), reflItems);
  glowPoints(reflGlowW, 0.9, 0xffffff, 0.8);
  glowPoints(reflGlowR, 0.9, 0xff2a3a, 0.8);
  }

  // Reifenstapel an Aussenseiten enger Kurven
  const tireItems = [];
  for (let i = 0; i < N; i += 6) {
    const f = frames[i];
    if (ALPINE || Math.abs(f.kappa) < 0.022 || inBridge(i) || inTunnel(i) || inUnder(i)) continue;
    const lat = -Math.sign(f.kappa) * (HALF_W + 1.9);
    const base = wp(f, lat, -0.05);
    [0, 1].forEach(s => {
      tireItems.push({ p: new THREE.Vector3(base.x, base.y + 0.17 + s * 0.31, base.z) });
    });
  }
  makeInstanced(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), new THREE.MeshLambertMaterial({ color: 0x141414 }), tireItems);

  // Lampenmasten (Stadt: buildCityLamps() in createTrackDetails, nach den Torbögen; Bergpass: Tageslicht, keine Masten)
  if (!CITY && !ALPINE) {
  const poleItems = [], headItems = [];
  const step = Math.max(1, Math.round(40 / DS));
  let k = 0;
  for (let i = 40; i < N; i += step, k++) {
    const f = frames[i];
    if (inBridge(i) || inTunnel(i) || inUnder(i) || Math.abs(wrapIdx(i)) < 55) continue;
    // Abstand zu Brücke/Tunnel-Enden
    if (Math.abs(wrapIdx(i - bridgeR.c)) < bridgeR.h + 12 || Math.abs(wrapIdx(i - tunnelR.c)) < tunnelR.h + 12) continue;
    const sg = k % 2 === 0 ? 1 : -1;
    const b = wp(f, sg * (HALF_W + 2.4), -0.05);
    poleItems.push({ p: new THREE.Vector3(b.x, b.y + 4, b.z) });
    const hd = wp(f, sg * (HALF_W + 1.4), -0.05);
    headItems.push({ p: new THREE.Vector3(hd.x, hd.y + 8.0, hd.z), q: yawQuat(f) });
    glowLamps.push(hd.x, hd.y + 7.9, hd.z);
    coneItems.push({ p: new THREE.Vector3(hd.x, hd.y + 4.0, hd.z) });
    poolItems.push({ p: wp(f, sg * (HALF_W - 2.5), 0.13), q: frameQuat(f), s: new THREE.Vector3(15, 1, 15) });
  }
  makeInstanced(new THREE.CylinderGeometry(0.08, 0.12, 8, 6), new THREE.MeshLambertMaterial({ color: 0x778899 }), poleItems);
  makeInstanced(new THREE.BoxGeometry(0.5, 0.15, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffee }), headItems);
  }

  // Leuchtpunkte (additiv, eine Draw-Call pro Gruppe)
  const glowTex = makeGlowTexture();
  const mkPoints = (arr, size, color) => {
    if (!arr.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({
      size, map: glowTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: color || 0xfff0c8
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    scene.add(p);
  };
  mkPoints(glowLamps, 8);
  mkPoints(glowTunnel, 4.5, THEME.glowTun);
  mkPoints(glowUnder, 4.5, THEME.glowUnder);

  // Lampen-Details: Gehäuse, Lichtkegel (additiv) und Lichtpfützen auf der Fahrbahn – ohne Echtzeit-Lichter
  makeInstanced(new THREE.BoxGeometry(0.5, 0.12, 1.6), new THREE.MeshBasicMaterial({ color: THEME.house || 0xfff1c9 }), tunHouse);
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: glowTex, color: THEME.pool || 0xffdfa6, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  });
  makeInstanced(poolGeo, poolMat, poolItems);
  const coneMat = new THREE.MeshBasicMaterial({ color: THEME.cone || 0xffe2a8, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  makeInstanced(new THREE.CylinderGeometry(0.2, 2.4, 5.3, 14, 1, true), coneMat, coneItems.filter(c => c.tun));
  makeInstanced(new THREE.CylinderGeometry(0.25, 3.8, 8, 16, 1, true), coneMat, coneItems.filter(c => !c.tun));
}

// Startlinie senkrecht zur Strecke + Torbogen
function buildStartLine() {
  const f = frames[0];
  const g = new THREE.Group();
  g.quaternion.copy(frameQuat(f));
  g.position.copy(f.P).addScaledVector(f.Up, 0.045);

  const cell = TRACK_W / 16;
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_W, cell * 4),
    new THREE.MeshBasicMaterial({ map: makeCheckerTexture() }));
  line.rotation.x = -Math.PI / 2;
  g.add(line);
  if (CITY) { cityStartGantry(g); scene.add(g); return; }       // Neon-Gantry „NEON-STADT GP“
  if (ALPINE) { alpineStartGantry(g); scene.add(g); return; }  // Holz-Gantry „BERGPASS GP“

  const poleMat = new THREE.MeshLambertMaterial({ color: 0x8a97a6 });
  [-1, 1].forEach(sg => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7.2, 8), poleMat);
    pole.position.set(sg * (HALF_W + 1.4), 3.6, 0);
    g.add(pole);
  });
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_W + 3, 1.7),
    new THREE.MeshBasicMaterial({ map: makeBannerTexture(), side: THREE.DoubleSide }));
  banner.position.set(0, 7.0, 0);
  banner.rotation.y = Math.PI;      // Vorderseite zum anrollenden Fahrer
  g.add(banner);
  scene.add(g);
}

// Tribüne (rechts) mit Publikum, Boxen (links) – an der Kurve ausgerichtet, nie auf der Fahrbahn
function buildGrandstand(c, half, seatMat) {
  const rows = 4, w = 1.5, startLat = HALF_W + 4.6;
  for (let r = 0; r < rows; r++) {
    const ln = -(startLat + r * w), lf = -(startLat + (r + 1) * w);
    const topOff = 0.5 + r * 0.9;
    addMesh(buildStrip(c - half, c + half, f => {
      const bn = upForWorldY(f, ln, gAt(f, ln) - 0.3), bf = upForWorldY(f, lf, gAt(f, lf) - 0.3);
      const tn = upForWorldY(f, ln, f.P.y + topOff), tf = upForWorldY(f, lf, f.P.y + topOff);
      return [[ln, bn], [ln, tn], [lf, tf], [lf, bf]];
    }, { cap: true, uvU: [0, 0, 1, 1], vLen: 4.4 }), seatMat);
  }
  const roofN = -(HALF_W + 3.8), roofF = -(startLat + rows * w + 0.6);
  const roofH = 6.6;
  addMesh(buildStrip(c - half, c + half, f => [
    [roofN, upForWorldY(f, roofN, f.P.y + roofH)], [roofF, upForWorldY(f, roofF, f.P.y + roofH)]
  ]), lambert(CITY ? 0x1c2038 : ALPINE ? 0x5a3d26 : 0x2f3b4d));
  // Dachbeleuchtung der Tribüne (leuchtende Leiste + Glow)
  addMesh(buildStrip(c - half, c + half, f => [
    [roofN - 0.05, upForWorldY(f, roofN - 0.05, f.P.y + roofH - 0.1)], [roofN - 0.4, upForWorldY(f, roofN - 0.4, f.P.y + roofH - 0.1)]
  ]), new THREE.MeshBasicMaterial({ color: CITY ? 0x18e6ff : 0xfff1c9, side: THREE.DoubleSide }));
  const standGlow = [];
  for (let o = -half; o <= half; o += 4) {
    const f = frames[mod(c + o)];
    const gp = wp(f, roofN - 0.2, upForWorldY(f, roofN - 0.2, f.P.y + roofH - 0.3));
    standGlow.push(gp.x, gp.y, gp.z);
  }
  glowPoints(standGlow, 5, CITY ? 0x18e6ff : 0xfff0c8);
  const poleLat = -(startLat + rows * w + 0.3);
  const poleItems = [];
  [-half, -Math.round(half / 2), 0, Math.round(half / 2), half].forEach(o => {
    const f = frames[mod(c + o)];
    const topY = f.P.y + f.Lat.y * poleLat + roofH;
    const gp0 = gAt(f, poleLat), h = topY - gp0;
    poleItems.push({
      p: new THREE.Vector3(f.P.x + f.Lat.x * poleLat, gp0 + h / 2, f.P.z + f.Lat.z * poleLat),
      s: new THREE.Vector3(0.25, h, 0.25)
    });
  });
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: ALPINE ? 0x4a3322 : 0x556677 }), poleItems);

  // Publikum: Figuren auf den Rängen (zwei pro Stelle), gesammelt und später als Instanzen gebaut
  const rc = mulberry32(1234 + c);
  const shirts = [0xd22a2a, 0x2a46d2, 0xeeeeee, 0xe8c820, 0x22aa55, 0xff7a1a, 0xaa44ff, 0x22cccc];
  const skins = [0xf1c9a5, 0xd9a07a, 0xa8714c, 0x6b4430, 0xffdcc0];
  const pStep = Math.max(1, Math.round(0.8 / DS));
  for (let r = 0; r < rows; r++) {
    const lat0 = -(startLat + (r + 0.5) * w);
    const topOff = 0.5 + r * 0.9;
    for (let o = -half; o <= half; o += pStep) {
      for (let s2 = 0; s2 < 2; s2++) {
        if (rc() < 0.1) continue;                                  // Lücken in den Reihen
        const f = frames[mod(c + o + ((rc() * 3 - 1) | 0))];
        const lat = lat0 + (s2 ? 0.38 : -0.38) + (rc() - 0.5) * 0.2;
        crowdList.push({
          p: wp(f, lat, upForWorldY(f, lat, f.P.y + topOff)), q: yawQuat(f), s: 0.9 + rc() * 0.25,
          shirt: shirts[(rc() * shirts.length) | 0], skin: skins[(rc() * skins.length) | 0]
        });
      }
    }
  }
  standSpots.push({ c, half, roofN, roofH });
}

// Sucht eine freie, gerade Stelle für eine zweite Tribüne
function findStandSpot(half) {
  const f0 = Math.round(N * 0.52);
  for (let d = 0; d < N; d += 4) {
    const c = mod(f0 + d);
    if (!trackFree(c, half + 20) || !isStraight(c, half, 0.01)) continue;
    const p = wp(frames[c], -19, 0);
    if (minDistToTrack2(p.x, p.z, 17 * 17) < 17 * 17) continue;
    return c;
  }
  return -1;
}

// Publikum als Instanzen (Wippen läuft im Vertex-Shader, keine CPU-Arbeit pro Frame)
function crowdShader(sh) {
  sh.uniforms.uTime = crowdUni.time; sh.uniforms.uAmp = crowdUni.amp;
  sh.vertexShader = 'uniform float uTime;\nuniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n' +
    '#ifdef USE_INSTANCING\n' +
    'float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;\n' +
    'transformed.y += max(0.0, sin(uTime * 7.0 + ph)) * 0.14 * uAmp;\n' +
    'transformed.x += sin(uTime * 3.0 + ph) * 0.03 * uAmp;\n' +
    '#endif');
}

function buildCrowd() {
  if (!crowdList.length) return;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x1a1d2a });
  mat.onBeforeCompile = crowdShader;
  const bodyG = new THREE.BoxGeometry(0.34, 0.5, 0.2); bodyG.translate(0, 0.25, 0);
  const headG = new THREE.SphereGeometry(0.13, 8, 6); headG.translate(0, 0.65, 0);
  makeInstanced(bodyG, mat, crowdList.map(it => ({
    p: it.p, q: it.q, s: new THREE.Vector3(it.s, it.s, it.s), c: new THREE.Color(it.shirt)
  })));
  makeInstanced(headG, mat, crowdList.map(it => ({
    p: it.p, q: it.q, s: new THREE.Vector3(it.s, it.s, it.s), c: new THREE.Color(it.skin)
  })));
  crowdList.length = 0;
}

// Tribünen (mit Publikum) und Boxengebäude
function createCrowdAndStands() {
  const half = Math.round(13 / DS);
  const seatMat = lambert(0xffffff, { map: makeSeatTexture() });
  buildGrandstand(0, half, seatMat);
  const c2 = ALPINE ? -1 : findStandSpot(Math.round(10 / DS));
  if (c2 >= 0) buildGrandstand(c2, Math.round(10 / DS), seatMat);

  if (ALPINE) { buildAlpineGarages(); buildCrowd(); return; }     // Chalet-Garagen
  // Boxengebäude auf der linken Seite
  const garageCols = CITY ? NEON_HEX : [0xcc1122, 0x1155cc, 0x228833, 0xcc8811];
  const boxGeo = new THREE.BoxGeometry(5, 1, 8);
  const doorGeo = new THREE.PlaneGeometry(6, 1.7);
  const signGeo = new THREE.PlaneGeometry(6, 0.5);
  const doorMat = new THREE.MeshBasicMaterial({ color: 0x07080c, side: THREE.DoubleSide });
  const gOff = Math.round(11 / DS);
  [-1.5, -0.5, 0.5, 1.5].forEach((m, n) => {
    const f = frames[mod(Math.round(m * gOff))];
    const lat = HALF_W + 6.5;
    const topY = f.P.y + 2.8;
    const h = topY - GROUND_Y;
    const grp = new THREE.Group();
    grp.quaternion.copy(yawQuat(f));
    grp.position.set(f.P.x + f.Lh.x * lat, GROUND_Y + h / 2, f.P.z + f.Lh.z * lat);
    const body = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: CITY ? 0x1c2138 : garageCols[n], emissive: CITY ? 0x0a0c18 : 0x000000 }));
    body.scale.y = h;
    grp.add(body);
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.rotation.y = -Math.PI / 2;
    door.position.set(-2.52, -h / 2 + (f.P.y - GROUND_Y) + 0.95, 0);
    grp.add(door);
    const sign = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ color: garageCols[n], side: THREE.DoubleSide }));
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(-2.52, h / 2 - 0.35, 0);
    grp.add(sign);
    scene.add(grp);
  });
  buildCrowd();
}

// ─── Umgebung ─────────────────────────────────────────────────────────────────
// ─── Auto ─────────────────────────────────────────────────────────────────────
// Loft-Körper: Superellipsen-Querschnitte entlang z (per Catmull-Rom geglättet).
//   secs: [[z, halbe Breite, y unten, y oben, Exponent, Mitte-x], ...] von vorn (+z) nach hinten (-z)
//   Pro Vertex wird die relative Höhe im Querschnitt (aU, 0..1) mitgegeben – die Lackierung berechnet der Shader daraus.
function loftBody(secs, M, N, flip) {
  const cr = (a, b, c, d, f) => 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  const S = secs.length, P = [];
  for (let i = 0; i < M; i++) {
    const t = i / (M - 1) * (S - 1);
    const k = Math.min(S - 2, Math.floor(t)), f = t - k, row = [];
    for (let q = 0; q < 6; q++) {
      row.push(cr(secs[Math.max(0, k - 1)][q], secs[k][q], secs[k + 1][q], secs[Math.min(S - 1, k + 2)][q], f));
    }
    P.push(row);
  }
  const pos = new Float32Array((M * N + 2) * 3), au = new Float32Array(M * N + 2), idx = [];
  for (let i = 0; i < M; i++) {
    const r = P[i], z = r[0], w = Math.max(0.004, r[1]), y0 = r[2], y1 = Math.max(y0 + 0.01, r[3]);
    const e = 2 / Math.max(2, r[4]), cx = r[5], ym = (y0 + y1) / 2, hh = (y1 - y0) / 2;
    for (let j = 0; j < N; j++) {
      const a = j / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), vi = i * N + j;
      pos[vi * 3]     = cx + w * Math.sign(c) * Math.pow(Math.abs(c), e);
      pos[vi * 3 + 1] = ym + hh * Math.sign(s) * Math.pow(Math.abs(s), e);
      pos[vi * 3 + 2] = z;
      au[vi] = (pos[vi * 3 + 1] - y0) / (y1 - y0);
    }
  }
  const n0 = M * N, n1 = M * N + 1, f0 = P[0], f1 = P[M - 1];
  pos.set([f0[5], (f0[2] + f0[3]) / 2, f0[0]], n0 * 3); au[n0] = 0.5;
  pos.set([f1[5], (f1[2] + f1[3]) / 2, f1[0]], n1 * 3); au[n1] = 0.5;
  const tri = (a, b, c) => flip ? idx.push(a, c, b) : idx.push(a, b, c);
  for (let i = 0; i < M - 1; i++) for (let j = 0; j < N; j++) {
    const a = i * N + j, b = i * N + (j + 1) % N, c = (i + 1) * N + j, d = (i + 1) * N + (j + 1) % N;
    tri(a, c, b); tri(b, c, d);
  }
  for (let j = 0; j < N; j++) {
    tri(n0, j, (j + 1) % N);
    tri(n1, (M - 1) * N + (j + 1) % N, (M - 1) * N + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.BufferAttribute(au, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Flügelprofil (umgekehrtes NACA-Profil, Wölbung nach unten) – Spannweite entlang x, Sehne entlang -z (Vorderkante bei +z)
function wingGeo(span, chord, thick, camber) {
  const n = 16, up = [], lo = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos(Math.PI * i / n)) / 2;
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
    const yc = camber * (1 - (2 * x - 1) * (2 * x - 1));          // camber < 0: Bauch nach unten (Abtrieb)
    up.push([x * chord, (yc + yt) * chord]);
    lo.push([x * chord, (yc - yt) * chord]);
  }
  const sh = new THREE.Shape();
  up.forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
  for (let i = n - 1; i >= 0; i--) sh.lineTo(lo[i][0], lo[i][1]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, steps: 1 });
  g.rotateY(Math.PI / 2);                          // (sx, sy, sz) -> (sz, sy, -sx)
  g.translate(-span / 2, 0, chord / 2);
  g.computeVertexNormals();
  return g;
}

// Endplatte: Polygon aus (z, y)-Punkten, Dicke entlang x
function plateGeo(pts, thick) {
  const sh = new THREE.Shape();
  pts.forEach((p, i) => i ? sh.lineTo(-p[0], p[1]) : sh.moveTo(-p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-thick / 2, 0, 0);
  return g;
}

// Baut das Auto-Modell (ohne es in eine Szene zu hängen). Wird vom Spiel UND vom Menü-Showroom benutzt.
//   rdr: Renderer, für den die Umgebungs-Map erzeugt wird
//   rig: Sammelstelle { wheels, steer, flames, tails } – wird befüllt; danach auch rig.env / boostGlow / underGlow / brakeGlow
function buildCarModel(rdr, rig) {
  const car = new THREE.Group();                 // lokal: überdeckt die globale Spiel-Variable `car`
  const carWheels = rig.wheels, carSteerPivots = rig.steer;

  const env = makeEnvMap(rdr);
  // Carbon-Gewebe (Köper-Muster), kachelt mehrfach pro Fläche
  const makeCarbonTex = () => {
    try {
      const { c, g } = newCanvas(64, 64);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const v = (x + y) % 2, gr = g.createLinearGradient(x * 8, y * 8, v ? x * 8 + 8 : x * 8, v ? y * 8 : y * 8 + 8);
        gr.addColorStop(0, '#c4c4cc'); gr.addColorStop(1, '#6a6a74');
        g.fillStyle = gr; g.fillRect(x * 8, y * 8, 8, 8);
      }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
      return t;
    } catch (e) { return null; }
  };
  // Startnummer im Kreis (Airbox-Seiten)
  const makeNumTex = () => {
    try {
      const { c, g } = newCanvas(128, 128);
      g.fillStyle = 'rgba(10,12,20,0.94)'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
      g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 55, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffffff'; g.font = 'bold 82px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('7', 64, 70);
      return new THREE.CanvasTexture(c);
    } catch (e) { return null; }
  };
  // Decals: kleine Canvas-Texturen (Schriftzug, Logo) für Endplatten
  const makeDecal = (w, h, draw) => {
    try { const { c, g } = newCanvas(w, h); draw(g, w, h); return new THREE.CanvasTexture(c); } catch (e) { return null; }
  };
  const nameTex = () => makeDecal(256, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.font = 'italic bold 62px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('NOVA', w / 2, h * 0.38);
    g.font = 'italic bold 34px Arial, sans-serif'; g.fillText('RACING', w / 2, h * 0.70);
    g.fillStyle = '#ffc21a'; g.fillRect(w * 0.12, h * 0.88, w * 0.76, 7);
  });
  const logoTex = () => makeDecal(128, 64, (g, w, h) => {
    g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(22, 12); g.lineTo(52, 32); g.lineTo(22, 52); g.stroke();
    g.strokeStyle = '#ffc21a'; g.beginPath(); g.moveTo(58, 12); g.lineTo(88, 32); g.lineTo(58, 52); g.stroke();
  });
  // Material-Fabrik: PBR (Physical/Standard + envMap) – ohne Env-Map Phong-Fallback
  const mat = o => {
    if (!env) return new THREE.MeshPhongMaterial({
      color: o.color, shininess: (1 - o.rough) * 220, specular: o.spec || 0x667788, side: THREE.DoubleSide,
      transparent: !!o.opacity, opacity: o.opacity || 1, map: o.map || null
    });
    const P = o.clear ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new P({
      color: o.color, metalness: o.metal, roughness: o.rough, envMap: env, envMapIntensity: o.env || 1,
      side: THREE.DoubleSide, map: o.map || null
    });
    if (o.clear) { m.clearcoat = 1; m.clearcoatRoughness = 0.08; }
    if (o.opacity) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    return m;
  };

  // Lackierung im Fragment-Shader: gestochen scharfe Streifen unabhängig von der Mesh-Auflösung.
  // `glsl` bekommt: u (relative Höhe 0..1), p (Position im Auto-Raum), col (Ausgabe) + die Farben deep/bright/white/gold/dark.
  const v3 = c => 'vec3(' + [c.r, c.g, c.b].map(x => x.toFixed(4)).join(',') + ')';
  const cDeep = new THREE.Color(0x8c0c22), cBright = new THREE.Color(0xff1a3a), cWhite = new THREE.Color(0xf4f6ff);
  const cGold = new THREE.Color(0xffc21a), cDark = new THREE.Color(0x181a22);
  const palette = 'vec3 deep=' + v3(cDeep) + ', bright=' + v3(cBright) + ', white=' + v3(cWhite) + ', gold=' + v3(cGold) + ', dark=' + v3(cDark) + ';\n';
  const hashStr = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  const liveryMat = (name, glsl) => {
    const m = mat({ color: 0xffffff, metal: 0.45, rough: 0.26, clear: true, env: 1.3, spec: 0xff8899 });
    m.userData.liv = name;
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aU;\nvarying float vU;\nvarying vec3 vOP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvU = aU; vOP = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vU;\nvarying vec3 vOP;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n{\nfloat u = vU; vec3 p = vOP; vec3 col = diffuseColor.rgb;\n' + palette + glsl + '\ndiffuseColor.rgb = col;\n}');
    };
    m.customProgramCacheKey = () => 'carLivery' + hashStr(glsl);
    return m;
  };
  const line = (d, w) => '(1.0 - smoothstep(0.0, 0.003, abs(' + d + ') - ' + w + '))';   // scharfe Linie (Mitte d=0, halbe Breite w)
  const livChassis = liveryMat('chassis', `
    float ax = abs(p.x);
    col = mix(deep, bright, smoothstep(0.12, 0.75, u));
    float top = smoothstep(0.52, 0.60, u);
    col = mix(col, white, top * ${line('ax - 0.055', '0.020')});
    col = mix(col, gold, top * ${line('ax - 0.099', '0.006')});
    col = mix(col, white, ${line('u - 0.47', '0.010')} * smoothstep(0.08, 0.16, ax) * (1.0 - smoothstep(0.45, 0.55, p.z)));
    col = mix(col, white, smoothstep(1.14, 1.17, p.z));
    col = mix(col, dark, 1.0 - smoothstep(0.16, 0.22, u));
    col *= 1.0 - 0.65 * (${line('p.z - 0.58', '0.0022')} + ${line('p.z + 0.46', '0.0022')});`);
  const livCover = liveryMat('cover', `
    float ax = abs(p.x);
    col = mix(deep, bright, smoothstep(0.15, 0.75, u));
    col = mix(col, white, smoothstep(0.70, 0.76, u) * ${line('ax', '0.026')});
    col *= 1.0 - 0.65 * (${line('p.z + 0.50', '0.0022')} + ${line('p.z + 0.80', '0.0022')});`);
  const livPod = liveryMat('pod', `
    float d = (p.z - 0.05) + (u - 0.5) * 0.35;
    col = mix(deep, bright, smoothstep(0.10, 0.70, u));
    col = mix(col, white, ${line('d', '0.030')});
    col = mix(col, gold, ${line('d + 0.072', '0.009')});
    col = mix(col, dark, 1.0 - smoothstep(0.14, 0.20, u));
    col *= 1.0 - 0.65 * ${line('p.z + 0.30', '0.0022')};`);

  const paint   = mat({ color: 0xff1a3a, metal: 0.45, rough: 0.26, clear: true, env: 1.3, spec: 0xff8899 });
  const glass   = mat({ color: 0x0a1830, metal: 0.9, rough: 0.05, opacity: 0.6, env: 1.7, spec: 0xaaccff });
  const carbon  = mat({ color: 0x1e1e28, metal: 0.35, rough: 0.45, env: 0.7, map: makeCarbonTex() });
  const darkMat = mat({ color: 0x07090f, metal: 0.2, rough: 0.6 });
  const chrome  = mat({ color: 0xdddde8, metal: 1.0, rough: 0.12, env: 1.2, spec: 0xffffff });
  const haloMat = mat({ color: 0x2b2f3a, metal: 0.85, rough: 0.32, env: 1.1, spec: 0xaaaaaa });
  const rimMat  = mat({ color: 0xcfd2da, metal: 1.0, rough: 0.22, env: 1.2, spec: 0xffffff });
  const discMat = mat({ color: 0x8a8f99, metal: 1.0, rough: 0.38 });
  const tireMat = mat({ color: 0xffffff, metal: 0.0, rough: 0.95, map: makeTreadTexture() });
  const softMat = mat({ color: 0xffcf1f, metal: 0.0, rough: 0.7 });          // Reifenmarkierung (Soft)
  const redMat  = mat({ color: 0xd01020, metal: 0.3, rough: 0.4 });
  const whiteMat = mat({ color: 0xffffff, metal: 0.1, rough: 0.3, env: 1.0 });

  const add = (geo, m, x, y, z, cast, parent) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    if (cast) mesh.castShadow = true;
    (parent || car).add(mesh);
    return mesh;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const ball = new THREE.SphereGeometry(1, 18, 12);
  const strut = (r, a, b, m) => {                // Zylinder zwischen zwei Punkten (Querlenker, Schubstreben)
    const A = new THREE.Vector3(a[0], a[1], a[2]), B = new THREE.Vector3(b[0], b[1], b[2]);
    const d = B.clone().sub(A), len = d.length();
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), m);
    s.position.copy(A).add(B).multiplyScalar(0.5);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    car.add(s);
    return s;
  };
  const wing = (span, chord, thick, camber, m, x, y, z, pitch) => {   // pitch > 0: Hinterkante nach oben
    const w = add(wingGeo(span, chord, thick, camber), m, x, y, z, true);
    w.rotation.x = pitch;
    return w;
  };
  const bodyPart = (geo, m) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; car.add(mesh); return mesh; };

  // ── Karosserie: Monocoque, Motorabdeckung, Seitenkästen als geformte Loft-Körper ──
  // Monocoque: lange, schlanke Nase -> hohes Cockpit mit Schultern -> schlankes Heck
  bodyPart(loftBody([
    [ 1.30, 0.035, 0.150, 0.205, 2.4, 0],
    [ 1.15, 0.060, 0.140, 0.225, 2.4, 0],
    [ 0.95, 0.095, 0.130, 0.265, 2.5, 0],
    [ 0.70, 0.150, 0.115, 0.345, 2.7, 0],
    [ 0.42, 0.205, 0.095, 0.425, 3.0, 0],
    [ 0.12, 0.235, 0.085, 0.455, 3.2, 0],
    [-0.20, 0.225, 0.085, 0.450, 3.0, 0],
    [-0.55, 0.170, 0.088, 0.410, 2.7, 0],
    [-0.80, 0.110, 0.095, 0.365, 2.5, 0],
    [-0.97, 0.075, 0.105, 0.340, 2.4, 0]
  ], 96, 56, false), livChassis);

  // Motorabdeckung mit Airbox, läuft nach hinten flach aus
  bodyPart(loftBody([
    [ 0.02, 0.070, 0.420, 0.470, 2.4, 0],
    [-0.14, 0.105, 0.400, 0.620, 2.6, 0],
    [-0.32, 0.125, 0.380, 0.700, 2.6, 0],
    [-0.62, 0.120, 0.340, 0.650, 2.6, 0],
    [-0.94, 0.115, 0.300, 0.600, 2.4, 0]
  ], 56, 40, false), livCover);

  // Seitenkästen: Bauch nach vorn, "Cola-Flaschen"-Verjüngung nach hinten
  [-1, 1].forEach(sx => {
    bodyPart(loftBody([
      [ 0.46, 0.075, 0.100, 0.215, 2.4, 0.30 * sx],
      [ 0.30, 0.120, 0.090, 0.320, 2.6, 0.35 * sx],
      [ 0.08, 0.145, 0.085, 0.375, 2.8, 0.37 * sx],
      [-0.18, 0.140, 0.085, 0.360, 2.8, 0.34 * sx],
      [-0.45, 0.100, 0.090, 0.290, 2.6, 0.26 * sx],
      [-0.75, 0.060, 0.095, 0.210, 2.4, 0.17 * sx]
    ], 70, 36, sx < 0), livPod);
    add(ball, darkMat, sx * 0.30, 0.16, 0.47).scale.set(0.06, 0.05, 0.03);           // Kühler-Einlass
    const bb = add(box(0.015, 0.15, 0.24), carbon, sx * 0.29, 0.17, 0.54);           // Bargeboard
    bb.rotation.y = sx * 0.14;
    [-0.20, -0.27, -0.34, -0.41].forEach(z => {                                      // Lüftungsschlitze oben auf dem Seitenkasten
      const v = add(box(0.07, 0.006, 0.02), darkMat, sx * (0.34 + (z + 0.18) * 0.296), 0.36 + (z + 0.18) * 0.26 + 0.002, z);
      v.rotation.x = -0.25;
    });
    add(box(0.035, 0.05, 0.045), carbon, sx * 0.34, 0.405, 0.04);                    // Kamera-Pod
    add(ball, darkMat, sx * 0.34, 0.415, 0.065).scale.set(0.014, 0.014, 0.01);
  });

  // Kühlschlitze auf der Motorabdeckung
  [-0.45, -0.55, -0.65, -0.75].forEach(z => {
    const sl = add(box(0.09, 0.008, 0.025), darkMat, 0, 0.70 + (z + 0.32) * 0.165 + 0.003, z);
    sl.rotation.x = -0.165;
  });
  // Startnummer auf beiden Airbox-Seiten
  const numTex = makeNumTex();
  if (numTex) {
    const numMat = mat({ color: 0xffffff, metal: 0.1, rough: 0.5, map: numTex, opacity: 1 });
    numMat.polygonOffset = true; numMat.polygonOffsetFactor = -2; numMat.polygonOffsetUnits = -2;
    [-1, 1].forEach(sx => {
      const pl = add(new THREE.PlaneGeometry(0.19, 0.19), numMat, sx * 0.128, 0.54, -0.32);
      pl.rotation.y = sx * Math.PI / 2;
    });
  }

  // Motorhauben-Lufteinlass + Haiflosse + T-Flügel
  add(ball, darkMat, 0, 0.60, -0.14).scale.set(0.085, 0.07, 0.04);
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(0.05, 0.14); finShape.lineTo(0.56, 0.05); finShape.lineTo(0.56, 0); finShape.lineTo(0, 0);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.02, bevelEnabled: false });
  finGeo.rotateY(Math.PI / 2);                     // (u, v, w) -> (w, v, -u): Flosse zeigt nach hinten
  finGeo.translate(-0.01, 0.62, -0.30);
  add(finGeo, paint, 0, 0, 0, true);
  add(box(0.06, 0.01, 0.12), darkMat, 0, 0.336, 0.74).rotation.x = 0.34;               // S-Duct-Schlitz auf der Nase
  strut(0.005, [0, 0.178, 1.28], [0, 0.178, 1.37], chrome);                             // Pitot-Rohr
  wing(0.30, 0.075, 0.08, -0.05, carbon, 0, 0.70, -0.72, 0.15);                         // T-Flügel
  [-1, 1].forEach(sx => add(box(0.01, 0.045, 0.08), carbon, sx * 0.15, 0.70, -0.72));

  // Unterboden, Bodenkanten-Finnen, Diffusor mit Finnen
  add(box(0.94, 0.03, 1.9), carbon, 0, 0.07, -0.05);
  [-1, 1].forEach(sx => [0.15, -0.25].forEach(z => add(box(0.012, 0.045, 0.34), carbon, sx * 0.455, 0.095, z)));
  add(box(0.8, 0.03, 0.4), carbon, 0, 0.115, -0.84).rotation.x = 0.22;
  [-0.18, 0, 0.18].forEach(x => add(box(0.012, 0.09, 0.3), carbon, x, 0.135, -0.85));

  // ── Cockpit: Öffnung mit Kragen, Kopfstütze, Helm mit Visier, Lenkrad, Halo, Spiegel ──
  add(ball, darkMat, 0, 0.44, 0.12).scale.set(0.15, 0.03, 0.30);
  const coam = add(new THREE.TorusGeometry(1, 0.10, 8, 32), carbon, 0, 0.445, 0.12);   // Cockpit-Kragen
  coam.rotation.x = Math.PI / 2; coam.scale.set(0.155, 0.32, 0.035);
  add(box(0.2, 0.09, 0.12), carbon, 0, 0.50, -0.07);
  const hmHelmet = add(ball, whiteMat, 0, 0.50, 0.12); hmHelmet.scale.set(0.085, 0.09, 0.10);
  const hmVisor = add(box(0.115, 0.036, 0.05), darkMat, 0, 0.515, 0.205);
  const hmStripe = add(box(0.02, 0.012, 0.18), redMat, 0, 0.587, 0.12);
  add(box(0.13, 0.05, 0.025), darkMat, 0, 0.49, 0.31).rotation.x = -0.5;                  // Lenkrad
  [-0.04, 0.04].forEach(x => add(box(0.018, 0.012, 0.01), redMat, x, 0.505, 0.315));
  const haloCurve = new THREE.CatmullRomCurve3([
    [-0.19, 0.44, -0.10], [-0.215, 0.55, 0.00], [-0.19, 0.63, 0.18], [-0.08, 0.675, 0.34], [0, 0.69, 0.40],
    [0.08, 0.675, 0.34], [0.19, 0.63, 0.18], [0.215, 0.55, 0.00], [0.19, 0.44, -0.10]
  ].map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const hmHalo = add(new THREE.TubeGeometry(haloCurve, 40, 0.016, 6, false), haloMat, 0, 0, 0, true);
  const hmStrut = strut(0.018, [0, 0.69, 0.40], [0, 0.38, 0.56], haloMat);
  [-1, 1].forEach(sx => {
    add(box(0.15, 0.022, 0.03), carbon, sx * 0.29, 0.47, 0.30);                       // Spiegelarm
    add(box(0.09, 0.06, 0.05), paint, sx * 0.36, 0.49, 0.29);                         // Spiegelgehäuse
    add(box(0.065, 0.04, 0.01), chrome, sx * 0.36, 0.49, 0.262);                      // Spiegelfläche
  });

  // ── Frontflügel: drei Profile (Wölbung nach unten), Leitbleche, geschwungene Endplatten ──
  wing(1.40, 0.30, 0.075, -0.045, carbon, 0, 0.085, 1.09, 0.05);
  wing(1.34, 0.17, 0.070, -0.06, paint, 0, 0.130, 1.00, 0.26);
  wing(1.22, 0.12, 0.070, -0.06, paint, 0, 0.170, 0.95, 0.40);
  [-0.55, -0.40, -0.26, 0.26, 0.40, 0.55].forEach(x => add(box(0.01, 0.035, 0.26), carbon, x, 0.055, 1.09));   // Leitbleche unter dem Profil
  [-1, 1].forEach(sx => {
    wing(0.26, 0.10, 0.07, -0.06, paint, sx * 0.54, 0.205, 0.99, 0.34);                  // Zusatzflap aussen
    add(plateGeo([[1.29, 0.03], [1.29, 0.075], [1.17, 0.215], [0.93, 0.245], [0.90, 0.03]], 0.028), paint, sx * 0.70, 0, 0, true);
    add(box(0.03, 0.03, 0.40), carbon, sx * 0.70, 0.03, 1.09);
    add(box(0.03, 0.05, 0.20), whiteMat, sx * 0.70, 0.215, 1.02);                     // weisser Akzent
    add(box(0.03, 0.05, 0.14), carbon, sx * 0.06, 0.10, 1.03);                        // Pylone
  });

  // ── Heckflügel: zwei Profile, grosse Endplatten, Pylone, Beam-Wing; Lichtleiste mit Streben ──
  wing(1.12, 0.30, 0.080, -0.06, paint, 0, 0.72, -0.98, 0.14);
  wing(1.10, 0.20, 0.075, -0.08, paint, 0, 0.84, -1.07, 0.38);
  wing(1.00, 0.18, 0.070, -0.05, carbon, 0, 0.50, -1.00, 0.12);                       // Beam-Wing
  add(box(0.06, 0.17, 0.10), carbon, 0, 0.635, -0.95);
  add(box(0.07, 0.04, 0.015), new THREE.MeshBasicMaterial({ color: 0xff2030 }), 0, 0.60, -1.007);   // Regenlicht
  [-1, 1].forEach(sx => {
    add(plateGeo([[-0.78, 0.50], [-0.78, 0.70], [-0.90, 0.93], [-1.26, 0.95], [-1.28, 0.50]], 0.026), paint, sx * 0.565, 0, 0, true);
    add(box(0.03, 0.05, 0.54), carbon, sx * 0.565, 0.51, -1.02);
    add(box(0.03, 0.09, 0.26), whiteMat, sx * 0.567, 0.88, -1.08);                    // weisser Akzent
    add(box(0.19, 0.025, 0.05), carbon, sx * 0.485, 0.34, -0.99);                     // Strebe Lichtleiste -> Endplatte
  });
  const tName = nameTex(), tLogo = logoTex();
  const decalMat = tex => {
    const m = mat({ color: 0xffffff, metal: 0.1, rough: 0.5, map: tex, opacity: 1 });
    m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
    return m;
  };
  if (tName) {
    const dm = decalMat(tName);
    [-1, 1].forEach(sx => { add(new THREE.PlaneGeometry(0.34, 0.17), dm, sx * 0.5805, 0.72, -1.08).rotation.y = sx * Math.PI / 2; });
  }
  if (tLogo) {
    const lm = decalMat(tLogo);
    [-1, 1].forEach(sx => { add(new THREE.PlaneGeometry(0.22, 0.11), lm, sx * 0.7155, 0.125, 1.08).rotation.y = sx * Math.PI / 2; });
  }
  add(box(0.78, 0.07, 0.10), carbon, 0, 0.34, -0.99);
  add(box(0.74, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0xff0022 }), 0, 0.35, -1.045);

  // ── Räder: Reifen mit Soft-Markierung, Felge mit 5 Speichen, Bremsscheibe + Sattel, Querlenker ──
  const tireGeo = new THREE.LatheGeometry([[0.14, -0.12], [0.225, -0.125], [0.26, -0.09], [0.27, 0], [0.26, 0.09], [0.225, 0.125], [0.14, 0.12]]
    .map(p => new THREE.Vector2(p[0], p[1])), 40);
  const barrelGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.2, 18, 1, true);
  const hubGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.26, 10);
  const discGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.02, 20);
  const backGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.012, 20);
  const spokeGeo = box(0.022, 0.135, 0.055);
  const lipGeo = new THREE.TorusGeometry(0.15, 0.016, 6, 24);
  const markGeo = new THREE.RingGeometry(0.185, 0.21, 40);
  const capGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10);
  [[0.62, 0.22, 0.7], [-0.62, 0.22, 0.7], [0.62, 0.22, -0.7], [-0.62, 0.22, -0.7]].forEach(p => {
    const out = Math.sign(p[0]), front = p[2] > 0, ws = front ? 1 : 1.18;           // hinten breitere Reifen
    const pivot = new THREE.Group();                 // Lenkachse + statischer Bremssattel
    pivot.position.set(p[0], p[1], p[2]);
    car.add(pivot);
    const spin = new THREE.Group();                  // dreht sich um die Achse
    pivot.add(spin);
    const tire = add(tireGeo, tireMat, 0, 0, 0, false, spin); tire.rotation.z = Math.PI / 2; tire.scale.y = ws;
    const barrel = add(barrelGeo, rimMat, 0, 0, 0, false, spin); barrel.rotation.z = Math.PI / 2; barrel.scale.y = ws;
    add(hubGeo, chrome, 0, 0, 0, false, spin).rotation.z = Math.PI / 2;
    add(discGeo, discMat, 0, 0, 0, false, spin).rotation.z = Math.PI / 2;
    add(backGeo, darkMat, out * 0.092 * ws, 0, 0, false, spin).rotation.z = Math.PI / 2;
    const lip = add(lipGeo, chrome, out * 0.104 * ws, 0, 0, false, spin); lip.rotation.y = Math.PI / 2;
    const mark = add(markGeo, softMat, out * 0.1275 * ws, 0, 0, false, spin); mark.rotation.y = Math.PI / 2;
    const cap = add(capGeo, redMat, out * 0.108 * ws, 0, 0, false, spin); cap.rotation.z = Math.PI / 2;
    const rr = add(new THREE.TorusGeometry(0.075, 0.007, 5, 24), redMat, out * 0.1 * ws, 0, 0, false, spin); rr.rotation.y = Math.PI / 2;
    for (let k = 0; k < 5; k++) {
      const a = k * Math.PI * 2 / 5, sp = add(spokeGeo, rimMat, out * 0.098 * ws, 0.078 * Math.cos(a), 0.078 * Math.sin(a), false, spin);
      sp.rotation.x = a;
    }
    add(box(0.07, 0.08, 0.12), redMat, 0, 0.11, 0, false, pivot);
    // Aufhängung: je zwei Querlenker oben/unten + Schubstrebe
    const ox = out * 0.47, ix = out * 0.12, py = front ? 0.30 : 0.37;
    strut(0.011, [ix, 0.30, p[2] + 0.10], [ox, 0.26, p[2]], carbon);
    strut(0.011, [ix, 0.30, p[2] - 0.10], [ox, 0.26, p[2]], carbon);
    strut(0.011, [ix, 0.13, p[2] + 0.11], [ox, 0.16, p[2]], carbon);
    strut(0.011, [ix, 0.13, p[2] - 0.11], [ox, 0.16, p[2]], carbon);
    strut(0.009, [ox, 0.18, p[2]], [out * 0.14, py, p[2]], carbon);
    carWheels.push(spin);
    if (front) carSteerPivots.push(pivot);
  });

  // Lichter: Scheinwerfer in Gehäusen am Frontflügel (leuchtend) + Auspuffrohre
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xeeeeff });
  [-0.28, 0.28].forEach(x => {
    add(box(0.15, 0.07, 0.12), carbon, x, 0.13, 1.18);
    add(box(0.12, 0.04, 0.02), hlMat, x, 0.14, 1.245);
  });
  const titan = mat({ color: 0x6a6f7c, metal: 1.0, rough: 0.3, env: 1.0, spec: 0xccccdd });
  [-0.12, 0.12].forEach(x => {
    const ex = add(new THREE.CylinderGeometry(0.03, 0.042, 0.18, 10), titan, x, 0.62, -0.97);
    ex.rotation.x = Math.PI / 2;
    add(new THREE.CircleGeometry(0.026, 10), darkMat, x, 0.62, -1.062).rotation.y = Math.PI;      // dunkle Mündung
  });

  car.scale.setScalar(1.3);
  buildCarExtras(car, rig);
  rig.env = env;
  rig.cockpitHide = [hmHelmet, hmVisor, hmStripe, hmStrut, hmHalo];     // im Cockpit-Blick ausgeblendet
  return car;
}

// Spiel-Auto: Modell bauen und in die Spielszene hängen
function buildCar() {
  const rig = { wheels: carWheels, steer: carSteerPivots, flames: carFlames, tails: carTailGlows };
  car = buildCarModel(renderer, rig);
  boostGlow = rig.boostGlow; underGlow = rig.underGlow; brakeGlow = rig.brakeGlow;
  cockpitHide = rig.cockpitHide || [];
  scene.add(car);

  // Abgas-Pool: gemeinsame Geometrie, feste Anzahl Materialien (kein Memory-Leak)
  const pGeo = new THREE.SphereGeometry(0.09, 6, 5);
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    m.userData = { life: 0, vel: new THREE.Vector3() };
    scene.add(m);
    exhaustPool.push(m);
  }
}

// ─── Welt ─────────────────────────────────────────────────────────────────────
// ─── Optik-Erweiterungen ──────────────────────────────────────────────────────
// Flammenkegel mit Vertex-Farben (Auspuff = hell, Spitze = dunkel/orange; additiv gemischt)
function flameCone(r, len, c0, c1) {
  const g = new THREE.ConeGeometry(r, len, 12, 4, true);
  g.rotateX(-Math.PI / 2);              // Spitze zeigt nach hinten (-z)
  g.translate(0, 0, -len / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(-pos.getZ(i) / len, 0, 1), k = 1 - t * t;
    col[i * 3]     = (c0[0] + (c1[0] - c0[0]) * t) * k;
    col[i * 3 + 1] = (c0[1] + (c1[1] - c0[1]) * t) * k;
    col[i * 3 + 2] = (c0[2] + (c1[2] - c0[2]) * t) * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Auto: Boost-Flammen, Bremslicht, Unterbodenglühen, Glow-Sprites, Kontaktschatten
function buildCarExtras(car, rig) {
  const carFlames = rig.flames, carTailGlows = rig.tails;   // lokal: Spiel und Menü haben getrennte Listen
  let boostGlow, underGlow, brakeGlow;
  const glowTex = getGlowTex();
  const spriteMat = (color, op) => new THREE.SpriteMaterial({
    map: glowTex, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending
  });

  // Boost-Flammen: drei Schichten mit Farbverlauf (Weiss am Auspuff -> Orange -> Rot), additiv, plus Glow
  const flameMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const flameGeos = [
    flameCone(0.10, 1.35, [1, 0.62, 0.18], [1, 0.16, 0.0]),    // äussere orange Hülle
    flameCone(0.065, 1.0, [1, 0.92, 0.5], [1, 0.5, 0.08]),     // gelber Mantel
    flameCone(0.035, 0.7, [1, 1, 1], [1, 0.85, 0.55])          // weisser Kern
  ];
  [-0.12, 0.12].forEach(x => {
    const f = new THREE.Group();
    flameGeos.forEach(fg => f.add(new THREE.Mesh(fg, flameMat)));
    const gs = new THREE.Sprite(spriteMat(0xff9a30, 0.9)); gs.scale.set(0.7, 0.7, 1); gs.position.set(0, 0, -0.15);
    f.add(gs);
    f.position.set(x, 0.62, -1.06);
    f.visible = false;
    car.add(f);
    carFlames.push(f);
  });
  boostGlow = new THREE.Sprite(spriteMat(0xff8a2a, 0));      // grosser Schein hinter dem Heck
  boostGlow.scale.set(1.6, 1.6, 1); boostGlow.position.set(0, 0.62, -1.5);
  boostGlow.visible = false;
  car.add(boostGlow);

  const ugGeo = new THREE.PlaneGeometry(1.5, 2.8);
  ugGeo.rotateX(-Math.PI / 2);
  underGlow = new THREE.Mesh(ugGeo, new THREE.MeshBasicMaterial({
    color: 0x3388ff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  underGlow.position.set(0, 0.03, 0);
  car.add(underGlow);

  brakeGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.35), new THREE.MeshBasicMaterial({
    color: 0xff1133, transparent: true, opacity: 0.9, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  }));
  brakeGlow.position.set(0, 0.4, -1.0);
  brakeGlow.rotation.y = Math.PI;
  brakeGlow.visible = false;
  car.add(brakeGlow);

  // Scheinwerfer-Glow + weiche Lichtkegel, Rücklicht-Glow
  [-0.28, 0.28].forEach(x => {
    const s = new THREE.Sprite(spriteMat(0xdfe8ff, 0.9)); s.scale.set(0.6, 0.6, 1); s.position.set(x, 0.14, 1.27);
    car.add(s);
    const beamGeo = new THREE.ConeGeometry(0.5, 3.2, 14, 1, true); beamGeo.rotateX(-Math.PI / 2);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xcfe0ff, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
    beam.position.set(x, 0.15, 1.3 + 1.6);
    car.add(beam);
  });
  [-0.3, 0.3].forEach(x => {
    const s = new THREE.Sprite(spriteMat(0xff2244, 0.8)); s.scale.set(0.5, 0.35, 1); s.position.set(x, 0.38, -1.0);
    car.add(s);
    carTailGlows.push(s);
  });

  // Weicher Kontaktschatten (Blob) direkt auf der Fahrbahn
  const bg = new THREE.PlaneGeometry(1.8, 3.3); bg.rotateX(-Math.PI / 2);
  const blobM = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({
    map: makeBlobTexture(), transparent: true, opacity: 0.75, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  }));
  blobM.position.set(0, -0.03, 0);
  car.add(blobM);
  rig.boostGlow = boostGlow; rig.underGlow = underGlow; rig.brakeGlow = brakeGlow;
}

function updateCarFx(dt) {
  const t = performance.now() * 0.001;
  flameK += ((boost.on ? 1 : 0) - flameK) * (1 - Math.exp(-16 * dt));      // Flammen wachsen / schrumpfen weich
  const fv = flameK > 0.03;
  for (let i = 0; i < carFlames.length; i++) {
    const f = carFlames[i];
    f.visible = fv;
    if (fv) f.scale.set(flameK * (1 + 0.12 * Math.sin(t * 70 + i)), flameK * (1 + 0.12 * Math.cos(t * 63 + i)), flameK * (0.85 + 0.5 * Math.abs(Math.sin(t * 55 + i * 2.1))));
  }
  boostGlow.visible = fv;
  if (fv) {
    boostGlow.material.opacity = 0.7 * flameK * (0.8 + 0.2 * Math.sin(t * 50));
    boostGlow.scale.setScalar(1.5 + 0.35 * flameK * Math.sin(t * 37));
  }
  brakeGlow.visible = cs.braking;
  const tg = cs.braking ? 1.0 : 0.6;
  for (let i = 0; i < carTailGlows.length; i++) carTailGlows[i].scale.set(0.5 * tg + 0.1, 0.35 * tg + 0.05, 1);
  underGlow.material.color.setHex(boost.on ? 0xffaa33 : 0x3388ff);
  underGlow.material.opacity = 0.18 + 0.14 * clamp(Math.abs(cs.speed) / MAX_SPEED, 0, 1) + (boost.on ? 0.15 : 0);
}

// Strecke: Rennlinie/Risse, rot-weisse Leitplankenkante, Katzenaugen
function makeWearTexture() {
  const S = 512;
  const { c, g } = newCanvas(S, S);
  g.clearRect(0, 0, S, S);
  const rnd = mulberry32(21);
  // Reifenspuren (Gummiabrieb) in beiden Spuren
  [140, 372].forEach(x => {
    const gr = g.createLinearGradient(x - 70, 0, x + 70, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.40)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - 70, 0, 140, S);
    g.fillStyle = 'rgba(70,72,84,0.10)';                       // leicht polierter Kern
    g.fillRect(x - 12, 0, 24, S);
  });
  // Öl- und Gummiflecken
  for (let i = 0; i < 8; i++) {
    const x = 60 + rnd() * (S - 120), y = rnd() * S, r = 10 + rnd() * 22;
    drawWrapped(S, x, y, r, (px, py) => blob(g, px, py, r, '0,0,0', 0.28));
  }
  // Brems-/Driftspuren (diagonale dunkle Schlieren)
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x = 90 + rnd() * 330, y = 40 + rnd() * (S - 200);
    g.strokeStyle = 'rgba(0,0,0,' + (0.18 + rnd() * 0.14) + ')'; g.lineWidth = 3 + rnd() * 2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20 + rnd() * 30, y + 60, x + 30 + rnd() * 50, y + 130); g.stroke();
  }
  // feine Risse
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 10; i++) crack(g, rnd, 20 + rnd() * (S - 40), 20 + rnd() * (S - 160), 5 + (rnd() * 5 | 0), 1);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = 'rgba(0,0,0,' + (0.06 + rnd() * 0.12) + ')';
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  return toTexture(c, true);
}

function buildTrackExtras() {
  const wearMat = new THREE.MeshBasicMaterial({
    map: makeWearTexture(), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide
  });
  addMesh(buildStrip(0, N, () => [[-HALF_W + 0.4, 0.012], [HALF_W - 0.4, 0.012]], { vLen: ROAD_VLEN }), wearMat);

  const okRail = [];
  for (let i = 0; i < N; i++) okRail.push(!inTunnel(i));
  const bandMat = lambert(0xffffff, { map: makeKerbTexture() });
  if (!CITY) buildRuns(okRail).forEach(run => {          // Stadt: Barriere hat eigene Neon-Streifen
    [1, -1].forEach(sg => {
      addMesh(buildStrip(run.a, run.b, () => [[sg * (HALF_W + 0.82), 1.03], [sg * (HALF_W + 1.08), 1.03]], { vLen: KERB_VLEN }), bandMat);
    });
  });

  // Zusätzliche rot-weisse Curbs an der Kurveninnenseite (nur in Kurven)
  if (SCENE.APEX_KERBS) {
    const kap = smoothCircular(frames.map(f => f.kappa), 6);
    const apexMat = kerbMaterial({ polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    [1, -1].forEach(sg => {
      const okK = kap.map((k, i) => k * sg > 0.02 && !inTunnel(i));
      buildRuns(okK).forEach(run => {
        if (run.b - run.a < 6) return;
        addMesh(buildStrip(run.a, run.b, () => [[sg * (HALF_W - 1.1), 0.03], [sg * HALF_W, 0.03]], { vLen: KERB_VLEN }), apexMat);
      });
    });
  }

  // Schotterstreifen neben den Kerbs (läuft nach aussen weich ins Gras aus)
  const okGravel = [];
  for (let i = 0; i < N; i++) okGravel.push(!inBridge(i) && !inTunnel(i));
  const gravMat = CITY ? lambert(0xffffff, {                // Stadt: Gehweg-Platten statt Schotter
    map: makeCitySidewalkTexture(), emissive: 0x0a0c18, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  }) : lambert(0xffffff, {
    map: makeGravelTexture(), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  });
  buildRuns(okGravel).forEach(run => {
    [1, -1].forEach(sg => {
      addMesh(buildStrip(run.a, run.b, () => [[sg * (HALF_W + 0.75), -0.03], [sg * (HALF_W + 3.4), -0.03]], { vLen: 2.65 }), gravMat);
    });
  });

  const pos = [], col = [];
  const step = Math.max(1, Math.round(6 / DS));
  for (let i = 0; i < N; i += step) {
    const f = frames[i];
    (CITY ? [[1, 0.1, 0.9, 1], [-1, 1, 0.2, 0.85]] : [[1, 1, 1, 1], [-1, 1, 0.55, 0.1]]).forEach(e => {
      const p = wp(f, e[0] * (HALF_W - 0.35), 0.05);
      pos.push(p.x, p.y, p.z);
      col.push(e[1], e[2], e[3]);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const eyes = new THREE.Points(g, new THREE.PointsMaterial({
    size: 1.0, map: makeGlowTexture(), vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  eyes.frustumCulled = false;
  scene.add(eyes);
}

// Umgebung: Bergsilhouette (folgt der Kamera), Mond-Halo, Leuchtbaken
// ─── Umgebung ─────────────────────────────────────────────────────────────────
// Gelände: Boden, Bäume, Büsche, Steine, Stadt-Kulisse, Sterne/Mond
function createScenery() {
  if (CITY) { createCityScenery(); return; }       // Neon-Stadt: Boden, Hochhäuser, Reklamen
  if (ALPINE) { createAlpineScenery(); return; }   // Bergpass: Höhengelände, Wolkenmeer, Bergwelt
  // Boden: Textur + niederfrequente Vertex-Farben (bricht das Kachelmuster, Erdflecken)
  const gg = new THREE.PlaneGeometry(1600, 1600, 96, 96);
  const pa = gg.attributes.position, gc = new Float32Array(pa.count * 3);
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i);
    const n = fbm(x * 0.011 + 7, y * 0.011 + 3), m = fbm(x * 0.045, y * 0.045);
    const lum = 0.62 + 0.9 * n + 0.3 * (m - 0.5);
    const dirt = smooth01(0.58, 0.72, fbm(x * 0.018 + 40, y * 0.018 + 9));
    gc[i * 3]     = MOONRING ? lum * 0.5 : lum * (0.95 + dirt * 1.45);
    gc[i * 3 + 1] = MOONRING ? lum * 0.56 : lum * (1.12 + dirt * 0.03);
    gc[i * 3 + 2] = MOONRING ? lum * 0.66 : lum * (0.90 - dirt * 0.10);
  }
  gg.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  const ground = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ map: MOONRING ? makeFrostGroundTexture() : makeGroundTexture(), color: 0xffffff, vertexColors: true }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  scene.add(ground);

  const sc = (x, y, z) => new THREE.Vector3(x, y, z);
  const scatter = (seed, count, tries, rx, rz, minD, maxD) => {
    const rn = mulberry32(seed), out = [];
    for (let t = 0; t < tries && out.length < count; t++) {
      const x = (rn() - 0.5) * rx, z = (rn() - 0.5) * rz;
      const d2 = minDistToTrack2(x, z, minD * minD);
      if (d2 < minD * minD) continue;
      if (maxD && d2 > maxD * maxD) continue;
      if (MR_LAKE && Math.hypot(x - MR_LAKE.x, z - MR_LAKE.z) < MR_LAKE.r + 5) continue;
      out.push({ x, z, a: rn(), b: rn(), c: rn(), d: rn() });
      sceneryPts.push(x, z);
    }
    return out;
  };
  const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l);
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const whiteFlat = new THREE.MeshLambertMaterial({ color: 0xffffff });   // Flat-Look über Geometrie-Normalen (r128: kein flatShading bei Lambert)
  white.onBeforeCompile = swayShader;          // Wind: Laub wiegt im Vertex-Shader (keine CPU-Arbeit)
  whiteFlat.onBeforeCompile = swayShader;
  const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff });     // Steine wiegen nicht
  const tryN = n => Math.max(6000, n * 30);

  // Kiefern (Instancing, Farbvariation)
  const pines = scatter(2026, SCENE.PINES, tryN(SCENE.PINES), 560, 420, 28);
  const trunkG = new THREE.CylinderGeometry(0.14, 0.22, 1, 6); trunkG.translate(0, 0.5, 0);
  const cone1G = new THREE.ConeGeometry(1.5, 3.4, 7); cone1G.translate(0, 1.7, 0);
  const cone2G = new THREE.ConeGeometry(1.0, 2.6, 7); cone2G.translate(0, 1.3, 0);
  const pS = t => 0.9 + t.a * 1.1;
  const nFar0 = scene.children.length;
  makeInstanced(trunkG, new THREE.MeshLambertMaterial({ color: 0x2a1a0a }),
    pines.map(t => ({ p: sc(t.x, GROUND_Y, t.z), s: sc(pS(t), 2.2 * pS(t), pS(t)) })));
  makeInstanced(cone1G, white, pines.map(t => ({ p: sc(t.x, GROUND_Y + 1.6 * pS(t), t.z), s: sc(pS(t), pS(t), pS(t)), c: MOONRING ? hsl(0.46 + (t.b - 0.5) * 0.05, 0.30, 0.17 + t.c * 0.06) : hsl(0.34 + (t.b - 0.5) * 0.05, 0.6, 0.07 + t.c * 0.05) })));
  makeInstanced(cone2G, white, pines.map(t => ({ p: sc(t.x, GROUND_Y + 3.4 * pS(t), t.z), s: sc(pS(t), pS(t), pS(t)), c: MOONRING ? hsl(0.58 + (t.b - 0.5) * 0.03, 0.35, 0.60 + t.c * 0.14) : hsl(0.33 + (t.b - 0.5) * 0.05, 0.55, 0.11 + t.c * 0.06) })));

  tagSince(1, nFar0);
  // Bäume nahe der Strecke (zusätzlicher Streckenrand)
  const nearPines = scatter(6060, quality >= 2 ? SCENE.NEAR_PINES : Math.round(SCENE.NEAR_PINES * 0.55), tryN(SCENE.NEAR_PINES), 520, 400, 21, 38);
  makeInstanced(trunkG, new THREE.MeshLambertMaterial({ color: 0x2a1a0a }),
    nearPines.map(t => ({ p: sc(t.x, GROUND_Y, t.z), s: sc(pS(t), 2.2 * pS(t), pS(t)) })));
  makeInstanced(cone1G, white, nearPines.map(t => ({ p: sc(t.x, GROUND_Y + 1.6 * pS(t), t.z), s: sc(pS(t), pS(t), pS(t)), c: MOONRING ? hsl(0.46 + (t.b - 0.5) * 0.05, 0.30, 0.17 + t.c * 0.06) : hsl(0.34 + (t.b - 0.5) * 0.05, 0.6, 0.07 + t.c * 0.05) })));
  makeInstanced(cone2G, white, nearPines.map(t => ({ p: sc(t.x, GROUND_Y + 3.4 * pS(t), t.z), s: sc(pS(t), pS(t), pS(t)), c: MOONRING ? hsl(0.58 + (t.b - 0.5) * 0.03, 0.35, 0.60 + t.c * 0.14) : hsl(0.33 + (t.b - 0.5) * 0.05, 0.55, 0.11 + t.c * 0.06) })));

  const nLeaf0 = scene.children.length;
  // Laubbäume
  const leafy = scatter(3030, SCENE.LEAFY, tryN(SCENE.LEAFY), 560, 420, 26);
  const lTrunk = new THREE.CylinderGeometry(0.13, 0.22, 1.7, 6); lTrunk.translate(0, 0.85, 0);
  const crown = new THREE.IcosahedronGeometry(1.5, 1); crown.scale(1, 0.85, 1); crown.translate(0, 2.7, 0); crown.computeVertexNormals();
  const lS = t => 0.9 + t.a * 0.7;
  makeInstanced(lTrunk, new THREE.MeshLambertMaterial({ color: 0x3a2814 }),
    leafy.map(t => ({ p: sc(t.x, GROUND_Y, t.z), s: sc(lS(t), lS(t), lS(t)) })));
  makeInstanced(crown, whiteFlat, leafy.map(t => ({
    p: sc(t.x, GROUND_Y, t.z), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.d * 6.28),
    s: sc(lS(t), lS(t), lS(t)), c: hsl(0.27 + (t.b - 0.5) * 0.08, 0.5, 0.09 + t.c * 0.06)
  })));

  // Pappeln: hohe, schlanke Bäume in warmem Herbstgrün (dritte Baumart)
  const poplars = scatter(7070, SCENE.POPLARS, tryN(SCENE.POPLARS), 540, 410, 22, 60);
  const popTrunk = new THREE.CylinderGeometry(0.1, 0.18, 1, 6); popTrunk.translate(0, 0.5, 0);
  const popCrown = new THREE.IcosahedronGeometry(1, 1); popCrown.scale(0.8, 3.2, 0.8); popCrown.translate(0, 4.2, 0); popCrown.computeVertexNormals();
  const poS = t => 0.9 + t.a * 0.9;
  makeInstanced(popTrunk, new THREE.MeshLambertMaterial({ color: 0x5a4a38 }),
    poplars.map(t => ({ p: sc(t.x, GROUND_Y, t.z), s: sc(poS(t), 2.2 * poS(t), poS(t)) })));
  makeInstanced(popCrown, whiteFlat, poplars.map(t => ({
    p: sc(t.x, GROUND_Y, t.z), s: sc(poS(t), poS(t), poS(t)),
    c: hsl(0.17 + (t.b - 0.5) * 0.1, 0.55, 0.12 + t.c * 0.08)
  })));

  tagSince(1, nLeaf0);
  // Büsche und Felsen (Mindestabstand 16 m: bleiben hinter den Zäunen)
  const bushes = scatter(4040, SCENE.BUSHES, tryN(SCENE.BUSHES), 520, 400, 16, 55);
  const nBush0 = scene.children.length;
  const bushG = new THREE.IcosahedronGeometry(0.7, 1); bushG.translate(0, 0.3, 0); bushG.computeVertexNormals();
  makeInstanced(bushG, whiteFlat, bushes.map(t => ({
    p: sc(t.x, GROUND_Y, t.z), s: sc(0.8 + t.a * 1.1, 0.6 + t.b * 0.5, 0.8 + t.c * 1.1),
    c: hsl(0.28 + (t.d - 0.5) * 0.08, 0.5, 0.08 + t.a * 0.07)
  })));
  tagSince(2, nBush0);
  const rocks = scatter(5050, SCENE.ROCKS, tryN(SCENE.ROCKS), 520, 400, 16, 70);
  const nRock0 = scene.children.length;
  const rockG = new THREE.DodecahedronGeometry(0.6, 0); rockG.computeVertexNormals();
  const _e2 = new THREE.Euler();
  makeInstanced(rockG, rockMat, rocks.map(t => ({
    p: sc(t.x, GROUND_Y + 0.15, t.z), q: new THREE.Quaternion().setFromEuler(_e2.set(t.a * 6, t.b * 6, t.c * 6)),
    s: sc(0.5 + t.a * 1.4, 0.35 + t.b * 0.9, 0.5 + t.c * 1.2), c: hsl(0.6, 0.07, 0.12 + t.d * 0.12)
  })));

  tagSince(1, nRock0);
  const nBld0 = scene.children.length;
  // Stadt-Kulisse: Gebäude mit Leuchtfenstern (eine zusammengefasste Geometrie)
  const rb = mulberry32(555);
  const blds = [];
  for (let tr = 0; tr < 4000 && blds.length < SCENE.BUILDINGS; tr++) {
    const x = (rb() - 0.5) * 640, z = (rb() - 0.5) * 480;
    if (minDistToTrack2(x, z, 45 * 45) < 45 * 45) continue;
    blds.push({ x, z, w: 6 + rb() * 10, h: 8 + rb() * 32, d: 6 + rb() * 10, o: rb() });
  }
  const geos = [];
  blds.forEach(b => {
    const gb = new THREE.BoxGeometry(b.w, b.h, b.d);
    const uv = gb.attributes.uv, nr = gb.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(nr.getY(i)) > 0.5) uv.setXY(i, 0.01, 0.01);
      else uv.setXY(i, uv.getX(i) * (Math.abs(nr.getX(i)) > 0.5 ? b.d : b.w) / 16 + b.o, uv.getY(i) * b.h / 16);
    }
    gb.translate(b.x, GROUND_Y + b.h / 2, b.z);
    geos.push(gb);
  });
  const fac = makeFacadeTextures();
  addMesh(mergeGeos(geos), lambert(0xffffff, { map: fac.map, emissive: 0xffffff, emissiveMap: fac.emi }));
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
    blds.map(b => ({ p: sc(b.x, GROUND_Y + b.h + 0.15, b.z), s: sc(b.w * 1.02, 0.3, b.d * 1.02) })));
  const acItems = [], beacons = [];
  blds.forEach((b, i) => {
    acItems.push({ p: sc(b.x - b.w * 0.25, GROUND_Y + b.h + 0.9, b.z + b.d * 0.2), s: sc(1.8, 1.2, 2.4) });
    acItems.push({ p: sc(b.x + b.w * 0.2, GROUND_Y + b.h + 0.7, b.z - b.d * 0.2), s: sc(1.2, 0.8, 1.4) });
    if (i % 3 === 0) { acItems.push({ p: sc(b.x, GROUND_Y + b.h + 3.5, b.z), s: sc(0.12, 6, 0.12) }); beacons.push(b.x, GROUND_Y + b.h + 6.6, b.z); }
  });
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x2b3446 }), acItems);
  glowPoints(beacons, 5, 0xff3344);
  tagSince(1, nBld0);

  createStars();
  if (!THEME.moon || MOONRING) return;      // Mondlicht-Ring baut seinen Mond selbst (buildMoonRingSky)
  const mc = newCanvas(128, 64);
  mc.g.fillStyle = '#dde8ff'; mc.g.fillRect(0, 0, 128, 64);
  const mr = mulberry32(8);
  for (let i = 0; i < 14; i++) blob(mc.g, mr() * 128, mr() * 64, 5 + mr() * 9, '120,140,180', 0.35);
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(14, 20, 14), new THREE.MeshBasicMaterial({ map: toTexture(mc.c, false), fog: false }));
  moonMesh.position.set(-250, 220, -300);
  scene.add(moonMesh);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTex(), color: 0xaac0ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }));
  moonGlow.scale.set(130, 130, 1);
  moonGlow.position.copy(moonMesh.position);
  scene.add(moonGlow);
}

// Sterne (am Abend/in der Stadt schwächer)
function createStars() {
  if (THEME.stars > 0) {
    const rs = mulberry32(31);
    const sp = [];
    for (let i = 0; i < (THEME.starCount || 500); i++) {
      const a = rs() * Math.PI * 2, e = 0.15 + rs() * 1.3;
      sp.push(Math.cos(a) * Math.cos(e) * 450, Math.sin(e) * 450, Math.sin(a) * Math.cos(e) * 450);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: THEME.stars < 1, opacity: THEME.stars
    }));
    stars.frustumCulled = false;
    scene.add(stars);
  }
}

// Himmelskuppel mit Verlauf + wenige Wolken (folgt der Kamera)
// Himmelskuppel mit Verlauf, Sonne (Scheibe + Glow) und driftenden Wolken; folgt der Kamera
function createSky() {
  skyGroup = new THREE.Group();
  const { c, g } = newCanvas(8, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  THEME.sky.forEach(st => gr.addColorStop(st[0], st[1]));
  g.fillStyle = gr; g.fillRect(0, 0, 8, 256);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16),
    new THREE.MeshBasicMaterial({ map: toTexture(c, false), side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -5;
  skyGroup.add(dome);
  const cloudTex = makeCloudTexture();
  const rn = mulberry32(77);
  for (let i = 0; i < SCENE.CLOUDS; i++) {
    const a = rn() * Math.PI * 2, r = 380, y = 50 + rn() * 170;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, color: THEME.cloud, transparent: true, opacity: THEME.cloudOp * (0.6 + rn() * 0.6), depthWrite: false, fog: false
    }));
    s.scale.set(150 + rn() * 120, 40 + rn() * 25, 1);
    s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    s.renderOrder = -4;
    skyGroup.add(s);
    cloudSprites.push(s);
  }
  // Sonne in Richtung des Hauptlichts: grosser Halo, Glow, Scheibe (additiv, hinter den Bergen)
  if (THEME.sunVisible) {
    const sd = LDIR.clone().normalize().multiplyScalar(520);
    const mk = (map, color, op, size, ro) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
      }));
      sp.scale.set(size, size, 1); sp.position.copy(sd); sp.renderOrder = ro;
      skyGroup.add(sp);
    };
    if (THEME.retroSun) {
      mk(getGlowTex(), 0xff2bd6, 0.45, 1000, -8);
      mk(getGlowTex(), 0xff7a50, 0.8, 480, -7);
      mk(makeRetroSunTexture(), 0xffffff, 1, 170, -6);
    } else if (ALPINE) {
      mk(getGlowTex(), 0xffb078, 0.5, 1300, -8);
      mk(getGlowTex(), 0xffd8a0, 0.9, 520, -7);
      mk(makeSunDiscTexture(), 0xfff4d8, 1, 84, -6);
    } else {
    mk(getGlowTex(), 0xff7a50, 0.5, 1100, -8);
    mk(getGlowTex(), 0xffa860, 0.9, 420, -7);
    mk(makeSunDiscTexture(), 0xfff2c8, 1, 70, -6);
    }
  }
  if (ALPINE) buildAlpineSky();
  if (MOONRING) buildMoonRingSky();
  scene.add(skyGroup);
}

// ─── Umgebung: Berge (3 Schichten), Mond-Halo, Leuchtbaken ────────────────────
function makeMountainTexture(ph, amp, top, bottom) {
  const W = 4096, H = 512, K = H / 128;                 // hochaufgelöst (vorher 1024x128 -> verwaschen, Treppenkanten)
  const { c, g } = newCanvas(W, H);
  g.clearRect(0, 0, W, H);
  const ridge = x => {
    const a = x / W * Math.PI * 2;
    return 64 + 22 * Math.sin(a * 3 + 1 + ph) + 14 * Math.sin(a * 7 + 2 + ph) + 8 * Math.sin(a * 17 + 0.5 + ph) + 5 * Math.sin(a * 41 + ph);
  };
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) g.lineTo(x, H - ridge(x) * amp * K);
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  const t = toTexture(c, false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function buildSceneryExtras() {
  mountains = new THREE.Group();
  [[445, 0.0, 1.0, THEME.mtn[0][0], THEME.mtn[0][1], -4], [425, 2.2, 0.72, THEME.mtn[1][0], THEME.mtn[1][1], -3], [405, 4.1, 0.48, THEME.mtn[2][0], THEME.mtn[2][1], -2]].forEach(L => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(L[0], L[0], 128, 96, 1, true),
      new THREE.MeshBasicMaterial({ map: (CITY ? makeSkylineTexture : (ALPINE || MOONRING) ? makeAlpinePeakTexture : makeMountainTexture)(L[1], L[2], L[3], L[4]), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.frustumCulled = false;
    m.renderOrder = L[5];
    mountains.add(m);
  });
  mountains.position.y = MTN_Y;
  scene.add(mountains);
  if (CITY || ALPINE || MOONRING) return;        // Stadt: Skyline statt Berge, keine Leuchtbaken im Gelände

  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute([-250, 220, -300], 3));
  const halo = new THREE.Points(hg, new THREE.PointsMaterial({
    size: 120, map: makeGlowTexture(), color: 0x8aa6ff, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }));
  halo.frustumCulled = false;
  if (THEME.moon) scene.add(halo);

  const rnd = mulberry32(808);
  const spots = [];
  for (let tries = 0; tries < 4000 && spots.length < 24; tries++) {
    const x = (rnd() - 0.5) * 600, z = (rnd() - 0.5) * 440;
    if (minDistToTrack2(x, z, 48 * 48) < 48 * 48) continue;
    spots.push({ x, z });
  }
  const palette = [[0.1, 0.9, 1], [1, 0.2, 0.8], [1, 0.55, 0.1]];
  const pos = [], col = [];
  spots.forEach((s, i) => {
    pos.push(s.x, GROUND_Y + 15.4, s.z);
    col.push(palette[i % 3][0], palette[i % 3][1], palette[i % 3][2]);
  });
  makeInstanced(new THREE.CylinderGeometry(0.15, 0.25, 15, 6), new THREE.MeshLambertMaterial({ color: 0x445566 }),
    spots.map(s => ({ p: new THREE.Vector3(s.x, GROUND_Y + 7.5, s.z) })));
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const beacons = new THREE.Points(bg, new THREE.PointsMaterial({
    size: 10, map: makeGlowTexture(), vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  beacons.frustumCulled = false;
  scene.add(beacons);
}

// ─── Streckendeko: Banden, Fahnen, Torbögen, Tunnel-Lichter, Schilder ───────────
function trackFree(i, m) {   // frei von Brücke, Unterführung, Tunnel und Start (m = Abstand in Samples)
  return Math.abs(wrapIdx(i - bridgeR.c)) > bridgeR.h + m && Math.abs(wrapIdx(i - underR.c)) > underR.h + m &&
         Math.abs(wrapIdx(i - tunnelR.c)) > tunnelR.h + m && Math.abs(wrapIdx(i)) > m + 30;
}
function isStraight(i, r, k) {
  for (let j = -r; j <= r; j += 2) if (Math.abs(frames[mod(i + j)].kappa) > k) return false;
  return true;
}

// Fahnen: Wellen im Vertex-Shader (gleiche Uniforms wie das Publikum)
function windShader(sh) {
  sh.uniforms.uTime = crowdUni.time; sh.uniforms.uAmp = crowdUni.amp;
  sh.vertexShader = 'uniform float uTime;\nuniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n' +
    '#ifdef USE_INSTANCING\n' +
    'float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;\n' +
    'float kk = position.x / 2.2;\n' +
    'transformed.z += sin(uTime * 5.0 - position.x * 3.2 + ph) * 0.17 * kk * uAmp;\n' +
    'transformed.y += sin(uTime * 3.7 - position.x * 2.0 + ph) * 0.05 * kk * uAmp;\n' +
    '#endif');
}

// Streckendeko: Torbögen, Banden, Fahnen, Kurvenschilder, Brücken- und Tunnellicht
function createTrackDetails() {
  const Yaxis = new THREE.Vector3(0, 1, 0);
  const rotL = new THREE.Quaternion().setFromAxisAngle(Yaxis, -Math.PI / 2);   // Schild auf der linken Seite: Blick zur Strecke
  const rotR = new THREE.Quaternion().setFromAxisAngle(Yaxis, Math.PI / 2);    // rechte Seite
  const rotB = new THREE.Quaternion().setFromAxisAngle(Yaxis, Math.PI);        // Blick zum anrollenden Fahrer
  const sideQuat = (f, sg) => frameQuat(f).multiply(sg > 0 ? rotL : rotR);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const SP = CITY ? CITY_SPONSORS : ALPINE ? ALP_SPONSORS : SPONSORS;

  // Torbögen (Gantries) über geraden Abschnitten
  SCENE.GANTRY_AT.forEach(fr => {
    if (CITY) { const ci = cityStraightSpot(fr, 60, false); if (ci >= 0) gantrySpots.push(ci); return; }
    const b0 = Math.round(N * fr);
    for (let d = 0; d < 520; d++) {
      const i = mod(b0 + (d % 2 ? -1 : 1) * Math.ceil(d / 2));
      if (trackFree(i, 24) && isStraight(i, 10, 0.01) && gantrySpots.every(s => Math.abs(wrapIdx(i - s)) > 60)) { gantrySpots.push(i); break; }
    }
  });
  const gClear = Math.round(4.5 / DS) + 3;

  if (CITY) createCityArches(); else if (ALPINE) createAlpineArches(); else {
  const gPillar = [], gBeam = [], gBar = [], gCone = [], gPool = [], gLights = [], gTop = [], gBanner = [[], []];
  const gw = HALF_W + 1.9;
  gantrySpots.forEach((gi, n) => {
    const f = frames[gi];
    [-1, 1].forEach(sg => {
      const b = wp(f, sg * gw, -0.05);
      gPillar.push({ p: V3(b.x, b.y + 4.15, b.z), q: yawQuat(f), s: V3(0.5, 8.3, 0.5) });
      const tp = wp(f, sg * gw, 8.7);
      gTop.push(tp.x, tp.y, tp.z);
    });
    gBeam.push({ p: wp(f, 0, 8.1), q: frameQuat(f), s: V3(gw * 2 + 0.5, 0.7, 0.7) });
    gBar.push({ p: wp(f, 0, 7.65), q: frameQuat(f), s: V3(gw * 2 - 1.0, 0.1, 0.32) });
    for (let k = -2; k <= 2; k++) {
      const lp = wp(f, k * 3.0, 7.55);
      gLights.push(lp.x, lp.y, lp.z);
      gCone.push({ p: wp(f, k * 3.0, 3.8) });
      gPool.push({ p: wp(f, k * 3.0, 0.12), q: frameQuat(f), s: V3(7, 1, 7) });
    }
    gBanner[n % 2].push({ p: wp(f, 0, 6.6), q: frameQuat(f).multiply(rotB), s: V3(gw * 2 - 0.6, 1.7, 1) });
  });
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x39404c }), gPillar);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x2f3846 }), gBeam);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }), gBar);
  const gTexts = ['NOVA  •  TURBO-X  •  AURORA', 'KRONOS  •  VELOCITY  •  ZENITH'];
  gBanner.forEach((items, k) => makeInstanced(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: makeGantryTexture(gTexts[k]), side: THREE.DoubleSide }), items));
  glowPoints(gLights, 7, 0xfff0c8);
  glowPoints(gTop, 3.5, 0xff8a1a);
  makeInstanced(new THREE.CylinderGeometry(0.15, 1.9, 7.4, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), gCone);
  const gPoolGeo = new THREE.PlaneGeometry(1, 1); gPoolGeo.rotateX(-Math.PI / 2);
  makeInstanced(gPoolGeo, new THREE.MeshBasicMaterial({
    map: getGlowTex(), color: 0xffdfa6, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  }), gPool);

  }

  // Sponsorenbanden hinter der Leitplanke (eine Instanz-Gruppe pro Sponsor) + Banden am Tribünendach
  const spTex = SP.map(makeSponsorTexture);
  const boardItems = SP.map(() => []);
  const bStep = Math.max(1, Math.round((quality >= 2 ? 5.6 : 8.4) / DS));
  let bc = 0;
  for (let i = 8; i < N; i += bStep, bc++) {
    const f = frames[i];
    if (inTunnel(i) || inBridge(i) || inUnder(i) || Math.abs(f.kappa) >= 0.022 || Math.abs(wrapIdx(i)) < 12) continue;
    if (gantrySpots.some(s => Math.abs(wrapIdx(i - s)) < gClear)) continue;
    [1, -1].forEach(sg => {
      if (sg < 0 && standSpots.some(s => Math.abs(wrapIdx(i - s.c)) < s.half + 8)) return;    // Sicht auf die Tribüne frei lassen
      if (sg > 0 && SCENE.PIT_LANE && Math.abs(wrapIdx(i)) < 46) return;                      // Boxengasse frei lassen
      boardItems[(bc * 2 + (sg > 0 ? 1 : 0)) % SP.length].push({ p: wp(f, sg * (HALF_W + 1.55), 0.8), q: sideQuat(f, sg), s: V3(5.0, 1.25, 1) });
    });
  }
  standSpots.forEach((s, n) => {
    const step = Math.max(1, Math.round(5.4 / DS));
    for (let o = -s.half + Math.round(step / 2); o <= s.half; o += step) {
      const f = frames[mod(s.c + o)];
      const lat = s.roofN + 0.12;
      boardItems[(n * 2 + o + 600) % SP.length].push({
        p: wp(f, lat, upForWorldY(f, lat, f.P.y + s.roofH - 0.8)), q: sideQuat(f, -1), s: V3(5.2, 1.2, 1)
      });
    }
  });
  boardItems.forEach((items, k) => makeInstanced(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: spTex[k], side: THREE.DoubleSide, color: 0xe8e8f0 }), items));

  if (!CITY) {
  // Sponsorenfahnen an Masten (Wellen im Shader): entlang gerader Abschnitte und an den Tribünen
  const flagTex = (ALPINE ? ALP_SPONSORS : SPONSORS).slice(0, 4).map(makeFlagTexture);
  const flagItems = flagTex.map(() => []), flagPoles = [];
  const fStep = Math.max(1, Math.round(24 / DS));
  let fc = 0;
  for (let i = 30; i < N; i += fStep, fc++) {
    const f = frames[i];
    if (!trackFree(i, 14) || Math.abs(f.kappa) > 0.01) continue;
    if (gantrySpots.some(s => Math.abs(wrapIdx(i - s)) < Math.round(10 / DS))) continue;
    if (standSpots.some(s => Math.abs(wrapIdx(i - s.c)) < s.half + 10)) continue;
    const sg = fc % 2 === 0 ? 1 : -1;
    const b = wp(f, sg * (HALF_W + 3.0), -0.05);
    flagPoles.push({ p: V3(b.x, b.y + 3.4, b.z), s: V3(1, 6.8, 1) });
    flagItems[fc % flagTex.length].push({ p: V3(b.x, b.y + 6.2, b.z), q: sideQuat(f, sg) });
  }
  standSpots.forEach((s, n) => {
    [-s.half, -Math.round(s.half / 3), Math.round(s.half / 3), s.half].forEach((o, k) => {
      const f = frames[mod(s.c + o)];
      const lat = s.roofN - 1.0;
      const b = wp(f, lat, upForWorldY(f, lat, f.P.y + s.roofH));
      flagPoles.push({ p: V3(b.x, b.y + 1.6, b.z), s: V3(1, 3.2, 1) });
      flagItems[(k + n) % flagTex.length].push({ p: V3(b.x, b.y + 2.8, b.z), q: sideQuat(f, -1) });
    });
  });
  makeInstanced(new THREE.CylinderGeometry(0.05, 0.07, 1, 6), new THREE.MeshLambertMaterial({ color: 0x8a97a6 }), flagPoles);
  const flagGeo = new THREE.PlaneGeometry(2.2, 1.1, 10, 2); flagGeo.translate(1.1, 0, 0);
  flagItems.forEach((items, k) => {
    const m = new THREE.MeshBasicMaterial({ map: flagTex[k], side: THREE.DoubleSide });
    m.onBeforeCompile = windShader;
    makeInstanced(flagGeo, m, items);
  });

  }

  // Kurvenschilder (Chevrons) an der Aussenseite enger Kurven
  const chevTex = [makeChevronTexture(1), makeChevronTexture(-1)];
  const chevItems = [[], []], chevPosts = [];
  const cStep = Math.max(1, Math.round(5.5 / DS));
  for (let i = 0; i < N; i += cStep) {
    const f = frames[i];
    if (Math.abs(f.kappa) < 0.025 || inBridge(i) || inTunnel(i) || inUnder(i)) continue;
    const sg = f.kappa > 0 ? -1 : 1;
    const b = wp(f, sg * (HALF_W + 3.0), -0.05);
    chevPosts.push({ p: V3(b.x, b.y + 0.9, b.z) });
    chevItems[sg > 0 ? 0 : 1].push({ p: V3(b.x, b.y + 1.9, b.z), q: sideQuat(f, sg), s: V3(1.5, 1.2, 1) });
  }
  makeInstanced(new THREE.BoxGeometry(0.1, 1.8, 0.1), new THREE.MeshLambertMaterial({ color: 0x778899 }), chevPosts);
  chevItems.forEach((items, k) => makeInstanced(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: chevTex[k], side: THREE.DoubleSide }), items));

  // Brücke: LED-Leisten an den Trägern + Glow
  const bw = HALF_W + 1.1;
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide });
  const ledGlow = [];
  if (!ALPINE) [1, -1].forEach(sg => {
    addMesh(buildStrip(bridgeR.c - bridgeR.h, bridgeR.c + bridgeR.h, () => [[sg * (bw + 0.02), -1.25], [sg * (bw + 0.02), -1.0]]), ledMat);
    for (let o = -bridgeR.h; o <= bridgeR.h; o += 6) { const p = wp(frames[mod(bridgeR.c + o)], sg * bw, -1.1); ledGlow.push(p.x, p.y, p.z); }
  });
  glowPoints(ledGlow, 3.5, 0x22d3ee, 0.9);

  // Tunnel: laufende Lichtstriche an den Wänden, Deckenleuchten quer zur Fahrtrichtung, Portalschild
  const tw = HALF_W + 1.1;
  const tA = tunnelR.c - tunnelR.h, tB = tunnelR.c + tunnelR.h;
  marchTex = makeMarchTexture();
  const marchMat = new THREE.MeshBasicMaterial({
    map: marchTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
  });
  [1, -1].forEach(sg => {
    addMesh(buildStrip(tA, tB, () => [[sg * (tw - 0.05), 1.2], [sg * (tw - 0.05), 1.6]], { vLen: 3.2 }), marchMat);
    addMesh(buildStrip(tA, tB, () => [[sg * (tw - 0.05), 3.0], [sg * (tw - 0.05), 3.4]], { vLen: 3.2 }), marchMat);
  });
  const barStep = Math.max(1, Math.round(3.5 / DS));
  const cWarm = new THREE.Color((THEME.bar || [0xfff1c9, 0x9fd8ff])[0]), cCool = new THREE.Color((THEME.bar || [0xfff1c9, 0x9fd8ff])[1]);
  const barItems = [], barGlow = [];
  let bi = 0;
  for (let i = tA + Math.round(barStep / 2); i <= tB; i += barStep, bi++) {
    const f = frames[mod(i)];
    barItems.push({ p: wp(f, 0, 5.8), q: frameQuat(f), s: V3(3.8, 0.07, 0.22), c: bi % 2 ? cCool : cWarm });
    [-1.6, 1.6].forEach(l => { const gp = wp(f, l, 5.7); barGlow.push(gp.x, gp.y, gp.z); });
  }
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), barItems);
  glowPoints(barGlow, 3.2, THEME.glowTun || 0xfff0c8, 0.9);
  const sf = frames[mod(tA)];
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.9),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(CITY ? 'NEON-TUNNEL' : ALPINE ? 'FELSTUNNEL' : 'TUNNEL', CITY ? '#2a0a55' : ALPINE ? '#14456f' : '#0a3a8a', '#ffffff'), side: THREE.DoubleSide }));
  sign.position.copy(wp(sf, 0, 7.9)).addScaledVector(sf.T, -0.25);
  sign.quaternion.copy(frameQuat(sf).multiply(rotB));
  scene.add(sign);

  if (CITY) {                                    // Stadt: Neon-Ringe im Tunnel, Fussgängerbrücken, Hänge-Reklamen, Laternen
    buildCityTunnelRings(tA, tB, tw);
    collectDeco(1, createCityFootbridges);
    collectDeco(1, createCityOverheads);
    buildCityLamps();
  }
  if (ALPINE) buildAlpineDetails();               // Schilder, Schneestangen, Wimpel, Lawinengalerie, Schneereste
}

// ─── Effekte: Reifenqualm, Funken, Speed-Linien, Reifenspuren ─────────────────
const SPARK_N = 160, SL_N = 72, SHADOW_HI = 2048;
let sparkGeo = null, sparkPos = null, sparkCol = null, sparkVel = null, sparkLife = null, sparkNext = 0;
const slData = new Float32Array(SL_N * 4);
const SK_N = 520;                                                               // Quads im Ring-Puffer
const SK_WHEELS = [0.62, 0.7, -0.62, 0.7, 0.62, -0.7, -0.62, -0.7];             // lokale x/z: VL, VR, HL, HR
const skidUni = { uTime: { value: 0 }, uLife: { value: FX.SKID_LIFE } };
const skHas = new Uint8Array(4), skLast = new Float32Array(12), skLat = new Float32Array(8);
const _sv = new THREE.Vector3();

// Reifenspuren: ein Ring-Puffer aus Quads, das Verblassen läuft im Shader (kein CPU-Aufwand pro Frame)
function buildSkids() {
  const pos = new Float32Array(SK_N * 12), uv = new Float32Array(SK_N * 8);
  const aI = new Float32Array(SK_N * 4), aB = new Float32Array(SK_N * 4);
  const idx = new Uint16Array(SK_N * 6);
  for (let q = 0; q < SK_N; q++) {
    const v = q * 4;
    uv.set([0, 0, 1, 0, 0, 1, 1, 1], q * 8);
    idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
  }
  const g = new THREE.BufferGeometry();
  skidPos = new THREE.BufferAttribute(pos, 3); skidI = new THREE.BufferAttribute(aI, 1); skidBorn = new THREE.BufferAttribute(aB, 1);
  skidPos.setUsage(THREE.DynamicDrawUsage); skidI.setUsage(THREE.DynamicDrawUsage); skidBorn.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', skidPos);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aI', skidI);
  g.setAttribute('aBorn', skidBorn);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  skidMesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: skidUni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    vertexShader: [
      'attribute float aI;', 'attribute float aBorn;', 'uniform float uTime;', 'uniform float uLife;',
      'varying float vA;', 'varying vec2 vUv;',
      'void main() {',
      '  float age = clamp((uTime - aBorn) / uLife, 0.0, 1.0);',
      '  vA = aI * (1.0 - age) * (1.0 - age);',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying float vA;', 'varying vec2 vUv;',
      'void main() {',
      '  float e = smoothstep(0.0, 0.45, 1.0 - abs(vUv.x * 2.0 - 1.0));',
      '  gl_FragColor = vec4(0.0, 0.0, 0.0, vA * e);',
      '}'
    ].join('\n')
  }));
  skidMesh.frustumCulled = false;
  skidMesh.renderOrder = -1;                  // vor Rauch und Partikeln zeichnen
  scene.add(skidMesh);
}

function clearSkids() {
  if (!skidMesh) return;
  skidI.array.fill(0); skidI.needsUpdate = true;
  skHas[0] = skHas[1] = skHas[2] = skHas[3] = 0;
  skNext = 0;
}

function updateSkids(brake, drift, sp) {
  const on = FX.SKID_ALPHA > 0 && (brake || drift);
  if (!on) { skHas[0] = skHas[1] = skHas[2] = skHas[3] = 0; return; }
  const inten = clamp(0.45 + sp / MAX_SPEED * 0.55, 0, 1) * FX.SKID_ALPHA;
  const lx = Math.cos(cs.angle), lz = -Math.sin(cs.angle);
  const minD2 = quality > 1 ? 0.1 : 0.28, hw = 0.16;
  let dirty = false;
  for (let w = 0; w < 4; w++) {
    if (w < 2 && !brake) { skHas[w] = 0; continue; }                           // vorne nur beim Bremsen
    _sv.set(SK_WHEELS[w * 2], -0.03, SK_WHEELS[w * 2 + 1]);
    car.localToWorld(_sv);
    const o = w * 3;
    if (!skHas[w]) {
      skHas[w] = 1; skLast[o] = _sv.x; skLast[o + 1] = _sv.y; skLast[o + 2] = _sv.z; skLat[w * 2] = lx; skLat[w * 2 + 1] = lz;
      continue;
    }
    const dx = _sv.x - skLast[o], dz = _sv.z - skLast[o + 2], d2 = dx * dx + dz * dz;
    if (d2 < minD2) continue;
    if (d2 > 9) { skLast[o] = _sv.x; skLast[o + 1] = _sv.y; skLast[o + 2] = _sv.z; skLat[w * 2] = lx; skLat[w * 2 + 1] = lz; continue; }
    const q = skNext; skNext = (skNext + 1) % SK_N;
    const pa = skidPos.array, v = q * 12, px = skLast[o], py = skLast[o + 1], pz = skLast[o + 2];
    const plx = skLat[w * 2], plz = skLat[w * 2 + 1];
    pa[v]      = px - plx * hw; pa[v + 1]  = py; pa[v + 2]  = pz - plz * hw;
    pa[v + 3]  = px + plx * hw; pa[v + 4]  = py; pa[v + 5]  = pz + plz * hw;
    pa[v + 6]  = _sv.x - lx * hw; pa[v + 7]  = _sv.y; pa[v + 8]  = _sv.z - lz * hw;
    pa[v + 9]  = _sv.x + lx * hw; pa[v + 10] = _sv.y; pa[v + 11] = _sv.z + lz * hw;
    for (let k = 0; k < 4; k++) { skidI.array[q * 4 + k] = inten; skidBorn.array[q * 4 + k] = fxClock; }
    skLast[o] = _sv.x; skLast[o + 1] = _sv.y; skLast[o + 2] = _sv.z; skLat[w * 2] = lx; skLat[w * 2 + 1] = lz;
    dirty = true;
  }
  if (dirty) { skidPos.needsUpdate = true; skidI.needsUpdate = true; skidBorn.needsUpdate = true; }
}

function buildFx() {
  smokeTex = makeSmokeTexture();
  for (let i = 0; i < 64; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xd5d9e4, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    m.userData = { life: 0, vel: new THREE.Vector3(), rot: 0, size: 1 };
    scene.add(m);
    smokePool.push(m);
  }
  sparkPos = new Float32Array(SPARK_N * 3); sparkCol = new Float32Array(SPARK_N * 3);
  sparkVel = new Float32Array(SPARK_N * 3); sparkLife = new Float32Array(SPARK_N);
  for (let i = 0; i < SPARK_N; i++) sparkPos[i * 3 + 1] = -9999;
  sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    size: 0.9, map: getGlowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);

  // Speed-Linien hängen an der Kamera (Blickrichtung = -Z)
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SL_N * 6), 3));
  for (let i = 0; i < SL_N; i++) resetSpeedLine(i, true);
  speedLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
    color: 0xcfe4ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }));
  speedLines.frustumCulled = false;
  speedLines.renderOrder = 20;
  speedLines.visible = false;
  camera.add(speedLines);

  buildSkids();
}

function resetSpeedLine(i, init) {
  const a = Math.random() * Math.PI * 2, r = 1.7 + Math.random() * 3.2;
  slData[i * 4] = Math.cos(a) * r * 1.5;
  slData[i * 4 + 1] = Math.sin(a) * r;
  slData[i * 4 + 2] = init ? -1.5 - Math.random() * 22 : -24;
  slData[i * 4 + 3] = 1.5 + Math.random() * 3.5;
}

function spawnSmoke() {
  const p = smokePool[smokeNext];
  smokeNext = (smokeNext + 1) % smokePool.length;
  const front = cs.braking && Math.random() < 0.4;
  _sv.set(Math.random() < 0.5 ? -0.62 : 0.62, 0.05, front ? 0.7 : -0.7);
  car.localToWorld(_sv);
  p.position.copy(_sv);
  p.userData.vel.set((Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6);
  p.userData.life = 1;
  p.userData.rot = (Math.random() - 0.5) * 1.4;
  p.userData.size = 0.8 + Math.random() * 0.5;
  p.material.rotation = Math.random() * 6.28;
  p.scale.setScalar(p.userData.size);
  p.visible = true;
}

function spawnSpark(sgn) {
  const i = sparkNext; sparkNext = (sparkNext + 1) % SPARK_N;
  const fx = Math.sin(cs.angle), fz = Math.cos(cs.angle);
  sparkPos[i * 3]     = cs.x + trk.lhx * sgn * 0.85 + (Math.random() - 0.5) * 0.8 * fx;
  sparkPos[i * 3 + 1] = cs.y + 0.25 + Math.random() * 0.25;
  sparkPos[i * 3 + 2] = cs.z + trk.lhz * sgn * 0.85 + (Math.random() - 0.5) * 0.8 * fz;
  const k = 1.5 + Math.random() * 3.5;
  sparkVel[i * 3]     = -trk.lhx * sgn * k + fx * cs.speed * 0.25 + (Math.random() - 0.5) * 2.5;
  sparkVel[i * 3 + 1] = 1.5 + Math.random() * 3.5;
  sparkVel[i * 3 + 2] = -trk.lhz * sgn * k + fz * cs.speed * 0.25 + (Math.random() - 0.5) * 2.5;
  sparkLife[i] = 1;
}

function updateFx(dt) {
  fxClock += dt;
  crowdUni.time.value = fxClock;
  skidUni.uTime.value = fxClock;
  if (marchTex) marchTex.offset.y = -((fxClock * 0.4) % 1);          // Lichtstriche im Tunnel laufen mit

  const sp = Math.abs(cs.speed), fr = clamp(sp / MAX_SPEED, 0, 1.3);
  const racing = state === 'racing';
  const brake = racing && quality > 0 && cs.braking && sp > 8;
  const drift = racing && quality > 0 && sp > 16 && Math.abs(cs.steer) > 0.6;
  const slide = racing && quality > 0 && sp > 14 && (Math.abs(cs.steer) > 0.65 || (cs.braking && sp > 18));
  if (slide || brake || drift) car.updateMatrixWorld(true);
  updateSkids(brake, drift, sp);

  // Reifenqualm bei starkem Lenken / Bremsen: dichte, weiche Sprite-Puffe
  if (slide && FX.SMOKE_STEP > 0) {
    smokeTimer += dt;
    const step = FX.SMOKE_STEP * (quality > 1 ? 1 : 2.2) * (cs.braking ? 0.8 : 1);
    let guard = 0;
    while (smokeTimer > step && guard++ < 4) { smokeTimer -= step; spawnSmoke(); }
    if (smokeTimer > step) smokeTimer = 0;
  } else smokeTimer = 0;
  for (let i = 0; i < smokePool.length; i++) {
    const p = smokePool[i];
    if (!p.visible) continue;
    const u = p.userData;
    u.life -= dt / 1.15;
    if (u.life <= 0) { p.visible = false; continue; }
    p.position.addScaledVector(u.vel, dt);
    u.vel.multiplyScalar(1 - 1.2 * dt);
    const age = 1 - u.life;
    p.material.opacity = FX.SMOKE_ALPHA * Math.min(1, age * 8) * u.life;
    p.material.rotation += u.rot * dt;
    p.scale.setScalar(u.size * (1 + age * 3.2));
  }

  // Funken bei Wandkontakt (nur gelesen, Physik bleibt unberührt)
  if (racing && quality > 0 && FX.SPARKS > 0 && sp > 6 && Math.abs(trk.d) > WALL_LIMIT - 0.05) {
    const sgn = trk.d > 0 ? 1 : -1;
    const n = Math.round((quality > 1 ? (sp > 24 ? 5 : 3) : 2) * FX.SPARKS);
    for (let k = 0; k < n; k++) spawnSpark(sgn);
  }
  for (let i = 0; i < SPARK_N; i++) {
    if (sparkLife[i] <= 0) continue;
    sparkLife[i] -= dt / 0.6;
    if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -9999; continue; }
    sparkVel[i * 3 + 1] -= 9 * dt;
    sparkPos[i * 3]     += sparkVel[i * 3] * dt;
    sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
    sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
    const l = sparkLife[i];                                   // weissglühend -> orange -> rot
    sparkCol[i * 3] = l; sparkCol[i * 3 + 1] = l * (0.25 + 0.75 * l); sparkCol[i * 3 + 2] = l * l * l * 0.6;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;

  // Speed-Linien bei hohem Tempo / Boost (beim Boost mehr Linien, warme Farbe)
  const target = (racing && quality > 0 && camMode < 2) ? clamp((fr - 0.8) * 2.5, 0, 1) * 0.3 + (boost.on ? FX.BOOST_LINES : 0) : 0;
  speedLines.material.opacity += (target - speedLines.material.opacity) * (1 - Math.exp(-6 * dt));
  const show = speedLines.material.opacity > 0.01;
  speedLines.visible = show;
  if (show) {
    if (speedLines._b !== boost.on) { speedLines._b = boost.on; speedLines.material.color.setHex(boost.on ? 0xffd2a0 : 0xcfe4ff); }
    const nLines = boost.on ? SL_N : Math.round(SL_N * 0.55);
    speedLines.geometry.setDrawRange(0, nLines * 2);
    const arr = speedLines.geometry.attributes.position.array, v = 40 + sp * 1.4;
    for (let i = 0; i < nLines; i++) {
      slData[i * 4 + 2] += v * dt;
      if (slData[i * 4 + 2] > -1.2) resetSpeedLine(i, false);
      const x = slData[i * 4], y = slData[i * 4 + 1], z = slData[i * 4 + 2], l = slData[i * 4 + 3] * (0.6 + fr) * (boost.on ? 1.3 : 1);
      arr[i * 6] = x; arr[i * 6 + 1] = y; arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = x; arr[i * 6 + 4] = y; arr[i * 6 + 5] = Math.max(-26, z - l);
    }
    speedLines.geometry.attributes.position.needsUpdate = true;
  }
}

// Qualitätsstufen: 2 = hoch, 1 = mittel (kleinere Schattenmap), 0 = niedrig (kein Schatten/Partikel)
function startQuality() {
  if (settings.quality !== 'auto') return QUALITY_LEVEL[settings.quality];
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  return coarse ? 1 : 2;
}
// Deko-Gruppen: deco[2] ist nur bei Hoch sichtbar, deco[1] bei Hoch und Mittel (bei Niedrig aus)
const deco = { 1: [], 2: [] };
function tagSince(minQ, n0) { for (let i = n0; i < scene.children.length; i++) deco[minQ].push(scene.children[i]); }
function collectDeco(minQ, fn) { const n0 = scene.children.length; fn(); tagSince(minQ, n0); }
function applyDeco(q) {
  deco[2].forEach(o => { o.visible = q >= 2; });
  deco[1].forEach(o => { o.visible = q >= 1; });
}
function setQualityMode(mode) {
  if (QUALITY_MODES.indexOf(mode) < 0) return;
  settings.quality = mode;
  saveSettings();
  if (mode === 'auto') { pixelRatio = Math.min(window.devicePixelRatio || 1, 2); setQuality(startQuality()); resizeCanvas(); }
  else setQuality(QUALITY_LEVEL[mode]);
  fpsFrames = 0; fpsTime = 0;
}
function setQuality(q) {
  quality = q;
  applyDeco(settings.quality === 'auto' ? 2 : q);         // Auto verhält sich wie bisher (Deko bleibt)
  if (settings.quality !== 'auto' && renderer && container) {   // feste Stufe: Auflösung begrenzen
    const dpr = window.devicePixelRatio || 1;
    pixelRatio = q >= 2 ? Math.min(dpr, 2) : q === 1 ? Math.min(dpr, 1.5) : 1;
    resizeCanvas();
  }
  crowdUni.amp.value = q > 0 ? FX.CROWD_ANIM : 0;      // Publikum/Fahnen stehen still bei niedrigster Qualität
  if (skidMesh) skidMesh.visible = q > 0;               // keine Reifenspuren bei niedrigster Qualität
  if (CITY) applyCityQuality(q);                         // Regen, Flugautos, Zeppelin, Dampf nach Qualität
  if (ALPINE) applyAlpineQuality(q);                     // Schnee, Seilbahn, Adler, Rauch nach Qualität
  if (!moon) return;
  const size = q >= 2 ? SHADOW_HI : 1024;
  if (moon.shadow.mapSize.x !== size) {
    moon.shadow.mapSize.set(size, size);
    if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
  }
  moon.castShadow = q > 0;
}

function buildWorld() {
  scene.background = new THREE.Color(THEME.fog);
  scene.fog = new THREE.FogExp2(THEME.fog, THEME.fogDensity);   // Nebel für Tiefe, Farbe passt zum Horizont
  scene.add(camera);                       // Speed-Linien hängen an der Kamera

  scene.add(new THREE.HemisphereLight(THEME.hemiSky, THEME.hemiGround, THEME.hemiI));

  // Hauptlicht (Sonne bzw. Mond) mit Schattenkamera, die dem Auto folgt
  moon = new THREE.DirectionalLight(THEME.sun, THEME.sunI);
  quality = startQuality();
  moon.castShadow = true;
  const smap = quality >= 2 ? SHADOW_HI : 1024;
  moon.shadow.mapSize.set(smap, smap);
  const sc = moon.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 5; sc.far = 160;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.15;
  scene.add(moon);
  scene.add(moon.target);

  tunnelLight = new THREE.PointLight(THEME.tunLight || 0xffe2a8, 0, 24);
  scene.add(tunnelLight);
  carGlow = new THREE.PointLight(THEME.carGlow || 0x7090ff, 0.8, 16);
  scene.add(carGlow);

  buildCurve();
  buildFrames();
  detectRegions();
  if (ALPINE) buildAlpineTerrainData();   // Höhenfeld zuerst: Stützmauern, Pfeiler und Tribüne setzen sich darauf
  if (MOONRING) MR_LAKE = pickMoonLake(); // freie Fläche für den zugefrorenen See (vor createScenery)
  buildTrack();
  buildStartLine();
  createCrowdAndStands();
  createScenery();
  collectDeco(1, createSand);
  createSky();
  buildCar();
  buildTrackExtras();
  buildSceneryExtras();
  createTrackDetails();
  createPitLane();
  collectDeco(1, createFences);
  createWarningSigns();
  collectDeco(2, createBirds);
  createDetails();
  if (CITY) createCityLife();            // Flugautos, Zeppelin, Regen, Dampf
  if (ALPINE) createAlpineLife();        // Seilbahn, Schnee, Rauch, Wasserfall
  if (MOONRING) { createMoonRingWorld(); createMoonRingLandmarks(); collectDeco(1, createMoonRingExtras); }   // See, Kristalle, Mondtore, Laternen, Schnee + Wahrzeichen
  camMode = settings.camera;
  applyCamMode();
  buildFx();
  setQuality(quality);
}


// ─── Neue Umgebung: Wind, Sand, Zäune, Boxengasse, Warnschilder, Vögel ───────
// Wind: Bäume/Büsche wiegen im Vertex-Shader (instanziert, ohne CPU-Arbeit pro Frame)
function swayShader(sh) {
  sh.uniforms.uTime = crowdUni.time; sh.uniforms.uAmp = crowdUni.amp; sh.uniforms.uWind = windUni;
  sh.vertexShader = 'uniform float uTime;\nuniform float uAmp;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n' +
    '#ifdef USE_INSTANCING\n' +
    'float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;\n' +
    'float hh = max(0.0, instanceMatrix[3].y + 0.5 + position.y);\n' +
    'float sw = (sin(uTime * 1.6 + ph) + 0.5 * sin(uTime * 2.9 + ph * 1.7)) * 0.018 * hh * uAmp * uWind;\n' +
    'transformed.x += sw;\ntransformed.z += sw * 0.6;\n' +
    '#endif');
}

function makeSunDiscTexture() {
  const { c, g } = newCanvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,246,214,1)');
  gr.addColorStop(0.72, 'rgba(255,214,140,0.55)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

function makeSandTexture() {
  const S = 128;
  const { c, g } = newCanvas(S, S);
  g.fillStyle = '#cdb078'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(33);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,240,200,' + (0.1 + rnd() * 0.15) + ')' : 'rgba(120,90,50,' + (0.08 + rnd() * 0.14) + ')';
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  for (let i = 0; i < 6; i++) blob(g, rnd() * S, rnd() * S, 18 + rnd() * 20, '150,115,70', 0.18);
  g.globalCompositeOperation = 'destination-in';           // weicher Rand
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  return toTexture(c, false);
}

function makePitTexture() {
  const { c, g } = newCanvas(128, 256);
  g.fillStyle = CITY ? '#1b1e30' : '#2b2d35'; g.fillRect(0, 0, 128, 256);
  const rnd = mulberry32(71);
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.16)';
    g.fillRect(rnd() * 128, rnd() * 256, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  g.fillStyle = CITY ? '#e8fbff' : '#f0f0ec'; g.fillRect(0, 0, 6, 256);                            // weisse Linie zur Strecke hin
  g.fillStyle = CITY ? '#ff2bd6' : '#e8c020';
  for (let y = 0; y < 256; y += 64) g.fillRect(118, y, 6, 36);                   // gelb gestrichelt an der Garagenseite
  return toTexture(c, true);
}

// Warndreieck mit Kurvenpfeil (dir = -1: Linkskurve, 1: Rechtskurve)
function makeWarnTexture(dir) {
  const { c, g } = newCanvas(128, 128);
  g.beginPath(); g.moveTo(64, 6); g.lineTo(122, 112); g.lineTo(6, 112); g.closePath();
  g.fillStyle = '#d81c2c'; g.fill();
  g.beginPath(); g.moveTo(64, 26); g.lineTo(106, 102); g.lineTo(22, 102); g.closePath();
  g.fillStyle = '#f6f6f2'; g.fill();
  g.strokeStyle = '#111111'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
  g.save();
  if (dir < 0) { g.translate(128, 0); g.scale(-1, 1); }
  g.beginPath(); g.moveTo(52, 94); g.lineTo(52, 68); g.quadraticCurveTo(52, 52, 68, 52); g.lineTo(84, 52); g.stroke();
  g.beginPath(); g.moveTo(74, 40); g.lineTo(88, 52); g.lineTo(74, 64); g.stroke();
  g.restore();
  return toTexture(c, false);
}

// Sandflächen im Gelände (flache, weich auslaufende Instanzen; nie auf oder direkt an der Fahrbahn)
function createSand() {
  const n = SCENE.SAND_PATCHES;
  if (!n) return;
  const rn = mulberry32(9090), items = [];
  const Y = new THREE.Vector3(0, 1, 0);
  for (let t = 0; t < 5000 && items.length < n; t++) {
    const x = (rn() - 0.5) * 520, z = (rn() - 0.5) * 400, r = 5 + rn() * 9;
    const d2 = minDistToTrack2(x, z, (r + 10) * (r + 10));
    if (d2 < (r + 10) * (r + 10) || d2 > (r + 45) * (r + 45)) continue;
    const grey = 0.75 + rn() * 0.25;
    items.push({
      p: new THREE.Vector3(x, GROUND_Y + 0.04, z), q: new THREE.Quaternion().setFromAxisAngle(Y, rn() * 6.28),
      s: new THREE.Vector3(2 * r, 1, 2 * r * (0.6 + rn() * 0.4)), c: new THREE.Color(grey, grey, grey)
    });
  }
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  makeInstanced(geo, lambert(0xffffff, {
    map: makeSandTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  }), items);
}

// Holzzäune entlang gerader, flacher Abschnitte (Pfosten + zwei Latten, instanziert)
function createFences() {
  if (!SCENE.FENCES) return;
  const lat = HALF_W + 8.0, step = Math.max(1, Math.round(3.2 / DS)), minD2 = 12.5 * 12.5;
  const Y = new THREE.Vector3(0, 1, 0);
  const posts = [], rails = [];
  for (let i = 0; i < N; i += step) {
    const i2 = mod(i + step), f = frames[i], g = frames[i2];
    if (f.P.y > 1.6 || g.P.y > 1.6 || Math.abs(f.kappa) > 0.018 || Math.abs(g.kappa) > 0.018) continue;
    if (!trackFree(i, 16) || !trackFree(i2, 16) || Math.abs(wrapIdx(i)) < 70) continue;
    if (standSpots.some(s => Math.abs(wrapIdx(i - s.c)) < s.half + 10)) continue;
    [1, -1].forEach(sg => {
      const ax = f.P.x + f.Lh.x * sg * lat, az = f.P.z + f.Lh.z * sg * lat;
      const bx = g.P.x + g.Lh.x * sg * lat, bz = g.P.z + g.Lh.z * sg * lat;
      if (minDistToTrack2(ax, az, minD2) < minD2 || minDistToTrack2(bx, bz, minD2) < minD2) return;   // nicht nahe einer anderen Streckenstelle
      const q = new THREE.Quaternion().setFromAxisAngle(Y, Math.atan2(bx - ax, bz - az));
      const len = Math.hypot(bx - ax, bz - az);
      posts.push({ p: new THREE.Vector3(ax, GROUND_Y + 0.65, az) });
      [0.6, 1.1].forEach(h => rails.push({
        p: new THREE.Vector3((ax + bx) / 2, GROUND_Y + h, (az + bz) / 2), q, s: new THREE.Vector3(1, 1, len)
      }));
    });
  }
  makeInstanced(new THREE.BoxGeometry(0.14, 1.3, 0.14), new THREE.MeshLambertMaterial({ color: 0x5f4f3c }), posts);
  makeInstanced(new THREE.BoxGeometry(0.06, 0.1, 1), new THREE.MeshLambertMaterial({ color: 0x8a7860 }), rails);
}

// Boxengasse: Asphaltstreifen vor den Garagen (Start/Ziel) + Hinweisschild
function createPitLane() {
  if (!SCENE.PIT_LANE) return;
  const half = Math.round(42 / DS), l0 = HALF_W + 1.35, l1 = HALF_W + 3.35;
  addMesh(buildStrip(-half, half, () => [[l0, -0.02], [l1, -0.02]], { vLen: 8 }),
    lambert(0xffffff, { map: makePitTexture(), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  const f = frames[mod(-half - 6)];
  const lt = HALF_W + 3.0;
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), new THREE.MeshLambertMaterial({ color: 0x778899 }));
  pole.position.copy(wp(f, lt, 1.25)); pole.quaternion.copy(frameQuat(f));
  scene.add(pole);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('BOXEN', CITY ? '#2a0a55' : '#0a3a8a', '#ffffff'), side: THREE.DoubleSide }));
  sign.position.copy(wp(f, lt, 2.7));
  sign.quaternion.copy(frameQuat(f).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)));
  scene.add(sign);
}

// Warnschilder (Dreieck mit Pfeil) ca. 65 m vor engen Kurven, rechts neben der Strecke
function createWarningSigns() {
  if (!SCENE.WARN_SIGNS) return;
  const K = 0.02;
  const tex = [makeWarnTexture(-1), makeWarnTexture(1)];
  const items = [[], []], posts = [], placed = [];
  const lead = Math.round(65 / DS), lat = -(HALF_W + 3.2);
  const rotB = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  for (let i = 0; i < N; i++) {
    const k = frames[i].kappa;
    if (Math.abs(k) < K || Math.abs(frames[mod(i - 1)].kappa) >= K) continue;       // nur am Kurveneingang
    if (placed.some(q => Math.abs(wrapIdx(i - q)) < 140)) continue;
    const j = mod(i - lead), f = frames[j];
    if (!trackFree(j, 12) || Math.abs(f.kappa) > 0.012) continue;
    if (gantrySpots.some(s => Math.abs(wrapIdx(j - s)) < 16)) continue;
    if (standSpots.some(s => Math.abs(wrapIdx(j - s.c)) < s.half + 8)) continue;
    placed.push(i);
    posts.push({ p: wp(f, lat, 1.3), q: frameQuat(f) });
    items[k > 0 ? 0 : 1].push({ p: wp(f, lat, 2.9), q: frameQuat(f).multiply(rotB), s: new THREE.Vector3(2.1, 2.1, 1) });
  }
  makeInstanced(new THREE.BoxGeometry(0.1, 2.7, 0.1), new THREE.MeshLambertMaterial({ color: 0x778899 }), posts);
  items.forEach((it, k) => makeInstanced(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex[k], side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }), it));
}

// Vögel: instanziert, kreisen in grossen Bahnen, Flügelschlag im Vertex-Shader
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bp = new THREE.Vector3(), _bs = new THREE.Vector3(), _bY = new THREE.Vector3(0, 1, 0);
function createBirds() {
  const n = ALPINE ? SCENE.ALP_EAGLES : SCENE.BIRDS;
  if (!n) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0.45,  1.1, 0, -0.3,  0, 0, -0.3,
    0, 0, 0.45,  0, 0, -0.3,  -1.1, 0, -0.3
  ]), 3));
  const rn = mulberry32(1717), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ph[i] = rn() * 6.28;
    const R = (ALPINE ? 70 : 25) + rn() * (ALPINE ? 70 : 55);
    birdData.push({ cx: (rn() - 0.5) * 420, cz: (rn() - 0.5) * 320, R, y: (ALPINE ? 58 : 24) + rn() * (ALPINE ? 60 : 34), w: (6 + rn() * 4) / R, a: rn() * 6.28, dir: rn() < 0.5 ? 1 : -1, s: 1.3 + rn() * 0.6 });
  }
  g.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
  const mat = new THREE.MeshBasicMaterial({ color: THEME.birdColor, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = crowdUni.time;
    sh.vertexShader = 'attribute float aPh;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.y += abs(position.x) * sin(uTime * 9.0 + aPh) * 0.5;');
  };
  birdMesh = new THREE.InstancedMesh(g, mat, n);
  birdMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  birdMesh.frustumCulled = false;
  scene.add(birdMesh);
  updateBirds(0);
}
function updateBirds(dt) {
  if (!birdMesh || !birdMesh.visible) return;
  for (let i = 0; i < birdData.length; i++) {
    const b = birdData[i];
    b.a += b.w * b.dir * dt;
    _bp.set(b.cx + Math.cos(b.a) * b.R, b.y + Math.sin(b.a * 2.3 + i) * 2.5, b.cz + Math.sin(b.a) * b.R);
    _bq.setFromAxisAngle(_bY, Math.atan2(-Math.sin(b.a) * b.dir, Math.cos(b.a) * b.dir));
    _bs.setScalar(b.s);
    birdMesh.setMatrixAt(i, _bm.compose(_bp, _bq, _bs));
  }
  birdMesh.instanceMatrix.needsUpdate = true;
}


// ─── Mehr Details & Deko ──────────────────────────────────────────────────────
const turbineRotors = [], balloons = [];

// Zufällige freie Stellen im Gelände (Abstand zur Strecke zwischen minD und maxD, nicht in Bäumen)
function clearOfScenery(x, z, r) {
  const r2 = r * r;
  for (let i = 0; i < sceneryPts.length; i += 2) {
    const dx = sceneryPts[i] - x, dz = sceneryPts[i + 1] - z;
    if (dx * dx + dz * dz < r2) return false;
  }
  return true;
}
function freeSpots(seed, count, minD, maxD, rx, rz, clear) {
  const rn = mulberry32(seed), out = [];
  for (let t = 0; t < count * 40 && out.length < count; t++) {
    const x = (rn() - 0.5) * rx, z = (rn() - 0.5) * rz;
    const d2 = minDistToTrack2(x, z, minD * minD);
    if (d2 < minD * minD || (maxD && d2 > maxD * maxD)) continue;
    if (MR_LAKE && Math.hypot(x - MR_LAKE.x, z - MR_LAKE.z) < MR_LAKE.r + 5) continue;
    if (clear && !clearOfScenery(x, z, clear)) continue;
    out.push({ x, z, a: rn(), b: rn(), c: rn(), d: rn() });
  }
  return out;
}
// Stellen neben flachen, geraden Abschnitten (wie bei den Zäunen), mit Mindestabstand 'gap' (Samples)
function sideSpots(lat, gap, max, seed) {
  const rn = mulberry32(seed), out = [], md2 = (lat - 2.5) * (lat - 2.5), start = (rn() * N) | 0;
  for (let k = 0; k < N && out.length < max; k += 4) {
    const i = mod(start + k), f = frames[i];
    if (f.P.y > 1.6 || Math.abs(f.kappa) > 0.018 || !trackFree(i, 16) || Math.abs(wrapIdx(i)) < 70) continue;
    if (standSpots.some(s => Math.abs(wrapIdx(i - s.c)) < s.half + 10)) continue;
    const sg = rn() < 0.5 ? 1 : -1;
    const x = f.P.x + f.Lh.x * sg * lat, z = f.P.z + f.Lh.z * sg * lat;
    if (minDistToTrack2(x, z, md2) < md2) continue;
    if (out.some(o => Math.abs(wrapIdx(i - o.i)) < gap)) continue;
    out.push({ i, sg, f, x, z });
  }
  return out;
}

function createDetails() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const Yax = new THREE.Vector3(0, 1, 0);
  const yawQ = a => new THREE.Quaternion().setFromAxisAngle(Yax, a);
  const hsl = (h, sat, l) => new THREE.Color().setHSL(h, sat, l);
  const lamb = c => new THREE.MeshLambertMaterial({ color: c });
  const swayMat = c => { const m = lamb(c); m.onBeforeCompile = swayShader; return m; };
  const sect = (q, fn) => { const n0 = scene.children.length; fn(); tagSince(q, n0); };   // Abschnitt = Deko-Gruppe für die Qualitätsstufen

  // Grasbüschel (wiegen im Wind)
  if (SCENE.GRASS) sect(2, () => {
    const g = new THREE.ConeGeometry(0.11, 0.6, 4); g.translate(0, 0.3, 0);
    const items = [];
    freeSpots(8101, SCENE.GRASS, 13, 45, 520, 400).forEach(t => {
      for (let k = 0; k < 3; k++) items.push({
        p: V3(t.x + (k - 1) * 0.18 * (1 + t.a), GROUND_Y, t.z + (k % 2 ? 0.15 : -0.12)), q: yawQ(t.b * 6 + k),
        s: V3(1, 0.7 + t.c * 0.9 + k * 0.2, 1), c: hsl(0.25 + t.d * 0.07, 0.5, 0.12 + t.a * 0.1)
      });
    });
    makeInstanced(g, swayMat(0xffffff), items);
  });

  // Blumen: kleine Gruppen aus Stiel + Blüte
  if (SCENE.FLOWERS) sect(2, () => {
    const pal = [0xffe14a, 0xffffff, 0xff6fa8, 0xb98cff, 0xff8a3a].map(c => new THREE.Color(c));
    const stemG = new THREE.CylinderGeometry(0.015, 0.02, 0.36, 4); stemG.translate(0, 0.18, 0);
    const headG = new THREE.IcosahedronGeometry(0.075, 0); headG.translate(0, 0.38, 0);
    const stems = [], heads = [], green = hsl(0.28, 0.5, 0.18);
    freeSpots(8202, SCENE.FLOWERS, 14, 40, 520, 400).forEach(t => {
      const col = pal[(t.d * pal.length) | 0];
      for (let k = 0; k < 5; k++) {
        const a = k * 1.9 + t.b * 6, r = 0.15 + (k % 3) * 0.17, h = 0.8 + ((k * 37) % 5) * 0.1;
        const p = V3(t.x + Math.cos(a) * r, GROUND_Y, t.z + Math.sin(a) * r), s = V3(1, h, 1);
        stems.push({ p, s, c: green }); heads.push({ p, s, c: col });
      }
    });
    makeInstanced(stemG, swayMat(0xffffff), stems);
    makeInstanced(headG, swayMat(0xffffff), heads);
  });

  // Heuballen-Pyramiden am Streckenrand
  if (SCENE.HAY) sect(1, () => {
    const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14); g.rotateZ(Math.PI / 2);
    const items = [];
    sideSpots(HALF_W + 11.5, 90, SCENE.HAY, 8303).forEach((sp, n) => {
      const q = yawQ(Math.atan2(sp.f.Th.x, sp.f.Th.z)), col = hsl(0.12, 0.55, 0.38 + (n % 3) * 0.04);
      [[-0.78, 0.75], [0.78, 0.75], [0, 1.95]].forEach(o => items.push({
        p: V3(sp.x + sp.f.Th.x * o[0], GROUND_Y + o[1], sp.z + sp.f.Th.z * o[0]), q, c: col
      }));
    });
    makeInstanced(g, lamb(0xffffff), items);
  });

  // Streckenposten-Häuschen mit Fahne und Licht
  if (SCENE.MARSHALS) sect(1, () => {
    const body = [], roof = [], pole = [], flag = [], win = [], glow = [];
    sideSpots(HALF_W + 10.5, 160, SCENE.MARSHALS, 8404).forEach(sp => {
      const q = yawQ(Math.atan2(-sp.sg * sp.f.Lh.x, -sp.sg * sp.f.Lh.z));       // Vorderseite zur Strecke
      body.push({ p: V3(sp.x, GROUND_Y + 0.95, sp.z), q });
      roof.push({ p: V3(sp.x, GROUND_Y + 2.0, sp.z), q });
      pole.push({ p: V3(sp.x, GROUND_Y + 3.3, sp.z), q });
      flag.push({ p: V3(sp.x, GROUND_Y + 4.1, sp.z), q, s: V3(0.5, 0.5, 0.5) });
      win.push({ p: V3(0, 0.25, 0.86).applyQuaternion(q).add(V3(sp.x, GROUND_Y + 0.95, sp.z)), q, s: V3(0.9, 0.6, 0.06) });
      glow.push(sp.x, GROUND_Y + 2.4, sp.z);
    });
    makeInstanced(new THREE.BoxGeometry(1.7, 1.9, 1.7), lamb(0xe8e8ee), body);
    makeInstanced(new THREE.BoxGeometry(2.1, 0.18, 2.1), lamb(0xff6a1a), roof);
    makeInstanced(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6), lamb(0x8a97a6), pole);
    makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd98a }), win);
    const fg = new THREE.PlaneGeometry(2.2, 1.1, 10, 2); fg.translate(1.1, 0, 0);
    const fm = new THREE.MeshBasicMaterial({ color: 0xff6a1a, side: THREE.DoubleSide }); fm.onBeforeCompile = windShader;
    makeInstanced(fg, fm, flag);
    glowPoints(glow, 3, 0xff9a3a);
  });

  // Zuschauergruppen hinter dem Zaun (blicken zur Strecke, wippen wie das Tribünenpublikum)
  if (SCENE.FAN_GROUPS) sect(1, () => {
    const rc = mulberry32(8909), shirts = [0xd22a2a, 0x2a46d2, 0xeeeeee, 0xe8c820, 0x22aa55, 0xff7a1a, 0xaa44ff, 0x22cccc];
    const skins = [0xf1c9a5, 0xd9a07a, 0xa8714c, 0x6b4430, 0xffdcc0], list = [];
    sideSpots(HALF_W + 9.6, 40, SCENE.FAN_GROUPS, 8909).forEach(sp => {
      const q = yawQ(Math.atan2(-sp.sg * sp.f.Lh.x, -sp.sg * sp.f.Lh.z)), n = 3 + ((rc() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const along = (k - n / 2) * 0.8 + (rc() - 0.5) * 0.3, off = (rc() - 0.5) * 0.5, sc = 0.9 + rc() * 0.25;
        list.push({
          p: V3(sp.x + sp.f.Th.x * along + sp.f.Lh.x * sp.sg * off, GROUND_Y, sp.z + sp.f.Th.z * along + sp.f.Lh.z * sp.sg * off),
          q, s: V3(sc, sc, sc), shirt: new THREE.Color(shirts[(rc() * shirts.length) | 0]), skin: new THREE.Color(skins[(rc() * skins.length) | 0])
        });
      }
    });
    if (list.length) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x1a1d2a }); mat.onBeforeCompile = crowdShader;
      const bodyG = new THREE.BoxGeometry(0.34, 0.5, 0.2); bodyG.translate(0, 0.25, 0);
      const headG = new THREE.SphereGeometry(0.13, 8, 6); headG.translate(0, 0.65, 0);
      makeInstanced(bodyG, mat, list.map(o => ({ p: o.p, q: o.q, s: o.s, c: o.shirt })));
      makeInstanced(headG, mat, list.map(o => ({ p: o.p, q: o.q, s: o.s, c: o.skin })));
    }
  });

  // Leitkegel an der Boxengasse
  if (SCENE.CONES && SCENE.PIT_LANE) sect(1, () => {
    const half = Math.round(42 / DS), st = Math.max(1, Math.round(6 / DS)), items = [];
    const g = new THREE.ConeGeometry(0.17, 0.55, 8); g.translate(0, 0.275, 0);
    for (let i = -half; i <= half; i += st) items.push({ p: wp(frames[mod(i)], HALF_W + 3.1, -0.02) });
    makeInstanced(g, lamb(0xff6a1a), items);
  });

  // Zeltplatz: Zelte (mit Laternen) und Wohnwagen abseits der Strecke
  if (SCENE.TENTS) sect(1, () => {
    const pal = [0xe8462a, 0x2a7de8, 0xf2c030, 0x3ab870, 0xe8e8ee, 0x9a4ae8].map(c => new THREE.Color(c));
    const g = new THREE.ConeGeometry(2.4, 2.0, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, 1, 0);
    const items = [], lanterns = [];
    freeSpots(8505, SCENE.TENTS, 26, 70, 520, 400, 3.5).forEach(t => {
      const sc = 0.8 + t.a * 0.6;
      items.push({ p: V3(t.x, GROUND_Y, t.z), q: yawQ(t.b * 6.28), s: V3(sc, sc, sc), c: pal[(t.c * pal.length) | 0] });
      lanterns.push(t.x + 2.6, GROUND_Y + 1.3, t.z);
    });
    makeInstanced(g, lamb(0xffffff), items);
    glowPoints(lanterns, 3.5, 0xffb060);
  });
  if (SCENE.CARAVANS) sect(1, () => {
    const g = new THREE.BoxGeometry(2.3, 1.7, 5.2); g.translate(0, 0.95, 0);
    const items = [], stripe = [];
    freeSpots(8606, SCENE.CARAVANS, 22, 70, 520, 400, 4.5).forEach(t => {
      const q = yawQ(t.b * 6.28);
      items.push({ p: V3(t.x, GROUND_Y, t.z), q, c: hsl(0.1 + t.c * 0.1, 0.15, 0.78 + t.a * 0.12) });
      stripe.push({ p: V3(0, 1.1, 0).applyQuaternion(q).add(V3(t.x, GROUND_Y, t.z)), q, s: V3(2.34, 0.25, 5.24), c: hsl(t.d, 0.6, 0.4) });
    });
    makeInstanced(g, lamb(0xffffff), items);
    makeInstanced(new THREE.BoxGeometry(1, 1, 1), lamb(0xffffff), stripe);
  });

  // Teiche mit Uferrand, Schilf und Sonnenreflex (Phong-Glanzlicht)
  if (SCENE.PONDS) sect(2, () => {
    const rn = mulberry32(8707), ponds = [], reeds = [];
    for (let t = 0; t < 3000 && ponds.length < SCENE.PONDS; t++) {
      const x = (rn() - 0.5) * 480, z = (rn() - 0.5) * 360, r = 7 + rn() * 9, md = r + 14;
      if (minDistToTrack2(x, z, md * md) < md * md || !clearOfScenery(x, z, r + 1.5)) continue;
      if (ponds.some(q => Math.hypot(q.x - x, q.z - z) < q.r + r + 10)) continue;
      ponds.push({ x, z, r, sz: 0.6 + rn() * 0.4, rot: rn() * 6.28 });
    }
    const waterMat = new THREE.MeshPhongMaterial({
      color: 0x2f5a7a, specular: 0xffc890, shininess: 90, transparent: true, opacity: 0.88,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    });
    const bankMat = new THREE.MeshLambertMaterial({ color: 0x6b5d3c, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    ponds.forEach(q => {
      [[q.r + 0.9, bankMat, 0.03], [q.r, waterMat, 0.06]].forEach(o => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(o[0], 32), o[1]);
        m.rotation.set(-Math.PI / 2, 0, q.rot);
        m.scale.y = q.sz;
        m.position.set(q.x, GROUND_Y + o[2], q.z);
        scene.add(m);
      });
      for (let k = 0; k < 18; k++) {
        if (rn() < 0.3) continue;
        const a = (k / 18) * 6.28 + rn() * 0.3, px = Math.cos(a) * (q.r + 0.5), py = Math.sin(a) * (q.r + 0.5) * q.sz;
        const X = px * Math.cos(q.rot) - py * Math.sin(q.rot), Y = px * Math.sin(q.rot) + py * Math.cos(q.rot);
        for (let j = 0; j < 3; j++) reeds.push({
          p: V3(q.x + X + (rn() - 0.5) * 0.6, GROUND_Y, q.z - Y + (rn() - 0.5) * 0.6),
          s: V3(1, 0.8 + rn() * 1.2, 1), c: hsl(0.2 + rn() * 0.08, 0.45, 0.14 + rn() * 0.08)
        });
      }
    });
    const reedG = new THREE.ConeGeometry(0.06, 1.2, 4); reedG.translate(0, 0.6, 0);
    makeInstanced(reedG, swayMat(0xffffff), reeds);
  });

  // Windräder im Hintergrund (drehen sich, rotes Warnlicht)
  if (SCENE.TURBINES) sect(2, () => {
    const white = lamb(0xe8e8ee), beacons = [];
    freeSpots(8808, SCENE.TURBINES, 70, 200, 520, 400).forEach(t => {
      const grp = new THREE.Group();
      grp.position.set(t.x, GROUND_Y, t.z);
      grp.rotation.y = Math.atan2(-t.x, -t.z);                 // Rotor blickt zur Streckenmitte
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 34, 10), white); tower.position.y = 17; grp.add(tower);
      const nac = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 3), white); nac.position.set(0, 34.2, -0.2); grp.add(nac);
      const rotor = new THREE.Group(); rotor.position.set(0, 34.2, 1.6); grp.add(rotor);
      rotor.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), white));
      for (let k = 0; k < 3; k++) {
        const pv = new THREE.Group(); pv.rotation.z = k * Math.PI * 2 / 3;
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 10, 0.12), white); bl.position.y = 5.2; pv.add(bl); rotor.add(pv);
      }
      scene.add(grp);
      turbineRotors.push({ rotor, sp: 0.5 + t.a * 0.5 });
      beacons.push(t.x, GROUND_Y + 35.2, t.z);
    });
    glowPoints(beacons, 5, 0xff3344);
  });

  // Heissluftballons: gestreifte Hülle, Korb, Brennerglühen; kreisen langsam am Himmel
  if (SCENE.BALLOONS) sect(2, () => {
    const stripeCols = [[0xe8462a, 0xf6f0e0], [0x2a7de8, 0xf2c030], [0x9a4ae8, 0xf6f0e0]];
    const glowTex = getGlowTex();
    for (let b = 0; b < SCENE.BALLOONS; b++) {
      const eg = new THREE.SphereGeometry(5.5, 18, 14), pos = eg.attributes.position, col = new Float32Array(pos.count * 3), pc = stripeCols[b % 3];
      for (let i = 0; i < pos.count; i++) {
        const band = Math.floor((Math.atan2(pos.getX(i), pos.getZ(i)) / Math.PI + 1) * 6), c = new THREE.Color(pc[band % 2]);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      eg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const g = new THREE.Group();
      const env = new THREE.Mesh(eg, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x302018 })); env.scale.y = 1.25; g.add(env);
      const basket = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1, 1.3), lamb(0x6b4a2a)); basket.position.y = -8.4; g.add(basket);
      [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].forEach(o => {
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 4), lamb(0x222222)); rope.position.set(o[0], -6.6, o[1]); g.add(rope);
      });
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a40, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      fl.scale.set(3, 3, 1); fl.position.y = -6.6; g.add(fl);
      g.scale.setScalar(1.5);
      scene.add(g);
      balloons.push({ g, R: 210 + b * 30, a: b * 2.1, w: 0.008 + 0.002 * b, y: 80 + b * 14 });
    }
  });

  // Glühwürmchen: leuchtende Punkte, die im Vertex-Shader schweben
  if (SCENE.FIREFLIES) sect(2, () => {
    const rn = mulberry32(8111), pos = [];
    for (let k = 0; k < SCENE.FIREFLIES * 4 && pos.length < SCENE.FIREFLIES * 3; k++) {
      const i = (rn() * N) | 0;
      if (inTunnel(i)) continue;
      const f = frames[i], lat = (rn() < 0.5 ? -1 : 1) * (HALF_W + 4 + rn() * 28);
      pos.push(f.P.x + f.Lh.x * lat, GROUND_Y + 0.6 + rn() * 3.5, f.P.z + f.Lh.z * lat);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.8, map: getGlowTex(), color: THEME.firefly || 0xfff0a0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = crowdUni.time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        'transformed.x += sin(uTime * 0.7 + position.z * 1.3) * 1.2;\n' +
        'transformed.y += sin(uTime * 1.1 + position.x * 0.9) * 0.6;\n' +
        'transformed.z += cos(uTime * 0.6 + position.x * 1.1) * 1.2;');
    };
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
  });
}

// Atmosphäre pro Frame: Wolken driften, Vögel fliegen
function updateAtmosphere(dt) {
  const ca = Math.cos(0.006 * dt), sa = Math.sin(0.006 * dt);
  for (let i = 0; i < cloudSprites.length; i++) {
    const p = cloudSprites[i].position, x = p.x;
    p.x = x * ca - p.z * sa; p.z = x * sa + p.z * ca;
  }
  updateBirds(dt);
  if (CITY) updateCityLife(dt);
  if (ALPINE) updateAlpineLife(dt);
  if (MOONRING) updateMoonRing(dt);
  for (let i = 0; i < turbineRotors.length; i++) turbineRotors[i].rotor.rotation.z += turbineRotors[i].sp * dt;
  for (let i = 0; i < balloons.length; i++) {
    const b = balloons[i];
    b.a += b.w * dt;
    b.g.position.set(Math.cos(b.a) * b.R, b.y + Math.sin(fxClock * 0.4 + i * 2) * 1.5, Math.sin(b.a) * b.R);
    b.g.rotation.y += 0.05 * dt;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEON-STADT – alles, was nur bei THEME.city läuft (Strecke 1 bleibt unberührt)
// ═══════════════════════════════════════════════════════════════════════════════
const NEON_PAL = ['#18e6ff', '#ff2bd6', '#a65bff', '#ff8a1a'];                 // Cyan / Magenta / Violett / Orange
const NEON_HEX = [0x18e6ff, 0xff2bd6, 0xa65bff, 0xff8a1a];
const CITY_SPONSORS = [                                                          // erfundene Marken für Banden
  { name: 'NOVA-COLA',    a: '#ff2a55', b: '#6a0a2a', fg: '#ffffff' },
  { name: 'KANJI RAMEN',  a: '#ff9a1a', b: '#7a2a00', fg: '#1a0a00' },
  { name: 'GHOST MOTORS', a: '#18e6ff', b: '#06406a', fg: '#021018' },
  { name: 'SYNTHWAVE FM', a: '#c04dff', b: '#2a0a6a', fg: '#ffffff' },
  { name: 'HOLO-BANK',    a: '#2dff9a', b: '#0a5a3a', fg: '#02140c' },
  { name: 'VOLT-X',       a: '#ffe14a', b: '#7a5a00', fg: '#1a1200' }
];
// Reklame-Marken (Canvas-Neon): style 'box' = Leuchtschild, 'holo' = additives Hologramm (schwarz = durchsichtig)
const NEON_BRANDS = [
  { name: 'NOVA-COLA',     sub: 'ICE COLD NEON',        c1: '#ff3a6a', c2: '#ffd0dc', bg: '#2a0612', style: 'box' },
  { name: 'KANJI RAMEN',   sub: '24H  •  HOT NOODLES',  c1: '#ffa21a', c2: '#fff0c0', bg: '#2a1200', style: 'box' },
  { name: 'GHOST MOTORS',  sub: 'DRIVE THE VOID',       c1: '#19e6ff', c2: '#d8fbff', bg: '#041a26', style: 'box' },
  { name: 'SYNTHWAVE FM',  sub: '98.7  •  NON-STOP',    c1: '#d44dff', c2: '#ffd0ff', bg: '#1a0630', style: 'sun' },
  { name: 'HOLO-BANK',     sub: 'YOUR CREDIT. ONLINE.', c1: '#38ffa8', c2: '#d6ffe8', bg: '#02180f', style: 'holo' },
  { name: 'VOLT-X',        sub: 'POWER YOUR NIGHT',     c1: '#ffe14a', c2: '#fff8d0', bg: '#2a2000', style: 'box' },
  { name: 'NEON-STADT GP', sub: 'TONIGHT  •  LIVE',     c1: '#ff2bd6', c2: '#ffffff', bg: '#12041f', style: 'holo' },
  { name: 'RAMEN', vertical: true, c1: '#ff9a1a', c2: '#fff0c0', bg: '#2a1200', style: 'box' },
  { name: 'CLUB 9', vertical: true, c1: '#ff2bd6', c2: '#ffd8f6', bg: '#1a0620', style: 'box' }
];

// Nasser Asphalt: Albedo, Leuchtfarbe (Markierungen + Neon-Spiegelungen) und Rauheit (Pfützen = glatt)
function makeCityRoadTextures() {
  const S = 512;
  const A = newCanvas(S, S), E = newCanvas(S, S), R = newCanvas(S, S);
  const g = A.g, ge = E.g, gr = R.g;
  g.fillStyle = '#262a3e'; g.fillRect(0, 0, S, S);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  gr.fillStyle = 'rgb(170,170,170)'; gr.fillRect(0, 0, S, S);
  const rnd = mulberry32(2121);
  for (let i = 0; i < 30; i++) {                                    // Asphaltwolken
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 80, dark = rnd() < 0.6, a = 0.05 + rnd() * 0.07;
    drawWrapped(S, x, y, r, (px, py) => blob(g, px, py, r, dark ? '0,0,10' : '150,160,255', dark ? a : a * 0.5));
  }
  for (let i = 0; i < 20000; i++) {                                 // Körnung
    const a = 0.04 + rnd() * 0.08;
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + (a * 1.6) + ')';
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  for (let i = 0; i < 9; i++) {                                     // Pfützen: dunkel, glatt, spiegeln Neon
    const x = 60 + rnd() * (S - 120), y = rnd() * S, r = 26 + rnd() * 40, sy = 0.4 + rnd() * 0.3;
    const rgb = ['255,43,214', '24,230,255', '166,91,255'][i % 3];
    drawWrapped(S, x, y, r * 1.5, (px, py) => {
      [[g, '6,8,26', 0.5], [gr, '12,12,12', 0.95], [ge, rgb, 0.16]].forEach(o => {
        o[0].save(); o[0].translate(px, py); o[0].scale(1.5, sy * 1.4); blob(o[0], 0, 0, r, o[1], o[2]); o[0].restore();
      });
    });
  }
  const streak = (ctx, x, len, w, rgb, a, y) => {                  // verschmierte Lichtstreifen entlang der Fahrtrichtung
    for (const oy of [-S, 0, S]) {
      const gg = ctx.createLinearGradient(0, y + oy, 0, y + oy + len);
      gg.addColorStop(0, 'rgba(' + rgb + ',0)'); gg.addColorStop(0.5, 'rgba(' + rgb + ',' + a + ')'); gg.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = gg;
      ctx.fillRect(x - w / 2, y + oy, w, len);
      ctx.fillRect(x - w / 4, y + oy, w / 2, len);
    }
  };
  for (let i = 0; i < 16; i++) {
    const x = 50 + rnd() * 410, len = 90 + rnd() * 260, w = 6 + rnd() * 22, y = rnd() * S, rgb = ['255,43,214', '24,230,255', '255,138,26', '166,91,255'][(rnd() * 4) | 0];
    streak(ge, x, len, w, rgb, 0.32 + rnd() * 0.18, y);
    streak(g, x, len, w, rgb, 0.12, y);
  }
  for (let i = 0; i < 7; i++) {                                     // feine Risse
    let x = rnd() * S, y = rnd() * S; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 26; y += 8 + rnd() * 16; g.lineTo(x, y); } g.stroke();
  }
  // Markierungen: Kantenlinien weiss (glüht cyan), Mittellinie gestrichelt in Pink
  const mark = (x, y, w, h, col, gcol) => { g.fillStyle = col; g.fillRect(x, y, w, h); ge.fillStyle = gcol; ge.fillRect(x, y, w, h); };
  mark(24, 0, 12, S, '#e8f7ff', 'rgb(150,225,255)');
  mark(476, 0, 12, S, '#e8f7ff', 'rgb(150,225,255)');
  mark(250, 0, 12, 256, '#ff5cd6', 'rgb(255,70,210)');
  for (let i = 0; i < 90; i++) {                                    // Abrieb der Farbe
    const x = [24, 476, 250][i % 3] + rnd() * 12, y = rnd() * S;
    g.fillStyle = 'rgba(38,42,62,0.7)'; g.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 4);
    ge.fillStyle = '#000'; ge.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 4);
  }
  return { map: toTexture(A.c, true), emi: toTexture(E.c, true), rough: toTexture(R.c, true) };
}

function makeCityGroundTexture() {
  const S = 256, { c, g } = newCanvas(S, S), rnd = mulberry32(77);
  g.fillStyle = '#0c0e1c'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 24; i++) drawWrapped(S, rnd() * S, rnd() * S, 50, (px, py) => blob(g, px, py, 40 + rnd() * 30, rnd() < 0.5 ? '40,30,90' : '0,0,10', 0.22));
  g.fillStyle = 'rgba(80,90,160,0.20)';
  for (let k = 0; k < 4; k++) { g.fillRect(k * 64, 0, 1.5, S); g.fillRect(0, k * 64, S, 1.5); }
  for (let i = 0; i < 2500; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)'; g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5); }
  const t = toTexture(c, true); t.wrapS = THREE.RepeatWrapping; t.repeat.set(100, 100);
  return t;
}
function makeCitySidewalkTexture() {
  const S = 128, { c, g } = newCanvas(S, S), rnd = mulberry32(55);
  g.fillStyle = '#3a3f5e'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 600; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.15)'; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  g.fillStyle = '#242842'; g.fillRect(0, 0, S, 3); g.fillRect(0, 64, S, 2); g.fillRect(0, 0, 3, S); g.fillRect(64, 0, 2, S);
  return toTexture(c, true);
}

// Fassaden: je Palette eine Albedo- und eine Emissive-Textur (8×8 Fenster pro Kachel, flackern per Shader)
function makeNeonFacadeTextures(v) {
  const S = 256, a = newCanvas(S, S), b = newCanvas(S, S);
  const pals = [['#18e6ff', '#7af3ff', '#ffffff', '#ff2bd6'], ['#ff2bd6', '#ff7ae8', '#a65bff', '#18e6ff'], ['#ff8a1a', '#ffc46b', '#fff1c9', '#18e6ff']];
  const pal = pals[v % 3], base = ['#141b34', '#1b1334', '#1c1826'][v % 3];
  a.g.fillStyle = base; a.g.fillRect(0, 0, S, S);
  b.g.fillStyle = '#000'; b.g.fillRect(0, 0, S, S);
  const rnd = mulberry32(900 + v * 37);
  for (let i = 0; i < 500; i++) { a.g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.14)'; a.g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  for (let cy = 0; cy < 8; cy++) {
    a.g.fillStyle = 'rgba(255,255,255,0.05)'; a.g.fillRect(0, cy * 32 + 1, S, 2);
    for (let cx = 0; cx < 8; cx++) {
      const x = cx * 32 + 7, y = cy * 32 + 8;
      a.g.fillStyle = '#070a16'; a.g.fillRect(x, y, 18, 16);
      if (rnd() < 0.42) {
        const col = pal[(rnd() * pal.length) | 0];
        a.g.fillStyle = col; a.g.fillRect(x, y, 18, 16);
        b.g.fillStyle = col; b.g.fillRect(x, y, 18, 16);
        a.g.fillStyle = 'rgba(0,0,0,0.5)'; a.g.fillRect(x + 8, y, 2, 16);
        b.g.fillStyle = '#000'; b.g.fillRect(x + 8, y, 2, 16);
      }
    }
  }
  b.g.fillStyle = pal[3]; b.g.fillRect(0, 124, S, 3); a.g.fillStyle = pal[3]; a.g.fillRect(0, 124, S, 3);   // Leuchtband pro Kachel
  const mk = c => { const t = toTexture(c, true); t.wrapS = THREE.RepeatWrapping; return t; };
  return { map: mk(a.c), emi: mk(b.c) };
}

// Ferne Skyline-Silhouette (statt Berge): Hochhäuser mit Fenster-Punkten, Dachspitzen, Neonkanten
function makeSkylineTexture(ph, amp, top, bottom) {
  const { c, g } = newCanvas(1024, 128);
  g.clearRect(0, 0, 1024, 128);
  const rnd = mulberry32(Math.floor(ph * 100) + 11);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  const bl = [];
  for (let x = 0; x < 1024;) { const w = 9 + rnd() * 26, h = (12 + rnd() * rnd() * 96) * (0.55 + amp * 0.55); bl.push({ x, w, h }); x += w - (rnd() < 0.25 ? 5 : 0); }
  const cols = ['24,230,255', '255,43,214', '255,138,26', '255,255,255'];
  bl.forEach(b => {
    g.fillStyle = gr; g.fillRect(b.x, 128 - b.h, b.w, b.h);
    if (b.h > 70 && rnd() < 0.6) { g.fillRect(b.x + b.w * 0.45, 128 - b.h - 8 - rnd() * 14, 2, 24); }          // Antenne
    const dens = 0.07 + 0.1 * rnd();
    for (let yy = 128 - b.h + 4; yy < 125; yy += 5) for (let xx = b.x + 2; xx < b.x + b.w - 2; xx += 4) {
      if (rnd() < dens) { g.fillStyle = 'rgba(' + cols[(rnd() * 4) | 0] + ',' + (0.35 + rnd() * 0.45) + ')'; g.fillRect(xx, yy, 2, 2); }
    }
    if (rnd() < 0.28) { g.fillStyle = 'rgba(' + cols[(rnd() * 3) | 0] + ',0.85)'; g.fillRect(b.x, 128 - b.h, b.w, 1.5); }   // Neon-Dachkante
  });
  const t = toTexture(c, false); t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Synthwave-Sonne: Verlauf Gelb → Magenta, nach unten dicker werdende Schlitze
function makeRetroSunTexture() {
  const S = 256, { c, g } = newCanvas(S, S);
  const gr = g.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, '#fff27a'); gr.addColorStop(0.5, '#ff8a3a'); gr.addColorStop(1, '#ff1f8e');
  g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 7; k++) g.fillRect(0, S * 0.5 + k * S * 0.068, S, 3 + k * 2.6);
  g.globalCompositeOperation = 'source-over';
  return toTexture(c, false);
}

// Leuchtschild / Hologramm für Reklamen
function makeNeonSignTexture(b) {
  const vert = !!b.vertical, W = vert ? 128 : 512, H = vert ? 512 : 256;
  const { c, g } = newCanvas(W, H);
  const holo = b.style === 'holo';
  g.fillStyle = holo ? '#000' : b.bg; g.fillRect(0, 0, W, H);
  if (b.style === 'sun') {                                              // Retro-Sonne hinter dem Schriftzug
    const gr = g.createLinearGradient(0, 40, 0, H); gr.addColorStop(0, 'rgba(255,200,80,0.9)'); gr.addColorStop(1, 'rgba(255,40,160,0.9)');
    g.fillStyle = gr; g.beginPath(); g.arc(W / 2, H * 0.62, H * 0.42, Math.PI, 0); g.fill();
    g.fillStyle = b.bg; for (let k = 0; k < 5; k++) g.fillRect(W * 0.2, H * 0.62 - 6 - k * 14, W * 0.6, 2 + k * 1.2);
  }
  g.lineJoin = 'round';
  g.shadowColor = b.c1; g.shadowBlur = holo ? 16 : 14; g.strokeStyle = b.c1; g.lineWidth = vert ? 5 : 6;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.shadowBlur = 6; g.strokeStyle = b.c2; g.lineWidth = 2; g.strokeRect(20, 20, W - 40, H - 40);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (vert) {
    const ch = b.name.replace(/ /g, '').split('');
    const step = (H - 70) / ch.length;
    ch.forEach((chr, i) => {
      g.shadowColor = b.c1; g.shadowBlur = 18; g.fillStyle = '#ffffff'; g.font = '900 62px Arial, sans-serif';
      g.fillText(chr, W / 2, 45 + step * (i + 0.5));
    });
  } else {
    let fs = 78; g.font = 'italic 900 ' + fs + 'px Arial, sans-serif';
    const tw = g.measureText(b.name).width; if (tw > W - 64) { fs = Math.floor(fs * (W - 64) / tw); g.font = 'italic 900 ' + fs + 'px Arial, sans-serif'; }
    g.shadowColor = b.c1; g.shadowBlur = 22; g.fillStyle = '#ffffff'; g.fillText(b.name, W / 2, H * 0.44);
    g.shadowBlur = 10; g.fillStyle = b.c1; g.fillText(b.name, W / 2, H * 0.44);
    g.shadowBlur = 8; g.shadowColor = b.c2; g.fillStyle = b.c2; g.font = '700 26px Arial, sans-serif'; g.fillText(b.sub, W / 2, H * 0.78);
  }
  g.shadowBlur = 0;
  if (holo) { g.fillStyle = 'rgba(0,0,0,0.45)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2); }          // Scanlines
  return toTexture(c, false);
}

// Breites Banner (Start-Gantry, Sektor-Torbögen, Zeppelin)
function makeCityBannerTexture(text, c1, c2, sub) {
  const { c, g } = newCanvas(1024, 256);
  g.fillStyle = '#0a0618'; g.fillRect(0, 0, 1024, 256);
  const gr = g.createLinearGradient(0, 0, 1024, 0);
  gr.addColorStop(0, 'rgba(255,43,214,0.20)'); gr.addColorStop(0.5, 'rgba(24,230,255,0.10)'); gr.addColorStop(1, 'rgba(255,43,214,0.20)');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  g.lineJoin = 'round';
  g.shadowColor = c1; g.shadowBlur = 18; g.strokeStyle = c1; g.lineWidth = 6; g.strokeRect(12, 12, 1000, 232);
  g.shadowColor = c2; g.shadowBlur = 8; g.strokeStyle = c2; g.lineWidth = 2; g.strokeRect(26, 26, 972, 204);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = 132; g.font = 'italic 900 ' + fs + 'px Arial, sans-serif';
  const tw = g.measureText(text).width; if (tw > 900) { fs = Math.floor(fs * 900 / tw); g.font = 'italic 900 ' + fs + 'px Arial, sans-serif'; }
  const ty = sub ? 112 : 130;
  g.shadowColor = c1; g.shadowBlur = 26; g.fillStyle = '#ffffff'; g.fillText(text, 512, ty);
  g.shadowBlur = 10; g.fillStyle = c1; g.fillText(text, 512, ty);
  if (sub) { g.shadowColor = c2; g.shadowBlur = 8; g.fillStyle = c2; g.font = '700 38px Arial, sans-serif'; g.fillText(sub, 512, 205); }
  return toTexture(c, false);
}

// Umgebungsmap der Stadt (Strassen-Spiegelungen + Autolack): Violett-Himmel, Magenta/Cyan-Horizont, Neon-Türme
function makeCityEnvCanvas() {
  const { c, g } = newCanvas(256, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  [[0, '#0b0524'], [0.3, '#2a0f66'], [0.45, '#8a1f9a'], [0.5, '#ff4fb0'], [0.53, '#1a0c3a'], [1, '#06030f']].forEach(s => gr.addColorStop(s[0], s[1]));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  const rnd = mulberry32(5);
  for (let x = 0; x < 256; x += 5) {                                       // Türme
    const w = 4 + rnd() * 6, h = 8 + rnd() * rnd() * 46;
    g.fillStyle = '#0a0618'; g.fillRect(x, 64 - h, w, h);
    for (let k = 0; k < 6; k++) { g.fillStyle = NEON_PAL[(rnd() * 4) | 0]; g.globalAlpha = 0.5 + rnd() * 0.5; g.fillRect(x + rnd() * w, 64 - rnd() * h, 1.5, 1.5); }
    g.globalAlpha = 1;
  }
  for (let i = 0; i < 26; i++) blob(g, rnd() * 256, 40 + rnd() * 24, 4 + rnd() * 8, ['255,43,214', '24,230,255', '255,138,26'][i % 3], 0.7);
  blob(g, 70, 52, 22, '255,120,190', 0.9);
  return c;
}

// ─── Materialien & Shader ────────────────────────────────────────────────────
function kerbMaterial(extra) {
  const map = makeKerbTexture();
  if (!CITY) return lambert(0xffffff, Object.assign({ map }, extra || {}));
  return lambert(0xffffff, Object.assign({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.5 }, extra || {}));
}
function roadMaterial() {
  if (ALPINE) return lambert(0xffffff, { map: makeAlpineRoadTexture() });
  if (!CITY) return lambert(0xffffff, { map: makeRoadTexture() });
  const t = makeCityRoadTextures();
  const env = makeEnvMap(renderer);                                   // null, falls PMREM nicht geht -> einfacher Lambert-Fallback
  if (env) return new THREE.MeshStandardMaterial({
    color: 0xffffff, map: t.map, roughnessMap: t.rough, roughness: 1, metalness: 0.1, envMap: env, envMapIntensity: 0.85,
    emissive: 0xffffff, emissiveMap: t.emi, emissiveIntensity: 0.85, side: THREE.DoubleSide
  });
  return lambert(0xffffff, { map: t.map, emissive: 0xffffff, emissiveMap: t.emi, emissiveIntensity: 0.85 });
}

// Neon-Pulsieren/Flackern/Lauflicht: gemeinsamer Zeit-Uniform, Phase aus der Instanz-Position (keine CPU-Arbeit)
function neonShader(mode) {
  return sh => {
    sh.uniforms.uTime = crowdUni.time;
    const calc = mode === 'chase'
      ? 'vNeon = 0.5 + 0.5 * pow(0.5 + 0.5 * sin(uTime * 3.2 - instanceMatrix[3].z * 0.42 - instanceMatrix[3].x * 0.42), 2.0);\n'
      : 'float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.57 + instanceMatrix[3].y * 0.11;\n' +
        'float pul = 0.86 + 0.14 * sin(uTime * (0.7 + 0.5 * fract(ph * 1.7)) + ph * 6.0);\n' +
        (mode === 'flick'
          ? 'float s1 = sin(uTime * 1.3 + ph * 3.1) * sin(uTime * 2.9 + ph * 1.3);\nfloat fl = (fract(ph * 7.3) > 0.55 && s1 > 0.9) ? 0.2 : 1.0;\nvNeon = pul * fl;\n'
          : 'vNeon = pul;\n');
    sh.vertexShader = 'uniform float uTime;\nvarying float vNeon;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n#ifdef USE_INSTANCING\n' + calc + '#else\nvNeon = 1.0;\n#endif');
    sh.fragmentShader = 'varying float vNeon;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vNeon;');
  };
}
// Fassaden: ein paar Fenster flackern (Hash pro Fensterzelle)
function facadeShader(sh) {
  sh.uniforms.uTime = crowdUni.time;
  sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n' +
    'vec2 wc = floor(vUv * 8.0);\n' +
    'float hh = fract(sin(dot(wc, vec2(12.9898, 78.233))) * 43758.5453);\n' +
    'float fl = hh > 0.93 ? (0.3 + 0.7 * step(0.0, sin(uTime * (1.4 + hh * 8.0) + hh * 40.0))) : 1.0;\n' +
    'totalEmissiveRadiance *= fl;');
}
// Blinkende Warnlichter (Antennen): Punkte mit Phase pro Punkt
function blinkPoints(pos, size, color) {
  if (!pos.length) return null;
  const n = pos.length / 3, ph = new Float32Array(n);
  for (let i = 0; i < n; i++) ph[i] = hash2(i * 7 + 3, 11);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.PointsMaterial({ size, map: getGlowTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = crowdUni.time;
    sh.vertexShader = 'attribute float aPh;\nuniform float uTime;\nvarying float vBl;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nfloat tt = fract(uTime * 0.75 + aPh);\nvBl = tt < 0.2 ? 1.0 : 0.08;');
    sh.fragmentShader = 'varying float vBl;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vBl;');
  };
  const p = new THREE.Points(g, m);
  p.frustumCulled = false; scene.add(p);
  return p;
}
// Box-Gruppe mit Vertex-Farben zu einer Geometrie verschmelzen (Flugauto, Zeppelin ...)
function mergeColoredBoxes(list) {
  const geos = [], cols = [];
  list.forEach(b => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d); g.translate(b.x || 0, b.y || 0, b.z || 0);
    geos.push(g);
    const c = new THREE.Color(b.c);
    for (let i = 0; i < g.attributes.position.count; i++) cols.push(c.r, c.g, c.b);
  });
  const m = mergeGeos(geos);
  m.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return m;
}

// ─── Strassenrand: Betonbarrieren mit Neon-Leuchtstreifen (statt Leitplanken) ─
function buildCityBarriers() {
  const body = lambert(0x4a5070, { emissive: 0x0c0e1c });
  const okRail = [];
  for (let i = 0; i < N; i++) okRail.push(!inTunnel(i));
  const stripMat = [new THREE.MeshBasicMaterial({ color: 0x18e6ff, side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ color: 0xff2bd6, side: THREE.DoubleSide })];
  buildRuns(okRail).forEach(run => {
    [1, -1].forEach(sg => {
      // Jersey-Profil: Rückwand, Deckfläche, geneigte Vorderseite mit Fussverbreiterung
      addMesh(buildStrip(run.a, run.b, () => [
        [sg * (HALF_W + 1.45), -0.05], [sg * (HALF_W + 1.45), 0.95], [sg * (HALF_W + 1.0), 1.0],
        [sg * (HALF_W + 0.97), 0.45], [sg * (HALF_W + 0.8), 0.0]
      ]), body, { cast: true });
      addMesh(buildStrip(run.a, run.b, () => [[sg * (HALF_W + 0.95), 0.56], [sg * (HALF_W + 0.95), 0.74]]), stripMat[sg > 0 ? 0 : 1]);    // links Cyan, rechts Magenta
    });
  });
  const glowC = [], glowM = [], st = Math.max(1, Math.round(7 / DS));
  for (let i = 0; i < N; i += st) {
    if (inTunnel(i)) continue;
    const f = frames[i];
    const a = wp(f, HALF_W + 0.9, 0.65), b = wp(f, -(HALF_W + 0.9), 0.65);
    glowC.push(a.x, a.y, a.z); glowM.push(b.x, b.y, b.z);
  }
  glowPoints(glowC, 2.4, 0x18e6ff, 0.55);
  glowPoints(glowM, 2.4, 0xff2bd6, 0.55);
}

// Leuchtende Streifen an den Brückenpfeilern
function cityPierGlow(pierItems) {
  const items = pierItems.map((it, i) => ({
    p: it.p.clone(), q: it.q, s: new THREE.Vector3(0.22, it.s.y * 0.92, it.s.z + 0.06), c: new THREE.Color(NEON_HEX[i % 2])
  }));
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), items);
}

// Strassenlaternen: Reihen, abwechselnd Cyan/Magenta, Glow-Sprites + Lichtpfützen statt echter Lichter
function buildCityLamps() {
  const step = Math.max(1, Math.round(26 / DS));
  const poles = [], heads = [], pools = [], glow = [[], []];
  const cols = [new THREE.Color(0x18e6ff), new THREE.Color(0xff2bd6)];
  let k = 0;
  for (let i = 40; i < N; i += step, k++) {
    const f = frames[i];
    if (inBridge(i) || inTunnel(i) || inUnder(i) || Math.abs(wrapIdx(i)) < 55) continue;
    if (Math.abs(wrapIdx(i - bridgeR.c)) < bridgeR.h + 12 || Math.abs(wrapIdx(i - tunnelR.c)) < tunnelR.h + 12) continue;
    if (gantrySpots.some(s => Math.abs(wrapIdx(i - s)) < Math.round(8 / DS))) continue;
    const ci = k % 2;
    [1, -1].forEach(sg => {
      const b = wp(f, sg * (HALF_W + 2.7), -0.05);
      poles.push({ p: new THREE.Vector3(b.x, b.y + 4, b.z) });
      const hd = wp(f, sg * (HALF_W + 1.6), -0.05);
      heads.push({ p: new THREE.Vector3(hd.x, hd.y + 8.0, hd.z), q: yawQuat(f), c: cols[ci] });
      glow[ci].push(hd.x, hd.y + 7.9, hd.z);
      pools.push({ p: wp(f, sg * (HALF_W - 2.4), 0.13), q: frameQuat(f), s: new THREE.Vector3(12, 1, 12), c: cols[ci] });
    });
  }
  makeInstanced(new THREE.CylinderGeometry(0.09, 0.13, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2a2f48 }), poles);
  makeInstanced(new THREE.BoxGeometry(0.5, 0.15, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff }), heads);
  glowPoints(glow[0], 9, 0x18e6ff, 0.9);
  glowPoints(glow[1], 9, 0xff2bd6, 0.9);
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  makeInstanced(poolGeo, new THREE.MeshBasicMaterial({
    map: getGlowTex(), color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  }), pools);
}

// Neon-Tunnel: Lichtringe in wechselnden Farben, per Shader als Lauflicht (Welle läuft durch den Tunnel)
function buildCityTunnelRings(tA, tB, tw) {
  const pr = [[-tw + 0.1, 0.05], [-tw + 0.1, 4.2], [-tw + 1.7, 5.8], [tw - 1.7, 5.8], [tw - 0.1, 4.2], [tw - 0.1, 0.05]];
  const parts = [];
  for (let k = 0; k < pr.length - 1; k++) {
    const a = pr[k], b = pr[k + 1], dx = b[0] - a[0], dy = b[1] - a[1];
    const g = new THREE.BoxGeometry(Math.hypot(dx, dy) + 0.12, 0.2, 0.4);
    g.rotateZ(Math.atan2(dy, dx)); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    parts.push(g);
  }
  const items = [], glow = [[], [], [], []];
  const cols = NEON_HEX.map(h => new THREE.Color(h));
  const st = Math.max(1, Math.round(5.5 / DS));
  let n = 0;
  for (let i = tA + st; i < tB - 2; i += st, n++) {
    const f = frames[mod(i)];
    items.push({ p: f.P.clone(), q: frameQuat(f), c: cols[n % 4] });
    [[0, 5.9], [-tw + 1.2, 4.5], [tw - 1.2, 4.5]].forEach(o => { const p = wp(f, o[0], o[1]); glow[n % 4].push(p.x, p.y, p.z); });
  }
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.onBeforeCompile = neonShader('chase');
  makeInstanced(mergeGeos(parts), m, items);
  glow.forEach((arr, k) => glowPoints(arr, 3.4, NEON_HEX[k], 0.7));
}

// ─── Start-Gantry „NEON-STADT GP" ────────────────────────────────────────────
function cityStartGantry(g) {
  const gw = HALF_W + 1.9;
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1f33, emissive: 0x080a14 });
  [-1, 1].forEach(sg => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9.8, 0.8), dark); p.position.set(sg * gw, 4.9, 0); g.add(p);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 9.0, 0.9), new THREE.MeshBasicMaterial({ color: sg > 0 ? 0x18e6ff : 0xff2bd6 }));
    s.position.set(sg * gw, 4.9, 0); g.add(s);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: sg > 0 ? 0x18e6ff : 0xff2bd6, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.set(5, 5, 1); sp.position.set(sg * gw, 9.9, 0); g.add(sp);
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(gw * 2 + 1.2, 1.1, 1.1), dark); beam.position.set(0, 9.9, 0); g.add(beam);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(gw * 2, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2bd6 })); bar.position.set(0, 9.25, 0.3); g.add(bar);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2 - 1.0, (gw * 2 - 1.0) / 4),
    new THREE.MeshBasicMaterial({ map: makeCityBannerTexture('NEON-STADT GP', '#ff2bd6', '#18e6ff', 'GRAND PRIX  •  NIGHT RACE'), side: THREE.DoubleSide }));
  banner.position.set(0, 7.3, 0); banner.rotation.y = Math.PI; g.add(banner);
}

// ─── Sektor-Torbögen (Neon-Bögen, je Sektor eigene Farbe) + Laser-Gitter ─────
function createCityArches() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const SEC = [0x18e6ff, 0xff2bd6, 0xff8a1a, 0xa65bff];
  const gw = HALF_W + 1.9;
  const pil = [], pilN = [], arch = [], arch2 = [], laser = [], glow = SEC.map(() => []);
  const rotB = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const texts = [['SEKTOR 2', 'NEON-STADT GP'], ['SEKTOR 3', 'NEON-STADT GP'], ['NEON-STADT', 'KEEP YOUR LINE'], ['NEON-STADT', 'KEEP YOUR LINE']];
  gantrySpots.forEach((gi, n) => {
    const f = frames[gi], ci = n % 4, col = new THREE.Color(SEC[ci]);
    [-1, 1].forEach(sg => {
      const b = wp(f, sg * gw, -0.05);
      pil.push({ p: V3(b.x, b.y + 2.6, b.z), q: yawQuat(f), s: V3(0.7, 5.4, 0.7) });
      pilN.push({ p: V3(b.x, b.y + 2.6, b.z), q: yawQuat(f), s: V3(0.18, 5.0, 0.8), c: col });
      glow[ci].push(b.x, b.y + 0.4, b.z);
    });
    arch.push({ p: wp(f, 0, 4.9), q: frameQuat(f), c: col });
    arch2.push({ p: wp(f, 0, 4.9), q: frameQuat(f), s: V3(0.92, 0.92, 1), c: new THREE.Color(0xffffff) });
    const ap = wp(f, 0, 4.9 + gw); glow[ci].push(ap.x, ap.y, ap.z);
    for (let k = 0; k < 3; k++) laser.push({ p: wp(f, 0, 5.4 + k * 0.6), q: frameQuat(f), s: V3(gw * 2 - 1.0, 1, 1), c: col });
    const tx = texts[ci];
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 2.4), new THREE.MeshBasicMaterial({ map: makeCityBannerTexture(tx[0], '#' + SEC[ci].toString(16).padStart(6, '0'), '#ffffff', tx[1]), side: THREE.DoubleSide }));
    ban.position.copy(wp(f, 0, 9.4)); ban.quaternion.copy(frameQuat(f).multiply(rotB)); scene.add(ban);
  });
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x1a1f33, emissive: 0x080a14 }), pil);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), pilN);
  makeInstanced(new THREE.TorusGeometry(gw, 0.2, 6, 28, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }), arch);
  makeInstanced(new THREE.TorusGeometry(gw, 0.07, 4, 28, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }), arch2);
  const lg = new THREE.BoxGeometry(1, 0.05, 0.05);
  makeInstanced(lg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }), laser);
  glow.forEach((arr, k) => glowPoints(arr, 7, SEC[k], 0.9));
}

// Verfügbare gerade Stelle finden (für Fussgängerbrücken und Hänge-Reklamen)
function cityStraightSpot(fr, gap, flat) {
  const b0 = Math.round(N * fr);
  for (let d = 0; d < 520; d++) {
    const i = mod(b0 + (d % 2 ? -1 : 1) * Math.ceil(d / 2));
    if (trackFree(i, 12) && isStraight(i, 6, 0.013) && Math.abs(wrapIdx(i)) > 90 && (!flat || frames[i].P.y < 1.5) &&
        gantrySpots.every(s => Math.abs(wrapIdx(i - s)) > gap) && standSpots.every(s => Math.abs(wrapIdx(i - s.c)) > s.half + 20)) return i;
  }
  return -1;
}

// Fussgängerbrücken über der Strecke (Deck weit über Fahrzeug- und Kamerahöhe)
function createCityFootbridges() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const half = HALF_W + 4.2, tow = [], deck = [], led = [], under = [], glow = [];
  SCENE.FOOTBRIDGES.forEach(fr => {
    const i = cityStraightSpot(fr, 60, true); if (i < 0) return;
    gantrySpots.push(i);
    const f = frames[i];
    [-1, 1].forEach(sg => {
      const b = wp(f, sg * half, -0.05);
      tow.push({ p: V3(b.x, b.y + 4.2, b.z), q: yawQuat(f), s: V3(1.8, 8.5, 1.8) });
    });
    deck.push({ p: wp(f, 0, 7.8), q: frameQuat(f), s: V3(half * 2 + 2.4, 0.55, 2.6) });
    [-1.25, 1.25].forEach(o => {
      const p = wp(f, 0, 8.65).addScaledVector(f.T, o);
      led.push({ p, q: frameQuat(f), s: V3(half * 2 + 2.2, 0.1, 0.1), c: new THREE.Color(0x18e6ff) });
    });
    under.push({ p: wp(f, 0, 7.48), q: frameQuat(f), s: V3(half * 2 + 2.4, 0.08, 0.3), c: new THREE.Color(0xff2bd6) });
    [-half, 0, half].forEach(o => { const p = wp(f, o, 8.7); glow.push(p.x, p.y, p.z); });
  });
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x22273f, emissive: 0x090b18 }), tow.concat(deck));
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), led.concat(under));
  glowPoints(glow, 5, 0x18e6ff, 0.8);
}

// Hänge-Reklamen: Trägerportal über der Strecke mit grosser Leuchtreklame
function createCityOverheads() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const rotB = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const hw = HALF_W + 3.2, poles = [], beams = [], cables = [], glow = [];
  let n = 0;
  SCENE.OVERHEADS.forEach(fr => {
    const i = cityStraightSpot(fr, 40, false); if (i < 0) return;
    gantrySpots.push(i);
    const f = frames[i], b = NEON_BRANDS[[0, 2, 5, 1][n % 4]];
    [-1, 1].forEach(sg => {
      const p = wp(f, sg * hw, -0.05);
      poles.push({ p: V3(p.x, p.y + 6.6, p.z), q: yawQuat(f), s: V3(0.5, 13.2, 0.5) });
      const c = wp(f, sg * 4.6, 12.0); cables.push({ p: c, q: frameQuat(f), s: V3(0.06, 2.0, 0.06) });
    });
    beams.push({ p: wp(f, 0, 13.0), q: frameQuat(f), s: V3(hw * 2 + 0.6, 0.6, 0.6) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), new THREE.MeshBasicMaterial({ map: makeNeonSignTexture(b), side: THREE.DoubleSide }));
    sign.position.copy(wp(f, 0, 9.4)); sign.quaternion.copy(frameQuat(f).multiply(rotB));
    scene.add(sign);
    [-5.5, 5.5].forEach(o => { const p = wp(f, o, 12.6); glow.push(p.x, p.y, p.z); });
    n++;
  });
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x1a1f33, emissive: 0x080a14 }), poles.concat(beams, cables));
  glowPoints(glow, 6, 0xff2bd6, 0.8);
}

// ─── Die Stadt: Hochhäuser, Reklamen, Boden ──────────────────────────────────
let cityGrid = null;
function buildCityGrid() {                       // grobes Raster über alle Streckenpunkte -> schnelle Abstandsabfragen
  const cs = 12, map = new Map();
  for (let i = 0; i < N; i++) {
    const p = frames[i].P, k = (Math.floor(p.x / cs) + 2048) * 4096 + (Math.floor(p.z / cs) + 2048);
    let a = map.get(k); if (!a) map.set(k, a = []);
    a.push(i);
  }
  cityGrid = { cs, map };
}
function cityNearest(x, z, R) {                  // nächster Streckenpunkt innerhalb R (XZ) oder i = -1
  const cs = cityGrid.cs, r = Math.ceil(R / cs), cx = Math.floor(x / cs), cz = Math.floor(z / cs);
  let bd = R * R, bi = -1;
  for (let ix = cx - r; ix <= cx + r; ix++) for (let iz = cz - r; iz <= cz + r; iz++) {
    const lst = cityGrid.map.get((ix + 2048) * 4096 + (iz + 2048));
    if (!lst) continue;
    for (let k = 0; k < lst.length; k++) {
      const p = frames[lst[k]].P, dx = p.x - x, dz = p.z - z, d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; bi = lst[k]; }
    }
  }
  return { d: bi < 0 ? Infinity : Math.sqrt(bd), i: bi };
}
function cityExtra(i, sg) {                      // zusätzlicher Abstand: Boxengasse/Garagen, Tribüne, Tunnel-Gehäuse
  let e = 0;
  if (sg > 0 && Math.abs(wrapIdx(i)) < Math.round(52 / DS)) e = 3.5;
  standSpots.forEach(s => { if (sg < 0 && Math.abs(wrapIdx(i - s.c)) < s.half + Math.round(14 / DS)) e = Math.max(e, 6); });
  if (Math.abs(wrapIdx(i - tunnelR.c)) < tunnelR.h + Math.round(16 / DS)) e = Math.max(e, 4);
  return e;
}
function obbOverlap(a, b, gap) {                 // Überlappung zweier orientierter Rechtecke (SAT) inkl. Abstand
  const dx = b.x - a.x, dz = b.z - a.z, axes = [a.u, a.v, b.u, b.v];
  for (let k = 0; k < 4; k++) {
    const ax = axes[k];
    const ra = a.hw * Math.abs(a.u[0] * ax[0] + a.u[1] * ax[1]) + a.hd * Math.abs(a.v[0] * ax[0] + a.v[1] * ax[1]);
    const rb = b.hw * Math.abs(b.u[0] * ax[0] + b.u[1] * ax[1]) + b.hd * Math.abs(b.v[0] * ax[0] + b.v[1] * ax[1]);
    if (Math.abs(dx * ax[0] + dz * ax[1]) > ra + rb + gap) return false;
  }
  return true;
}

function createCityScenery() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ map: makeCityGroundTexture(), emissive: 0x0a0b16 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y; ground.receiveShadow = true;
  scene.add(ground);
  createStars();
  createCityTowers();
}

function createCityTowers() {
  buildCityGrid();
  const rn = mulberry32(5150), list = [], boxes = [];
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), Y = V3(0, 1, 0);

  // Platzierung: Rechteck (5×5-Raster) muss genug Abstand zur Strecke haben und darf kein anderes Haus berühren
  const place = (x, z, th, w, d, h, margin, far, near) => {
    const c = Math.cos(th), s = Math.sin(th);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const lx = a * w / 4, lz = b * d / 4, px = x + c * lx + s * lz, pz = z - s * lx + c * lz;
      const nr = cityNearest(px, pz, 44);
      if (nr.i < 0) continue;
      const f = frames[nr.i], sg = ((px - f.P.x) * f.Lh.x + (pz - f.P.z) * f.Lh.z) >= 0 ? 1 : -1;
      if (nr.d < HALF_W + margin + (far ? 0 : cityExtra(nr.i, sg)) + 0.55 * Math.max(0, f.P.y)) return false;
    }
    const box = { x, z, u: [c, -s], v: [s, c], hw: w / 2, hd: d / 2, r: Math.hypot(w, d) / 2 };
    for (let k = 0; k < boxes.length; k++) {
      const o = boxes[k];
      if (Math.hypot(o.x - x, o.z - z) > o.r + box.r + 4) continue;
      if (obbOverlap(o, box, 3)) return false;
    }
    boxes.push(box);
    const nr = cityNearest(x, z, 90), f = nr.i >= 0 ? frames[nr.i] : null;
    const dx = f ? f.P.x - x : 0, dz = f ? f.P.z - z : 0;
    list.push({ x, z, th, w, d, h, v: (rn() * 3) | 0, o: rn(), o2: rn(), near,
      ldx: dx * c - dz * s, ldz: dx * s + dz * c, tdx: dx, tdz: dz, hasT: !!f });
    return true;
  };

  // 1) Strassenschluchten direkt an der Strecke
  for (let t = 0; t < 4200 && list.length < SCENE.TOWERS; t++) {
    const i = (rn() * N) | 0, f = frames[i], sg = rn() < 0.5 ? -1 : 1;
    const w = 13 + rn() * 15, d = 15 + rn() * 20, h = 26 + Math.pow(rn(), 1.7) * 72;
    const lat = HALF_W + 8.5 + cityExtra(i, sg) + 0.55 * Math.max(0, f.P.y) + d / 2 + rn() * 8;
    place(f.P.x + f.Lh.x * sg * lat, f.P.z + f.Lh.z * sg * lat, Math.atan2(-f.Th.z, f.Th.x), w, d, h, 8.5, false, true);
  }
  // 2) Füllung dahinter: höhere, grössere Blöcke
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  frames.forEach(f => { x0 = Math.min(x0, f.P.x); x1 = Math.max(x1, f.P.x); z0 = Math.min(z0, f.P.z); z1 = Math.max(z1, f.P.z); });
  const target = SCENE.TOWERS + SCENE.FAR_TOWERS;
  for (let t = 0; t < 5000 && list.length < target; t++) {
    const x = x0 - 170 + rn() * (x1 - x0 + 340), z = z0 - 170 + rn() * (z1 - z0 + 340);
    const nr = cityNearest(x, z, 70), th = nr.i >= 0 ? Math.atan2(-frames[nr.i].Th.z, frames[nr.i].Th.x) : Math.floor(rn() * 4) * Math.PI / 2;
    place(x, z, th, 16 + rn() * 18, 16 + rn() * 18, 40 + Math.pow(rn(), 1.4) * 70, 14, true, false);
  }

  // Fassaden: drei Farbpaletten = drei Draw-Calls (merged)
  const geos = [[], [], []];
  list.forEach(b => {
    const gb = new THREE.BoxGeometry(b.w, b.h, b.d);
    const uv = gb.attributes.uv, nr = gb.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(nr.getY(i)) > 0.5) uv.setXY(i, 0.01, 0.01);
      else uv.setXY(i, uv.getX(i) * (Math.abs(nr.getX(i)) > 0.5 ? b.d : b.w) / 16 + b.o, uv.getY(i) * b.h / 24 + b.o2);
    }
    gb.rotateY(b.th); gb.translate(b.x, GROUND_Y + b.h / 2, b.z);
    geos[b.v].push(gb);
  });
  geos.forEach((gl, v) => {
    if (!gl.length) return;
    const fac = makeNeonFacadeTextures(v);
    const m = lambert(0xffffff, { map: fac.map, emissive: 0xffffff, emissiveMap: fac.emi });
    m.onBeforeCompile = facadeShader;
    addMesh(mergeGeos(gl), m);
  });

  // Dach-Details: Leuchtkante, Klimakästen, Antennen mit rot blinkenden Warnlichtern, vertikale Neon-Kanten
  const roof = [], ac = [], ant = [], accent = [], blink = [];
  const palC = [new THREE.Color(NEON_HEX[0]), new THREE.Color(NEON_HEX[1]), new THREE.Color(NEON_HEX[3])];
  list.forEach(b => {
    const c = Math.cos(b.th), s = Math.sin(b.th), q = new THREE.Quaternion().setFromAxisAngle(Y, b.th), top = GROUND_Y + b.h;
    const loc = (lx, lz) => [b.x + c * lx + s * lz, b.z - s * lx + c * lz];
    roof.push({ p: V3(b.x, top + 0.2, b.z), q, s: V3(b.w + 0.5, 0.4, b.d + 0.5), c: palC[b.v] });
    [[-0.25, 0.2, 2.4, 1.4, 3.0], [0.2, -0.2, 1.6, 0.9, 1.8]].forEach(a => {
      const p = loc(b.w * a[0], b.d * a[1]); ac.push({ p: V3(p[0], top + a[3] / 2 + 0.3, p[1]), q, s: V3(a[2], a[3], a[4]) });
    });
    if (b.h > 38 && rn() < 0.55) {
      const p = loc((rn() - 0.5) * b.w * 0.5, (rn() - 0.5) * b.d * 0.5), ha = 6 + rn() * 14;
      ant.push({ p: V3(p[0], top + ha / 2 + 0.4, p[1]), s: V3(1, ha, 1) });
      blink.push(p[0], top + ha + 0.8, p[1]);
    }
    if (rn() < 0.32) {                                           // Neon-Kante an der Strassenseite
      const sx = b.hasT ? Math.sign(b.ldx) || 1 : 1, sz = b.hasT ? Math.sign(b.ldz) || 1 : 1;
      const p = loc(sx * b.w / 2, sz * b.d / 2);
      accent.push({ p: V3(p[0], GROUND_Y + b.h * 0.47, p[1]), s: V3(0.35, b.h * 0.94, 0.35), c: palC[(b.v + 1) % 3] });
    }
  });
  const em = new THREE.MeshBasicMaterial({ color: 0xffffff }); em.onBeforeCompile = neonShader('pulse');
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), em, roof);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), accent);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x1d2236 }), ac);
  makeInstanced(new THREE.CylinderGeometry(0.1, 0.17, 1, 5), new THREE.MeshLambertMaterial({ color: 0x2a3050 }), ant);
  blinkPoints(blink, 6, 0xff2a3a);

  // Reklamen
  createCitySigns(list, rn);
}

function createCitySigns(list, rn) {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const wall = NEON_BRANDS.map(() => []), holoPosts = [];
  const wallBrands = [0, 1, 2, 3, 5, 7, 8, 0, 2, 5];
  const near = list.filter(b => b.near && b.hasT && b.h >= 30);
  // Wandreklamen an der Strassenseite
  let placed = 0;
  for (let t = 0; t < near.length * 3 && placed < SCENE.SIGNS; t++) {
    const b = near[(rn() * near.length) | 0], bi = wallBrands[(rn() * wallBrands.length) | 0], br = NEON_BRANDS[bi];
    const xFace = Math.abs(b.ldx) * b.d > Math.abs(b.ldz) * b.w;           // Wand mit dem Blick zur Strasse
    const len = xFace ? b.d : b.w;
    const sw = br.vertical ? 3.2 : (len > 22 ? 12 : 8.5), sh = br.vertical ? 12.8 : sw / 2;
    if (len < sw + 3 || b.h < sh + 12) continue;
    const off = (rn() - 0.5) * (len - sw - 2), yc = 6 + sh / 2 + rn() * (b.h - sh - 10);
    const c = Math.cos(b.th), s = Math.sin(b.th);
    let lx, lz, nx, nz;
    if (xFace) { const sg = Math.sign(b.ldx) || 1; lx = sg * (b.w / 2 + 0.12); lz = off; nx = sg * c; nz = -sg * s; }
    else { const sg = Math.sign(b.ldz) || 1; lx = off; lz = sg * (b.d / 2 + 0.12); nx = sg * s; nz = sg * c; }
    wall[bi].push({ p: V3(b.x + c * lx + s * lz, GROUND_Y + yc, b.z - s * lx + c * lz),
      q: new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.atan2(nx, nz)), s: V3(sw, sh, 1) });
    placed++;
  }
  // Hologramm-Billboards auf hohen Dächern (additiv, Blick zur Strecke)
  const holo = NEON_BRANDS.map(() => []);
  const tall = near.filter(b => b.h > 55);
  for (let k = 0; k < Math.min(10, tall.length); k++) {
    const b = tall[(rn() * tall.length) | 0], bi = k % 2 ? 4 : 6, top = GROUND_Y + b.h, ang = Math.atan2(b.tdx, b.tdz);
    holo[bi].push({ p: V3(b.x, top + 5.5 + 5.5, b.z), q: new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), ang), s: V3(22, 11, 1) });
    holoPosts.push({ p: V3(b.x, top + 3.0, b.z), s: V3(0.5, 6, 0.5) });
  }
  NEON_BRANDS.forEach((br, i) => {
    const items = br.style === 'holo' ? holo[i] : wall[i];
    if (!items.length) return;
    const m = new THREE.MeshBasicMaterial(br.style === 'holo'
      ? { map: makeNeonSignTexture(br), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.9 }
      : { map: makeNeonSignTexture(br), side: THREE.DoubleSide });
    m.onBeforeCompile = neonShader(br.style === 'holo' ? 'pulse' : 'flick');
    makeInstanced(new THREE.PlaneGeometry(1, 1), m, items);
  });
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x1d2236 }), holoPosts);
}

// ─── Lebendige Stadt: Flugautos, Zeppelin, Regen, Dampf ──────────────────────
const cityLife = { dTotal: 0, dCount: 0, list: [], dBody: null, dLights: null, dHalo: null, rain: null, rainN: 0, steam: null, zep: null, zepA: 0, strobe: null };
const rainUni = { uTime: crowdUni.time, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0.3 } };
const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _dp = new THREE.Vector3(), _dY = new THREE.Vector3(0, 1, 0), _ds = new THREE.Vector3(1, 1, 1);

function createCityLife() {
  const L = cityLife, rn = mulberry32(777);
  // Flugautos: 3 InstancedMeshes (Karosserie, Lichter, Rücklicht-Glühen); ein Teil fliegt im Strassenkorridor, der Rest kreist über der Stadt
  const n = SCENE.DRONES;
  if (n > 0) {
    const bodyG = mergeColoredBoxes([
      { w: 1.3, h: 0.45, d: 3.0, c: 0x23284a }, { w: 0.9, h: 0.4, d: 1.2, y: 0.38, z: -0.2, c: 0x39406a },
      { w: 2.5, h: 0.1, d: 0.8, y: -0.05, z: -0.4, c: 0x1a1d36 }
    ]);
    const lightG = mergeColoredBoxes([
      { x: -0.5, y: 0.05, z: -1.52, w: 0.3, h: 0.14, d: 0.08, c: 0xff2030 }, { x: 0.5, y: 0.05, z: -1.52, w: 0.3, h: 0.14, d: 0.08, c: 0xff2030 },
      { x: -0.45, y: 0.02, z: 1.52, w: 0.25, h: 0.12, d: 0.08, c: 0xdff8ff }, { x: 0.45, y: 0.02, z: 1.52, w: 0.25, h: 0.12, d: 0.08, c: 0xdff8ff },
      { y: -0.3, w: 0.9, h: 0.05, d: 2.0, c: 0x18e6ff }
    ]);
    const haloG = mergeColoredBoxes([{ x: -0.5, y: 0.05, z: -1.9, w: 0.9, h: 0.6, d: 0.9, c: 0xff1830 }, { x: 0.5, y: 0.05, z: -1.9, w: 0.9, h: 0.6, d: 0.9, c: 0xff1830 }]);
    L.dBody = new THREE.InstancedMesh(bodyG, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x10142a }), n);
    L.dLights = new THREE.InstancedMesh(lightG, new THREE.MeshBasicMaterial({ vertexColors: true }), n);
    L.dHalo = new THREE.InstancedMesh(haloG, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }), n);
    [L.dBody, L.dLights, L.dHalo].forEach(m => { m.frustumCulled = false; scene.add(m); });
    L.dTotal = n;
    const nTrack = Math.round(n * 0.4);
    for (let i = 0; i < n; i++) {
      if (i < nTrack) L.list.push({ kind: 0, s: rn() * N, dir: i % 2 ? 1 : -1, v: 20 + rn() * 16, lat: (rn() - 0.5) * 14, up: 20 + rn() * 18, ph: rn() * 6.28 });
      else L.list.push({ kind: 1, cx: -25 + (rn() - 0.5) * 60, cz: 55 + (rn() - 0.5) * 60, rx: 130 + rn() * 150, rz: 90 + rn() * 90,
        y: 62 + rn() * 70, a: rn() * 6.28, w: (rn() < 0.5 ? 1 : -1) * (0.05 + rn() * 0.05), ph: rn() * 6.28 });
    }
    L.dCount = n;
  }
  // Zeppelin mit Werbebanner
  if (SCENE.ZEPPELIN) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshLambertMaterial({ color: 0x2b3050, emissive: 0x151a34 }));
    body.scale.set(34, 8.5, 8.5); g.add(body);
    const bt = makeCityBannerTexture('NOVA-COLA', '#ff3a6a', '#ffd0dc', 'ICE COLD NEON');
    [1, -1].forEach(sg => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(34, 8.5), new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide }));
      p.position.set(0, 0, sg * 8.0); if (sg < 0) p.rotation.y = Math.PI; g.add(p);
    });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1d2140 });
    [[-30, 3, 0, 0.5, 9, 7], [-30, 0, 0, 0.5, 2, 15], [4, -9, 0, 7, 2, 3.4]].forEach(a => { const f = new THREE.Mesh(new THREE.BoxGeometry(a[3], a[4], a[5]), dark); f.position.set(a[0], a[1], a[2]); g.add(f); });
    const spr = (x, y, z, col, sz) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: col, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.set(sz, sz, 1); s.position.set(x, y, z); g.add(s); return s;
    };
    spr(4, -8.4, 3.2, 0xff2030, 5); spr(4, -8.4, -3.2, 0x30ff60, 5); L.strobe = spr(-33, 6, 0, 0xffffff, 9);
    scene.add(g); L.zep = g;
  }
  // Regen: Linienstücke in einem Quader um die Kamera, per Shader animiert (ein Draw-Call)
  if (SCENE.RAIN > 0) {
    const nR = SCENE.RAIN, pos = new Float32Array(nR * 6), end = new Float32Array(nR * 2), r2 = mulberry32(4242);
    for (let i = 0; i < nR; i++) {
      const x = (r2() - 0.5) * 60, y = r2() * 36, z = (r2() - 0.5) * 60;
      pos.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: rainUni,
      vertexShader: 'uniform float uTime; uniform vec3 uCam; attribute float aEnd; varying float vA;\n' +
        'void main(){ vec3 p = position;\n' +
        ' p.y = mod(position.y - uTime * 24.0, 36.0) + uCam.y - 10.0;\n' +
        ' p.x = mod(position.x - uCam.x + 30.0, 60.0) - 30.0 + uCam.x;\n' +
        ' p.z = mod(position.z - uCam.z + 30.0, 60.0) - 30.0 + uCam.z;\n' +
        ' p.y -= aEnd * 0.9; p.x += aEnd * 0.06;\n' +
        ' vec4 mv = modelViewMatrix * vec4(p, 1.0);\n' +
        ' vA = clamp(length(mv.xyz) / 7.0, 0.0, 1.0) * (1.0 - aEnd * 0.6);\n' +
        ' gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uAlpha; varying float vA;\nvoid main(){ gl_FragColor = vec4(0.62, 0.78, 1.0, vA * uAlpha); }'
    });
    const ls = new THREE.LineSegments(g, m); ls.frustumCulled = false; ls.renderOrder = 5;
    scene.add(ls); L.rain = ls; L.rainN = nR;
  }
  // Dampf aus Gullydeckeln: Rauch-Puffs per Shader, 3 Puffs pro Schacht
  if (SCENE.STEAM > 0) {
    const pos = [], ph = [], cover = [], r3 = mulberry32(909);
    for (let t = 0, k = 0; t < 400 && k < SCENE.STEAM; t++) {
      const i = (r3() * N) | 0, f = frames[i];
      if (!trackFree(i, 14) || Math.abs(f.kappa) > 0.012) continue;
      const sg = r3() < 0.5 ? -1 : 1;
      if (sg < 0 && standSpots.some(s => Math.abs(wrapIdx(i - s.c)) < s.half + 10)) continue;
      if (sg > 0 && Math.abs(wrapIdx(i)) < 70) continue;
      const p = wp(f, sg * (HALF_W + 2.3), 0.05);
      cover.push({ p: new THREE.Vector3(p.x, p.y + 0.02, p.z) });
      for (let q = 0; q < 3; q++) { pos.push(p.x, p.y, p.z); ph.push(q / 3 + k * 0.137); }
      k++;
    }
    makeInstanced(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 10), new THREE.MeshLambertMaterial({ color: 0x202538 }), cover);
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1));
      const m = new THREE.PointsMaterial({ size: 4.5, map: makeSmokeTexture(), color: 0xe0c4ff, transparent: true, opacity: 0.5, depthWrite: false });
      m.onBeforeCompile = sh => {
        sh.uniforms.uTime = crowdUni.time;
        sh.vertexShader = 'attribute float aPh;\nuniform float uTime;\nvarying float vSt;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nfloat tt = fract(uTime * 0.18 + aPh);\ntransformed.y += tt * 5.5;\ntransformed.x += sin(uTime * 0.7 + aPh * 20.0) * tt * 0.9;\nvSt = (1.0 - tt) * smoothstep(0.0, 0.12, tt);');
        sh.fragmentShader = 'varying float vSt;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vSt;');
      };
      const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); L.steam = p;
    }
  }
  createCityPlaza();
  updateCityLife(0);
}

// Plaza im Innenraum der engsten Kurve (Haarnadel): Podest, Neon-Ringe, Leucht-Obelisk, drehendes Hologramm-Kreuz
function createCityPlaza() {
  let bi = 0;
  for (let i = 0; i < N; i++) if (Math.abs(frames[i].kappa) > Math.abs(frames[bi].kappa)) bi = i;
  const f = frames[bi], k = f.kappa, Rc = 1 / Math.abs(k), Rf = Rc - HALF_W - 4.6;
  if (Rf < 3) return;
  const cx = f.P.x + f.Lh.x * (1 / k), cz = f.P.z + f.Lh.z * (1 / k), y0 = f.P.y;
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(Rf, Rf, 0.6, 28), new THREE.MeshLambertMaterial({ color: 0x22273f, emissive: 0x0a0c18 }));
  plat.position.set(cx, y0 + 0.2, cz); scene.add(plat);
  [[Rf * 0.82, 0x18e6ff], [Rf * 0.5, 0xff2bd6]].forEach(r => {
    const g = new THREE.TorusGeometry(r[0], 0.12, 6, 40); g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: r[1] })); m.position.set(cx, y0 + 0.55, cz); scene.add(m);
  });
  const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 18, 4), new THREE.MeshLambertMaterial({ color: 0x1a1f33, emissive: 0x0a0c18 }));
  ob.position.set(cx, y0 + 9.3, cz); ob.rotation.y = Math.PI / 4; scene.add(ob);
  const wf = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 1.14, 18.2, 4), new THREE.MeshBasicMaterial({ color: 0xff2bd6, wireframe: true }));
  wf.position.copy(ob.position); wf.rotation.y = Math.PI / 4; scene.add(wf);
  const holo = new THREE.Group(); holo.position.set(cx, y0 + 24, cz);
  const hm = new THREE.MeshBasicMaterial({ map: makeNeonSignTexture(NEON_BRANDS[6]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.95 });
  [0, Math.PI / 2].forEach(a => { const pl = new THREE.Mesh(new THREE.PlaneGeometry(15, 7.5), hm); pl.rotation.y = a; holo.add(pl); });
  scene.add(holo); cityLife.holo = holo;
  glowPoints([cx, y0 + 19.5, cz], 12, 0xff2bd6, 0.9);
}

function applyCityQuality(q) {
  const L = cityLife;
  if (L.rain) { L.rain.visible = q >= 1; L.rain.geometry.setDrawRange(0, (q >= 2 ? L.rainN : L.rainN >> 1) * 2); }
  L.dCount = q >= 2 ? L.dTotal : q >= 1 ? L.dTotal >> 1 : 0;
  [L.dBody, L.dLights, L.dHalo].forEach(m => { if (m) { m.count = L.dCount; m.visible = L.dCount > 0; } });
  if (L.zep) L.zep.visible = q >= 1;
  if (L.steam) L.steam.visible = q >= 1;
}

function updateCityLife(dt) {
  const L = cityLife;
  if (L.dBody && L.dCount > 0) {
    for (let i = 0; i < L.dCount; i++) {
      const d = L.list[i];
      let hx, hz;
      if (d.kind === 0) {                                                 // im Strassenkorridor entlang der Strecke
        d.s = (d.s + d.dir * d.v * dt / DS + N) % N;
        const i0 = Math.floor(d.s), f0 = frames[i0 % N], f1 = frames[(i0 + 1) % N], t = d.s - i0;
        _dp.set(f0.P.x + (f1.P.x - f0.P.x) * t, f0.P.y + (f1.P.y - f0.P.y) * t, f0.P.z + (f1.P.z - f0.P.z) * t);
        _dp.addScaledVector(f0.Lh, d.lat); _dp.y += d.up + Math.sin(fxClock * 0.8 + d.ph) * 0.6;
        hx = f0.Th.x * d.dir; hz = f0.Th.z * d.dir;
      } else {                                                            // feste Bahn (Ellipse) über der Stadt
        d.a += d.w * dt;
        _dp.set(d.cx + Math.cos(d.a) * d.rx, d.y + Math.sin(fxClock * 0.5 + d.ph) * 1.2, d.cz + Math.sin(d.a) * d.rz);
        const sgn = Math.sign(d.w);
        hx = -Math.sin(d.a) * d.rx * sgn; hz = Math.cos(d.a) * d.rz * sgn;
      }
      _dq.setFromAxisAngle(_dY, Math.atan2(hx, hz));
      _dm.compose(_dp, _dq, _ds);
      L.dBody.setMatrixAt(i, _dm); L.dLights.setMatrixAt(i, _dm); L.dHalo.setMatrixAt(i, _dm);
    }
    L.dBody.instanceMatrix.needsUpdate = L.dLights.instanceMatrix.needsUpdate = L.dHalo.instanceMatrix.needsUpdate = true;
  }
  if (L.zep) {
    L.zepA += 0.02 * dt;
    const a = L.zepA + 1.2, R = 190;
    L.zep.position.set(-25 + Math.cos(a) * R, 120 + Math.sin(fxClock * 0.3) * 2, 56 + Math.sin(a) * R);
    L.zep.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));              // lokale x-Achse zeigt in Flugrichtung
    if (L.strobe) L.strobe.material.opacity = (fxClock * 0.8) % 1 < 0.15 ? 1 : 0.08;
  }
  if (L.holo) L.holo.rotation.y += 0.35 * dt;
  if (L.rain) rainUni.uCam.value.copy(camera.position);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BERGPASS – alles, was nur bei THEME.alpine läuft
// ═══════════════════════════════════════════════════════════════════════════════
const ALP = { N: 200, CS: 5, X0: -470, Z0: -520, SEA: 2, CX: 30, CZ: -20 };   // Raster 200 x 200 Zellen à 5 m (1000 x 1000 m)
let alpH = null, alpD = null;            // Höhenfeld und Abstand zur Strecke, je (N+1)² Werte
const ALP_SPONSORS = [
  { name: 'EDELWEISS-QUELLE',       a: '#f4f1e6', b: '#9aa88a', fg: '#1d3a22' },
  { name: 'GIPFELSTURM',            a: '#2f7fd8', b: '#0f3a78', fg: '#ffffff' },
  { name: 'ALPENBLITZ',             a: '#ffc21a', b: '#8a5a00', fg: '#1a1200' },
  { name: 'KAISERSCHMARRN-EXPRESS', a: '#d8452b', b: '#6a1a0e', fg: '#fff4e0' },
  { name: 'ALMDUDLER-BERG',         a: '#6ab04c', b: '#255a1a', fg: '#ffffff' },
  { name: 'SENNEREI HOCHGRAT',      a: '#e9e2d0', b: '#7a6a4a', fg: '#2a1c0c' }
];

// Höhe des Geländes (Dreiecks-Interpolation passend zum Mesh, Diagonale b–c)
function alpineHeightAt(x, z) {
  const nv = ALP.N + 1, eps = 1e-6;
  const u = clamp((x - ALP.X0) / ALP.CS, 0, ALP.N - eps), v = clamp((z - ALP.Z0) / ALP.CS, 0, ALP.N - eps);
  const ix = Math.floor(u), iz = Math.floor(v), fu = u - ix, fv = v - iz, H = alpH;
  const a = H[iz * nv + ix], b = H[iz * nv + ix + 1], c = H[(iz + 1) * nv + ix], d = H[(iz + 1) * nv + ix + 1];
  return fu + fv <= 1 ? a + fu * (b - a) + fv * (c - a) : d + (1 - fu) * (c - d) + (1 - fv) * (b - d);
}
function alpineDistAt(x, z) {            // Abstand zur nächsten Streckenmitte (grob, Raster-Näherung)
  const nv = ALP.N + 1, eps = 1e-6;
  const u = clamp((x - ALP.X0) / ALP.CS, 0, ALP.N - eps), v = clamp((z - ALP.Z0) / ALP.CS, 0, ALP.N - eps);
  const ix = Math.floor(u), iz = Math.floor(v), fu = u - ix, fv = v - iz, D = alpD;
  const a = D[iz * nv + ix], b = D[iz * nv + ix + 1], c = D[(iz + 1) * nv + ix], d = D[(iz + 1) * nv + ix + 1];
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}
function alpineSlopeAt(x, z) {           // Steigung (Höhe pro Meter)
  const e = 2.5;
  const gx = (alpineHeightAt(x + e, z) - alpineHeightAt(x - e, z)) / (2 * e);
  const gz = (alpineHeightAt(x, z + e) - alpineHeightAt(x, z - e)) / (2 * e);
  return Math.sqrt(gx * gx + gz * gz);
}

// Natürliche Landschaft ohne Strasse: Bergflanke im Norden/Nordosten, Gipfel dahinter, Westgrat, Tal im Süden
function alpineNatural(x, z) {
  let h = 52 - 0.32 * (z + 132);                                    // Flanke: Strassenniveau + ca. 8 m an der Passhöhe
  const dn = Math.max(0, -132 - z);                                 // Abstand nördlich der Passhöhe
  h += 0.38 * dn + 0.0007 * dn * dn;                                // hinter der Passhöhe steil zu den Gipfeln
  h -= 0.9 * Math.max(0, x - 205 - 60 * (fbm(z * 0.012 + 2, 5) - 0.5)) * smooth01(-230, -110, z);        // Osthang fällt ins Tal (Aussenseite der Kehren)
  // Westgrat (Felstunnel): steigt nach Westen an, fällt zur Talmulde im Osten ab
  const wz = smooth01(-110, 0, z + 30 * (fbm(x * 0.01, 9) - 0.5)) * (1 - smooth01(110, 230, z + 40 * (fbm(x * 0.01, 4) - 0.5)));
  const ridge = (x < -145 ? Math.min(40 + 0.5 * (-145 - x), 112) * (1 - smooth01(-330, -450, x)) : 40 - 0.9 * (x + 145));
  h = Math.max(h, -30 + (ridge + 30) * wz);
  // Nord-Süd-Sporn unter dem Viadukt: bildet die Schlucht (Wände links und rechts der Unterführung)
  const sz = smooth01(-90, -45, z) * (1 - smooth01(115, 160, z));
  h = Math.max(h, -30 + (66 - 0.05 * z) * Math.exp(-(x * x) / (46 * 46)) * sz);
  // Gipfel
  const pk = (cx, cz, r, hh) => hh * Math.max(0, 1 - Math.hypot(x - cx, z - cz) / r);
  h += pk(60, -330, 150, 70) + pk(-130, -300, 130, 60) + pk(250, -270, 130, 50) + pk(-300, -60, 150, 50) + pk(-240, 130, 120, 36);
  // Felsiges Relief: gröber in der Höhe, ruhiger in Strassennähe (dort ordnen es die Böschungen)
  const up = smooth01(30, 90, h);
  h += (fbm(x * 0.011 + 3.1, z * 0.011 - 1.7) - 0.5) * (14 + 50 * up);
  h += (fbm(x * 0.045 + 9.0, z * 0.045 + 4.0) - 0.5) * (3 + 7 * up);
  h = Math.max(h, -22 + (fbm(x * 0.02, z * 0.02) - 0.5) * 8);       // Talsohle unter dem Wolkenmeer
  const rim = smooth01(330, 450, Math.max(Math.abs(x - ALP.CX), Math.abs(z - ALP.CZ)));
  return h > 28 ? h + (28 - h) * rim : h;                            // hohe Lagen zum Rand hin absenken, damit die Gipfel-Ebenen dahinter sichtbar bleiben
}

// Höhenfeld berechnen: Gelände = min(Decke, max(Stütze, Natur)).
// Decke (U) = Kegel über allen Strassenpunkten (Gelände nie in die Fahrbahn), Stütze (F) = Böschungskegel unter der Strasse.
function buildAlpineTerrainData() {
  const NV = ALP.N + 1, CS = ALP.CS, X0 = ALP.X0, Z0 = ALP.Z0, SU = 1.15, SD = 0.85;
  const startR = Math.round(62 / DS);
  const base = new Float32Array(N), ceil = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const f = frames[i], st = Math.abs(wrapIdx(i)) <= startR;
    base[i] = f.P.y - 11 * Math.abs(Math.sin(f.bank)) - (st ? 0.9 : 1.0);
  }
  for (let i = 0; i < N; i++) { let m = Infinity; for (let k = -8; k <= 8; k++) m = Math.min(m, base[mod(i + k)]); ceil[i] = m; }

  const INF = 1e9, U = new Float32Array(NV * NV).fill(INF), F = new Float32Array(NV * NV).fill(-INF), D = new Float32Array(NV * NV).fill(INF);
  const gx = v => (v - X0) / CS, gz = v => (v - Z0) / CS;
  for (let i = 0; i < N; i += 2) {
    const p = frames[i].P, st = Math.abs(wrapIdx(i)) <= startR, c = ceil[i];
    const w0u = st ? 28 : 14.5, w0f = st ? 24 : 11, isBr = inBridge(i);
    const R = 100, ix0 = Math.max(0, Math.floor(gx(p.x - R))), ix1 = Math.min(NV - 1, Math.ceil(gx(p.x + R)));
    const iz0 = Math.max(0, Math.floor(gz(p.z - R))), iz1 = Math.min(NV - 1, Math.ceil(gz(p.z + R)));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const dx = X0 + ix * CS - p.x, dz = Z0 + iz * CS - p.z, d = Math.sqrt(dx * dx + dz * dz), k = iz * NV + ix;
      if (d < D[k]) D[k] = d;
      if (d <= 60) { const u = c + SU * Math.max(0, d - w0u); if (u < U[k]) U[k] = u; }
      if (!isBr) { const fv = c - SD * Math.max(0, d - w0f); if (fv > F[k]) F[k] = fv; }
    }
  }
  // Kegel über das Raster ausbreiten (Chamfer-Distanz, zweimal vor und zurück)
  const r2 = Math.SQRT2;
  const relax = (k, kn, w) => {
    const u = U[kn] + SU * w; if (u < U[k]) U[k] = u;
    const fv = F[kn] - SD * w; if (fv > F[k]) F[k] = fv;
    const d = D[kn] + w; if (d < D[k]) D[k] = d;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let iz = 0; iz < NV; iz++) for (let ix = 0; ix < NV; ix++) {
      const k = iz * NV + ix;
      if (ix > 0) relax(k, k - 1, CS);
      if (iz > 0) { relax(k, k - NV, CS); if (ix > 0) relax(k, k - NV - 1, CS * r2); if (ix < NV - 1) relax(k, k - NV + 1, CS * r2); }
    }
    for (let iz = NV - 1; iz >= 0; iz--) for (let ix = NV - 1; ix >= 0; ix--) {
      const k = iz * NV + ix;
      if (ix < NV - 1) relax(k, k + 1, CS);
      if (iz < NV - 1) { relax(k, k + NV, CS); if (ix < NV - 1) relax(k, k + NV + 1, CS * r2); if (ix > 0) relax(k, k + NV - 1, CS * r2); }
    }
  }
  const H = new Float32Array(NV * NV);
  for (let iz = 0; iz < NV; iz++) for (let ix = 0; ix < NV; ix++) {
    const k = iz * NV + ix, x = X0 + ix * CS, z = Z0 + iz * CS;
    let h = alpineNatural(x, z);
    h = Math.max(F[k], h);                                                  // nie unter die Böschung unter der Strasse
    const rough = (fbm(x * 0.09 + 5, z * 0.09 + 11) - 0.5) * 7 * smooth01(18, 45, D[k]);
    H[k] = Math.min(U[k], h + rough);                                       // nie über die Decke (Fahrbahn bleibt frei)
  }
  alpH = H; alpD = D;
  // Reparatur: zwischen den Rasterpunkten darf die Dreiecksfläche nirgends näher als 0,65 an die Fahrbahn
  const nv = NV;
  for (let i = 0; i < N; i++) {
    const f = frames[i];
    for (let l = -11; l <= 11; l += 1) {
      const wx = f.P.x + f.Lat.x * l, wz = f.P.z + f.Lat.z * l, ry = f.P.y + f.Lat.y * l - 0.7;
      const g = alpineHeightAt(wx, wz);
      if (g <= ry) continue;
      const u = clamp((wx - X0) / CS, 0, ALP.N - 1e-6), v = clamp((wz - Z0) / CS, 0, ALP.N - 1e-6);
      const ix = Math.floor(u), iz = Math.floor(v), ex = g - ry + 0.05;
      [iz * nv + ix, iz * nv + ix + 1, (iz + 1) * nv + ix, (iz + 1) * nv + ix + 1].forEach(k => { H[k] -= ex; });
    }
  }
  // Der Reparaturdurchlauf kann Nachbarpunkte nur senken – zur Sicherheit noch einmal prüfen
  for (let i = 0; i < N; i += 1) {
    const f = frames[i];
    for (let l = -10.5; l <= 10.5; l += 1.5) {
      const g = alpineHeightAt(f.P.x + f.Lat.x * l, f.P.z + f.Lat.z * l);
      if (g > f.P.y + f.Lat.y * l - 0.6) { alpH = null; throw new Error('Gelände durchstößt die Fahrbahn bei ' + i); }
    }
  }
}


// ─── Texturen (prozedural, ≤ 512²) ──────────────────────────────────────────────
function makeAlpineRoadTexture() {                // sauberer, leicht rauer Asphalt, gelbe Mittellinie, weisse Randlinien, Streusplitt
  const S = 512, { c, g } = newCanvas(S, S);
  g.fillStyle = '#44454b'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(31);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 80, dark = rnd() < 0.5, a = 0.04 + rnd() * 0.05;
    drawWrapped(S, x, y, r, (px, py) => blob(g, px, py, r, dark ? '0,0,0' : '255,255,255', dark ? a : a * 0.7));
  }
  for (let i = 0; i < 30000; i++) {
    const a = 0.05 + rnd() * 0.09;
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + (a * 1.5) + ')';
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.8, 1 + rnd() * 1.8);
  }
  g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) crack(g, rnd, 60 + rnd() * (S - 120), 30 + rnd() * (S - 160), 5 + (rnd() * 5 | 0), 1);
  for (let i = 0; i < 700; i++) {                 // Streusplitt-Flecken nahe den Rändern
    const sx = rnd() < 0.5 ? 40 + rnd() * 70 : 402 + rnd() * 70;
    g.fillStyle = rnd() < 0.5 ? 'rgba(120,118,110,0.7)' : 'rgba(30,30,32,0.7)';
    g.fillRect(sx, rnd() * S, 1 + rnd() * 2.4, 1 + rnd() * 2.4);
  }
  g.fillStyle = '#efefea'; g.fillRect(24, 0, 12, S); g.fillRect(476, 0, 12, S);
  g.fillStyle = '#f0c63a'; g.fillRect(250, 0, 12, 256);
  for (let i = 0; i < 900; i++) {
    const reg = rnd(), x = reg < 0.33 ? 24 + rnd() * 12 : reg < 0.66 ? 476 + rnd() * 12 : 250 + rnd() * 12;
    g.fillStyle = 'rgba(68,69,75,' + (0.4 + rnd() * 0.5) + ')'; g.fillRect(x, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 5);
  }
  return toTexture(c, true);
}
function makeAlpineEnvCanvas() {                  // Umgebung fürs Auto: Himmel, rosa Gipfel, Wolkenmeer
  const { c, g } = newCanvas(256, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  [[0, '#1a4a9e'], [0.3, '#5a92d6'], [0.46, '#ffd2a8'], [0.5, '#ffc59a'], [0.54, '#e6dcea'], [1, '#aeb9d2']].forEach(s => gr.addColorStop(s[0], s[1]));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  const rnd = mulberry32(8);
  g.fillStyle = '#f6e6ee'; g.beginPath(); g.moveTo(0, 64);
  for (let x = 0; x <= 256; x += 4) g.lineTo(x, 64 - 8 - 18 * Math.abs(Math.sin(x * 0.045 + 1)) - rnd() * 4);
  g.lineTo(256, 64); g.fill();
  blob(g, 190, 50, 26, '255,230,190', 0.9);
  return c;
}
function makeAlpinePeakTexture(ph, amp, top, bottom) {   // Schneegipfel-Ebene: scharfe Grate, Licht-/Schattenfacetten, hochaufgelöst
  const W = 4096, H = 256, K = H / 128, TAU = Math.PI * 2, { c, g } = newCanvas(W, H);   // K = Pixel pro Welteinheit (Zylinderhöhe 128)
  g.clearRect(0, 0, W, H);
  const sharp = t => Math.pow(1 - Math.abs(Math.sin(t)), 1.5);       // spitze Gipfel, breite Täler
  const ridge = x => {                                                // nur ganzzahlige Frequenzen -> nahtlos über die Naht
    const a = x / W * TAU, env = 0.62 + 0.38 * Math.sin(a * 2 + 1.3 + ph);
    return 38 + 30 * env * sharp(a * 9 + 0.7 + ph) + 20 * sharp(a * 19 + 2 + ph) + 10 * env * sharp(a * 37 + ph * 2)
      + 8 * Math.sin(a * 3 + ph) + 2.2 * Math.sin(a * 71 + ph) + 1.2 * Math.sin(a * 131 + ph * 3);
  };
  const hs = new Float32Array(W + 1); for (let x = 0; x <= W; x++) hs[x] = ridge(x % W) * amp * K;
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, top); gr.addColorStop(0.42, top); gr.addColorStop(0.62, bottom); gr.addColorStop(1, THEME.mtnBase || '#b4c0dc');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x++) g.lineTo(x, H - hs[x]);
  g.lineTo(W, H); g.closePath(); g.fill();
  // Facetten: jede Flanke (Grat -> Tal) bekommt Licht/Schatten passend zur Sonnenrichtung (Zylinder-Winkel = x / W * 2π);
  // gefüllt als Fläche mit sanftem Auslaufen nach unten – keine Einzelspalten mehr (vorher: senkrechte Streifen)
  const L = THEME.ldir || [-62, 30, 62], phiS = Math.atan2(L[0], L[2]);
  let xa = 0;
  const flank = (x0, x1) => {
    if (x1 - x0 < 2) return;
    const slope = (hs[x1] - hs[x0]) / (x1 - x0);                      // > 0: steigt nach +x (Flanke schaut nach -x)
    const th = (x0 + x1) / 2 / W * TAU;
    const dl = Math.atan(Math.min(2.4, Math.abs(slope) * 0.9)), cd = Math.cos(dl), sd = Math.sin(dl);   // Neigung der Fläche
    const tang = Math.sin(phiS - th) * sd * (slope < 0 ? 1 : -1);
    const b = -Math.cos(th - phiS) * cd + tang + 0.25;                // Licht auf der zur Kamera gewandten Fläche
    const col = b > 0 ? (THEME.mtnLit || '255,208,190') : '34,44,100', al = b > 0 ? Math.min(0.42, b * 0.5) : Math.min(0.34, -b * 0.42);
    if (al < 0.02) return;
    let yTop = H; for (let x = x0; x <= x1; x++) yTop = Math.min(yTop, H - hs[x]);
    const fg = g.createLinearGradient(0, yTop, 0, H);
    fg.addColorStop(0, 'rgba(' + col + ',' + al + ')'); fg.addColorStop(0.8, 'rgba(' + col + ',0)');
    g.fillStyle = fg; g.beginPath(); g.moveTo(x0, H);
    for (let x = x0; x <= x1; x++) g.lineTo(x, H - hs[x]);
    g.lineTo(x1, H); g.closePath(); g.fill();
  };
  for (let x = 1; x <= W; x++) {
    const d0 = hs[x] - hs[x - 1], d1 = x < W ? hs[x + 1] - hs[x] : hs[1] - hs[0];
    if (((d0 > 0) !== (d1 > 0) && x - xa >= 28) || x - xa >= 220) { flank(xa, x); xa = x; }   // an Grat/Tal (mind. 28 px breit) oder nach 220 px teilen
  }
  flank(xa, W);
  const t = toTexture(c, false); t.wrapS = THREE.RepeatWrapping; return t;
}
function makeAlpineStoneTexture() {               // Quadermauerwerk (Viadukt, Portale, Mäuerchen, Kapelle)
  const S = 256, { c, g } = newCanvas(S, S), rnd = mulberry32(12);
  g.fillStyle = '#6f6a60'; g.fillRect(0, 0, S, S);
  let y = 0;
  while (y < S) {
    const h = 24 + ((rnd() * 10) | 0), hh = Math.min(h, S - y); let x = -((rnd() * 40) | 0);
    while (x < S) {
      const w = 34 + ((rnd() * 40) | 0), t = 128 + ((rnd() * 70) | 0);
      g.fillStyle = 'rgb(' + t + ',' + (t - 5) + ',' + (t - 16) + ')'; g.fillRect(x + 1, y + 1, w - 2, hh - 2);
      for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '0,0,0' : '255,255,255') + ',0.07)'; g.fillRect(x + rnd() * w, y + rnd() * hh, 1 + rnd() * 3, 1 + rnd() * 2); }
      x += w;
    }
    y += h;
  }
  const tx = toTexture(c, true); tx.wrapS = THREE.RepeatWrapping; return tx;
}
function makeAlpineRockTexture() {                // Fels: geschichtet, dunkle Spalten (Felsportal, Tunnelmassiv, Steinbruch)
  const S = 256, { c, g } = newCanvas(S, S), rnd = mulberry32(21);
  g.fillStyle = '#7a756d'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 50; drawWrapped(S, x, y, r, (px, py) => blob(g, px, py, r, rnd() < 0.5 ? '40,36,32' : '200,190,175', 0.12)); }
  for (let i = 0; i < 70; i++) { g.strokeStyle = 'rgba(30,26,22,' + (0.15 + rnd() * 0.3) + ')'; g.lineWidth = 1 + rnd() * 2; const y = rnd() * S, x = rnd() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + rnd() * 70, y + (rnd() - 0.3) * 14); g.stroke(); }
  for (let i = 0; i < 6000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)'; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  const t = toTexture(c, true); t.wrapS = THREE.RepeatWrapping; return t;
}
function makeAlpineWoodTexture() {                // Holzbretter (Chalets, Tribüne, Gantry)
  const S = 256, { c, g } = newCanvas(S, S), rnd = mulberry32(44);
  for (let y = 0; y < S; y += 32) {
    const t = 96 + ((rnd() * 40) | 0);
    g.fillStyle = 'rgb(' + t + ',' + ((t * 0.68) | 0) + ',' + ((t * 0.42) | 0) + ')'; g.fillRect(0, y, S, 30);
    for (let k = 0; k < 18; k++) { g.strokeStyle = 'rgba(30,16,6,' + (0.1 + rnd() * 0.18) + ')'; g.lineWidth = 1; g.beginPath(); const yy = y + 2 + rnd() * 26; g.moveTo(0, yy); g.lineTo(S, yy + (rnd() - 0.5) * 3); g.stroke(); }
    g.fillStyle = 'rgba(20,10,4,0.55)'; g.fillRect(0, y + 30, S, 2);
  }
  const t = toTexture(c, true); t.wrapS = THREE.RepeatWrapping; return t;
}
function makeAlpineGroundTexture() {              // neutrale Detailtextur fürs Gelände (multipliziert mit den Vertexfarben)
  const S = 256, { c, g } = newCanvas(S, S), rnd = mulberry32(5);
  g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) { const x = rnd() * S, y = rnd() * S, r = 14 + rnd() * 40; drawWrapped(S, x, y, r, (px, py) => blob(g, px, py, r, rnd() < 0.5 ? '0,0,0' : '255,255,255', 0.1)); }
  for (let i = 0; i < 9000; i++) { const a = 0.05 + rnd() * 0.08; g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')'; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 3); }
  const t = toTexture(c, true); t.wrapS = THREE.RepeatWrapping; return t;
}
function makeAlpineCloudSeaTexture() {            // weiche Wolkendecke (nahtlos)
  const S = 256, { c, g } = newCanvas(S, S), rnd = mulberry32(77);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) { const x = rnd() * S, y = rnd() * S, r = 24 + rnd() * 60; drawWrapped(S, x, y, r, (px, py) => blob(g, px, py, r, '255,246,244', 0.22 + rnd() * 0.25)); }
  const t = toTexture(c, true); t.wrapS = THREE.RepeatWrapping; return t;
}
function makeAlpineCirrusTexture() {              // dünne Zirrusstreifen
  const { c, g } = newCanvas(256, 64); g.clearRect(0, 0, 256, 64);
  const rnd = mulberry32(19);
  for (let i = 0; i < 26; i++) { const y = 12 + rnd() * 40, x = rnd() * 150, w = 60 + rnd() * 110; const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(255,236,230,0)'); gr.addColorStop(0.5, 'rgba(255,240,236,' + (0.12 + rnd() * 0.16) + ')'); gr.addColorStop(1, 'rgba(255,236,230,0)'); g.fillStyle = gr; g.fillRect(x, y, w, 1 + rnd() * 3); }
  return toTexture(c, false);
}
function makeAlpineSnowPatchTexture() {           // unregelmässiger Schneefleck
  const { c, g } = newCanvas(128, 128); g.clearRect(0, 0, 128, 128); const rnd = mulberry32(3);
  for (let i = 0; i < 9; i++) blob(g, 64 + (rnd() - 0.5) * 46, 64 + (rnd() - 0.5) * 30, 22 + rnd() * 20, '250,252,255', 0.95);
  return toTexture(c, false);
}
function makeAlpineWaterfallTexture() {           // fallendes Wasser: weisse Schlieren (vertikal wiederholt, wird animiert)
  const { c, g } = newCanvas(64, 256), rnd = mulberry32(61);
  g.clearRect(0, 0, 64, 256);
  for (let i = 0; i < 38; i++) { const x = rnd() * 64, y = rnd() * 256, h = 30 + rnd() * 90; const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + (0.4 + rnd() * 0.5) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, 1 + rnd() * 4, h); if (y + h > 256) g.fillRect(x, y - 256, 3, h); }
  const t = toTexture(c, true); t.wrapS = THREE.RepeatWrapping; return t;
}
function makeAlpineBannerTexture(text, sub, c1, c2) {   // Holz-Banner mit Titel (Ziel-Gantry, Sektor-Bögen)
  const { c, g } = newCanvas(1024, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  for (let k = 0; k < 64; k++) { g.fillStyle = k % 2 === 0 ? '#f6f3ea' : '#d8352b'; g.fillRect(k * 16, 0, 16, 14); g.fillRect(k * 16, 242, 16, 14); }
  g.strokeStyle = 'rgba(255,240,210,0.85)'; g.lineWidth = 5; g.strokeRect(14, 26, 996, 204);
  g.fillStyle = '#fff6e0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 8;
  g.font = 'italic 900 112px Arial, sans-serif'; g.fillText(text, 512, 110);
  g.font = 'bold 46px Arial, sans-serif'; g.fillText(sub, 512, 190);
  return toTexture(c, false);
}
function makeAlpineSignTexture(kind, text) {      // Warn- und Hinweisschilder (Steinschlag, Kehre, Höhenmeter, Kilometerstein, Pfeiltafel)
  const { c, g } = newCanvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  const tri = (fill) => { g.fillStyle = '#f8f8f4'; g.beginPath(); g.moveTo(128, 10); g.lineTo(246, 220); g.lineTo(10, 220); g.closePath(); g.fill(); g.strokeStyle = '#d8231f'; g.lineWidth = 22; g.lineJoin = 'round'; g.stroke(); };
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'rock') {                                         // Steinschlag
    tri(); g.fillStyle = '#222'; g.beginPath(); g.moveTo(40, 200); g.lineTo(210, 200); g.lineTo(150, 110); g.lineTo(96, 150); g.closePath(); g.fill();
    g.fillStyle = '#111'; [[104, 70, 15], [140, 96, 12], [118, 120, 10]].forEach(r => { g.beginPath(); g.arc(r[0], r[1], r[2], 0, 7); g.fill(); });
  } else if (kind === 'hairpin') {                               // Kehre
    tri(); g.strokeStyle = '#222'; g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.moveTo(96, 205); g.lineTo(96, 120); g.arc(128, 120, 32, Math.PI, 0); g.lineTo(160, 160); g.stroke();
    g.fillStyle = '#222'; g.beginPath(); g.moveTo(160, 190); g.lineTo(138, 160); g.lineTo(182, 160); g.closePath(); g.fill();
  } else if (kind === 'height') {                                // Höhenmeter-Tafel
    g.fillStyle = '#6b3f1e'; g.fillRect(8, 60, 240, 136); g.strokeStyle = '#f4e8cc'; g.lineWidth = 6; g.strokeRect(16, 68, 224, 120);
    g.fillStyle = '#f4e8cc'; g.font = 'bold 66px Arial, sans-serif'; g.fillText(text, 128, 112); g.font = 'bold 26px Arial, sans-serif'; g.fillText('ÜBER NORMALNULL', 128, 164);
  } else if (kind === 'km') {                                    // Kilometerstein
    g.fillStyle = '#f2f0e6'; g.beginPath(); g.moveTo(40, 250); g.lineTo(40, 70); g.arc(128, 70, 88, Math.PI, 0); g.lineTo(216, 250); g.closePath(); g.fill();
    g.fillStyle = '#d8231f'; g.fillRect(40, 120, 176, 22);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 54px Arial, sans-serif'; g.fillText(text, 128, 190); g.font = 'bold 30px Arial, sans-serif'; g.fillText('km', 128, 232);
  } else {                                                       // Pfeiltafel an der Kehre (Pfeil + Höhenmeter)
    g.fillStyle = '#12356b'; g.fillRect(8, 8, 240, 240); g.strokeStyle = '#f4f4f0'; g.lineWidth = 8; g.strokeRect(18, 18, 220, 220);
    g.fillStyle = '#f4f4f0'; g.beginPath(); g.moveTo(190, 112); g.lineTo(110, 52); g.lineTo(110, 92); g.lineTo(58, 92); g.lineTo(58, 132); g.lineTo(110, 132); g.lineTo(110, 172); g.closePath(); g.fill();
    g.font = 'bold 46px Arial, sans-serif'; g.fillText(text, 128, 206);
  }
  return toTexture(c, false);
}


// ─── Bauwerke: Viadukt, Stützmauern, Felsportal, Start/Ziel, Garagen, Sektorbögen ──────────
let _alpStoneMat = null, _alpRockMat = null, _alpWoodMat = null;
const alpStoneMat = () => _alpStoneMat || (_alpStoneMat = lambert(0xffffff, { map: makeAlpineStoneTexture() }));
const alpRockMat = () => _alpRockMat || (_alpRockMat = lambert(0xffffff, { map: makeAlpineRockTexture() }));
const alpWoodMat = () => _alpWoodMat || (_alpWoodMat = lambert(0xffffff, { map: makeAlpineWoodTexture() }));

// UVs aus Weltkoordinaten (je nach Flächenrichtung), damit Mauerwerk überall gleich gross bleibt
function alpineWorldUV(geo, scale) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay > ax && ay > az) uv.setXY(i, p.getX(i) / scale, p.getZ(i) / scale);
    else if (ax > az) uv.setXY(i, p.getZ(i) / scale, p.getY(i) / scale);
    else uv.setXY(i, p.getX(i) / scale, p.getY(i) / scale);
  }
  uv.needsUpdate = true;
  return geo;
}
function alpineBox(w, h, d, p, q) {                 // Quader mit Welt-UV, Mitte p, Drehung q
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().compose(p, q || new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
  return alpineWorldUV(g, 4);
}

// Steinbogen-Viadukt über der Schlucht (statt Stadt-Träger): Deck, Brüstung, Bögen, Pfeiler bis ins Gelände
function buildAlpineViaduct() {
  const S = bridgeR.h, c0 = bridgeR.c, bw = HALF_W + 1.6, parts = [];
  const deckBot = o => frames[mod(c0 + Math.round(o))].P.y - 1.5;
  parts.push(alpineWorldUV(buildStrip(c0 - S, c0 + S, () => [[-bw, -0.03], [-bw, -1.5], [bw, -1.5], [bw, -0.03]], { cap: true, vLen: 1 }), 4));
  [1, -1].forEach(sg => parts.push(alpineWorldUV(buildStrip(c0 - S, c0 + S,
    () => [[sg * (bw - 0.5), -0.03], [sg * (bw - 0.5), 1.05], [sg * bw, 1.05], [sg * bw, -0.03]], { cap: true, vLen: 1 }), 4)));
  const nSp = 5, spanS = 2 * S / nSp, phS = 1.35 / DS, yaw = new THREE.Vector3(0, 1, 0);   // 5 Bögen: Mitte = Öffnung (Strecke darunter), kein Pfeiler auf der Fahrbahn
  for (let k = 0; k <= nSp; k++) {                                   // Pfeiler (bis unter das Gelände)
    const o = -S + k * spanS, f = frames[mod(c0 + Math.round(o))];
    let base = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) base = Math.min(base, alpineHeightAt(f.P.x + f.Lh.x * a * bw + f.Th.x * b * 1.4, f.P.z + f.Lh.z * a * bw + f.Th.z * b * 1.4));
    base -= 1.2;
    const top = deckBot(o) + 0.4, h = Math.max(1, top - base), w2 = 2 * bw + 0.1;
    parts.push(alpineBox(w2, h, 2.7, new THREE.Vector3(f.P.x, base + h / 2, f.P.z), yawQuat(f)));
    addSolid(f, f.P.x, f.P.z, w2 / 2, 1.35, top);
    if (k > 0 && k < nSp) parts.push(alpineBox(w2 + 0.5, 0.5, 3.3, new THREE.Vector3(f.P.x, deckBot(o) - 0.25, f.P.z), yawQuat(f)));   // Pfeilerkopf
  }
  for (let k = 0; k < nSp; k++) {                                     // Bögen: Stirnflächen und Tonnengewölbe
    const oA = -S + k * spanS + phS, oB = -S + (k + 1) * spanS - phS, oc = (oA + oB) / 2, Rm = (oB - oA) / 2 * DS;
    const ysp = Math.min(deckBot(oA), deckBot(oB)) - 1.25 - Rm;
    const curve = o => ysp + Math.sqrt(Math.max(0, Rm * Rm - Math.pow((o - oc) * DS, 2)));
    const a = c0 + Math.floor(oA) - 1, b = c0 + Math.ceil(oB) + 1;
    [1, -1].forEach(sg => parts.push(alpineWorldUV(buildStrip(a, b, (f, i) => {
      const o = wrapIdx(i - c0), lat = sg * bw;
      return [[lat, upForWorldY(f, lat, curve(o))], [lat, upForWorldY(f, lat, deckBot(o) + 0.05)]];
    }, { vLen: 1 }), 4)));
    parts.push(alpineWorldUV(buildStrip(a, b, (f, i) => {
      const o = wrapIdx(i - c0), y = curve(o);
      return [[-bw, upForWorldY(f, -bw, y)], [bw, upForWorldY(f, bw, y)]];
    }, { vLen: 1 }), 4));
  }
  parts.forEach(g => { if (!g.attributes.normal) g.computeVertexNormals(); });
  addMesh(mergeGeos(parts.map(g => { if (!g.index) { const n = g.attributes.position.count, ix = []; for (let i = 0; i < n; i++) ix.push(i); g.setIndex(ix); } return g; })), alpStoneMat(), { cast: true, recv: true });
}

// Stützmauern: Bankett auf Fahrbahnhöhe, davon fällt eine Quadermauer bis ins Gelände (Berg- und Talseite);
// talseitig zusätzlich ein Steinmäuerchen
function buildAlpineBanks() {
  const earth = lambert(0x7c7767), ok = [];
  for (let i = 0; i < N; i++) ok.push(!inBridge(i));
  const valley = [];                                              // talseitig = die Seite mit tieferem Gelände (geglättet)
  for (let i = 0; i < N; i++) { const f = frames[i]; valley.push(gAt(f, 16) < gAt(f, -16) ? 1 : -1); }
  const vs = valley.map((_, i) => { let s = 0; for (let k = -14; k <= 14; k++) s += valley[mod(i + k)]; return s >= 0 ? 1 : -1; });
  buildRuns(ok).forEach(run => {
    [1, -1].forEach(sg => {
      addMesh(buildStrip(run.a, run.b, () => [[sg * (HALF_W - 0.3), -0.05], [sg * (HALF_W + 3.4), -0.05]], { vLen: 4 }), earth, { recv: true });
      addMesh(alpineWorldUV(buildStrip(run.a, run.b, f => {
        const l0 = sg * (HALF_W + 3.4), l1 = sg * (HALF_W + 3.65);
        return [[l0, -0.05], [l1, upForWorldY(f, l1, gAt(f, l1) - 0.5)]];
      }, { vLen: 1 }), 3), alpStoneMat(), { recv: true });
    });
    const okV = [];                                               // Steinmäuerchen nur talseitig, ohne Tunnel
    for (let i = run.a; i <= run.b; i++) okV.push(!inTunnel(mod(i)));
    [1, -1].forEach(sg => {
      const flags = []; for (let i = run.a; i <= run.b; i++) flags.push(!inTunnel(mod(i)) && vs[mod(i)] === sg);
      buildRuns(flags).forEach(r => {
        if (r.b - r.a < 6) return;
        addMesh(alpineWorldUV(buildStrip(run.a + r.a, run.a + r.b, () => [[sg * (HALF_W + 3.05), -0.05], [sg * (HALF_W + 3.05), 0.78], [sg * (HALF_W + 3.5), 0.78], [sg * (HALF_W + 3.5), -0.05]], { cap: true, vLen: 1 }), 3), alpStoneMat(), { cast: false, recv: true });
      });
    });
  });
}

// Tunnel: Felsmassiv-Hügel, der bündig ins Gelände übergeht, dazu Felsportale mit Steinkranz
function buildAlpineTunnelRock(tA, tB, tw, inner) {
  const LAT = [-54, -42, -32, -24, -18, -13, -9, -4.5, 0, 4.5, 9, 13, 18, 24, 32, 42, 54];
  const HT = 11.2;
  const prof = f => LAT.map((l, k) => {
    const g = gAt(f, l), flank = f.P.y + HT - 0.95 * Math.max(0, Math.abs(l) - 9);
    const y = (k === 0 || k === LAT.length - 1) ? g - 1.2 : Math.max(flank, g + 0.15);
    return [l, upForWorldY(f, l, y)];
  });
  const uvU = []; { let acc = 0; LAT.forEach((l, k) => { if (k) acc += (l - LAT[k - 1]) / 6; uvU.push(acc); }); }
  addMesh(buildStrip(tA, tB, prof, { vLen: 6, uvU }), alpRockMat(), { cast: true, recv: true });
  const mouth = inner();
  const lip = [[-tw - 1.3, -0.5], [-tw - 1.3, 4.6], [-tw + 0.8, 7.1], [tw - 0.8, 7.1], [tw + 1.3, 4.6], [tw + 1.3, -0.5]];
  [[tA, -1], [tB, 1]].forEach(([gi, dir]) => {
    const f = frames[mod(gi)], pr = prof(f);
    const minUp = Math.min.apply(null, pr.map(p => p[1])) - 1.5;
    const outline = pr.map(p => new THREE.Vector2(p[0], p[1])).concat([new THREE.Vector2(LAT[LAT.length - 1], minUp), new THREE.Vector2(LAT[0], minUp)]);
    const shape = new THREE.Shape(outline);
    shape.holes.push(new THREE.Path(mouth.map(m => new THREE.Vector2(m[0], m[1]))));
    const sg = new THREE.ShapeGeometry(shape), pa = sg.attributes.position, pos = [], uv = [];
    for (let i = 0; i < pa.count; i++) { const w = wp(f, pa.getX(i), pa.getY(i)); pos.push(w.x, w.y, w.z); uv.push(pa.getX(i) / 5, pa.getY(i) / 5); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(Array.from(sg.index.array)); geo.computeVertexNormals();
    addMesh(geo, alpRockMat(), { recv: true });
    // Steinkranz um die Öffnung (leicht vorstehend)
    const ring = new THREE.Shape(lip.map(m => new THREE.Vector2(m[0], m[1])));
    const hole = [[-tw - 0.25, -0.5], [-tw - 0.25, 4.3], [-tw + 1.45, 6.2], [tw - 1.45, 6.2], [tw + 0.25, 4.3], [tw + 0.25, -0.5]];
    ring.holes.push(new THREE.Path(hole.map(m => new THREE.Vector2(m[0], m[1]))));
    const eg = new THREE.ExtrudeGeometry(ring, { depth: 1.3, bevelEnabled: false });
    alpineWorldUV(eg, 3);
    const m = new THREE.Mesh(eg, alpStoneMat());
    m.quaternion.copy(frameQuat(f));
    m.position.copy(f.P).addScaledVector(f.Up, 0.0);
    if (dir < 0) m.position.addScaledVector(f.T, -1.3);
    m.castShadow = true; scene.add(m);
  });
}

// Start/Ziel: Holz-Gantry mit Steinsockeln und Banner „BERGPASS GP“ (lokale Gruppe, +z = Fahrtrichtung)
function alpineStartGantry(g) {
  const gw = HALF_W + 1.9, wood = alpWoodMat(), stone = alpStoneMat();
  const add = (geo, mat, x, y, z, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rz) m.rotation.z = rz; m.castShadow = true; g.add(m); return m; };
  [-1, 1].forEach(sg => {
    add(new THREE.BoxGeometry(1.7, 1.3, 1.7), stone, sg * gw, 0.6, 0);
    add(new THREE.BoxGeometry(0.9, 9.4, 0.9), wood, sg * gw, 5.2, 0);
    add(new THREE.BoxGeometry(0.4, 0.4, 3.4), wood, sg * (gw - 1.1), 8.1, 0, sg * 0.0);
    add(new THREE.BoxGeometry(0.34, 3.2, 0.34), wood, sg * (gw - 1.5), 8.3, 0, sg * -0.75);
  });
  add(new THREE.BoxGeometry(gw * 2 + 1.6, 1.2, 1.2), wood, 0, 10.2, 0);
  const roof = new THREE.Mesh(alpinePrism(gw * 2 + 3.2, 2.2, 1.7), lambert(0x4a2e1a)); roof.position.set(0, 10.8, 0); roof.rotation.y = Math.PI / 2; g.add(roof);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2 - 0.8, (gw * 2 - 0.8) / 4),
    new THREE.MeshBasicMaterial({ map: makeAlpineBannerTexture('BERGPASS GP', 'ALPEN-RENNEN', '#6b3f1e', '#2f1c0c'), side: THREE.DoubleSide }));
  banner.position.set(0, 7.7, 0.65); banner.rotation.y = Math.PI; g.add(banner);
}
function alpinePrism(w, d, hr) {                     // Satteldach-Prisma: Breite w, Tiefe d (z), Firsthöhe hr
  const x = w / 2, z = d / 2, p = [
    -x, 0, -z, 0, hr, -z, 0, hr, z,   -x, 0, -z, 0, hr, z, -x, 0, z,
    x, 0, -z, x, 0, z, 0, hr, z,      x, 0, -z, 0, hr, z, 0, hr, -z,
    -x, 0, -z, x, 0, -z, 0, hr, -z,   -x, 0, z, 0, hr, z, x, 0, z];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const uv = []; for (let i = 0; i < p.length / 3; i++) uv.push(p[i * 3] / 4, p[i * 3 + 1] / 4);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Boxengebäude im Alpen-Stil: Holz-Chalets mit Steinsockel, Satteldach, Rolltor und Farbschild
function buildAlpineGarages() {
  const cols = [0xcc2a1e, 0x2a6cc4, 0x2e8a3a, 0xd89a1a], gOff = Math.round(11 / DS);
  const roofMat = lambert(0x4a2e1a), doorMat = new THREE.MeshBasicMaterial({ color: 0x1a1008, side: THREE.DoubleSide });
  const woodGeo = alpineBoxGeoWood(5, 1, 8);
  [-1.5, -0.5, 0.5, 1.5].forEach((m, n) => {
    const f = frames[mod(Math.round(m * gOff))], lat = HALF_W + 6.5;
    const cx = f.P.x + f.Lh.x * lat, cz = f.P.z + f.Lh.z * lat, topY = f.P.y + 2.8;
    const g0 = Math.min(alpineHeightAt(cx, cz), alpineHeightAt(cx + f.Lh.x * 2.5, cz + f.Lh.z * 2.5), alpineHeightAt(cx - f.Lh.x * 2.5, cz - f.Lh.z * 2.5)) - 0.3;
    const h = topY - g0, grp = new THREE.Group();
    grp.quaternion.copy(yawQuat(f)); grp.position.set(cx, g0 + h / 2, cz);
    const body = new THREE.Mesh(woodGeo, alpWoodMat()); body.scale.y = h; body.castShadow = true; grp.add(body);
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.0, 8.2), alpStoneMat()); base.position.y = -h / 2 + 0.7; grp.add(base);
    const roof = new THREE.Mesh(alpinePrism(6.6, 9.4, 1.5), roofMat); roof.position.y = h / 2; roof.rotation.y = Math.PI / 2; roof.castShadow = true; grp.add(roof);
    const doorY = -h / 2 + (f.P.y - 0.05 - g0) + 0.95;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.9), doorMat); door.rotation.y = -Math.PI / 2; door.position.set(-2.52, doorY, 0); grp.add(door);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.55), new THREE.MeshBasicMaterial({ color: cols[n], side: THREE.DoubleSide }));
    sign.rotation.y = -Math.PI / 2; sign.position.set(-2.53, doorY + 1.5, 0); grp.add(sign);
    scene.add(grp);
  });
}
function alpineBoxGeoWood(w, h, d) {                  // Quader mit Welt-unabhängigen UVs (Holzbretter horizontal)
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2);
  return g;
}

// Sektor-Torbögen aus Holz mit Bannern „SEKTOR 2“ / „SEKTOR 3“
function createAlpineArches() {
  const gw = HALF_W + 1.9, rotB = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const texts = [['SEKTOR 2', 'EDELWEISS-QUELLE'], ['SEKTOR 3', 'GIPFELSTURM'], ['BERGPASS GP', 'ALPENBLITZ'], ['BERGPASS GP', 'KAISERSCHMARRN-EXPRESS']];
  const pil = [], base = [], arch = [], V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  gantrySpots.forEach((gi, n) => {
    const f = frames[gi];
    [-1, 1].forEach(sg => {
      const b = wp(f, sg * gw, -0.05);
      pil.push({ p: V3(b.x, b.y + 2.7, b.z), q: yawQuat(f), s: V3(0.8, 5.6, 0.8) });
      base.push({ p: V3(b.x, b.y + 0.35, b.z), q: yawQuat(f), s: V3(1.5, 1.1, 1.5) });
    });
    arch.push({ p: wp(f, 0, 5.4), q: frameQuat(f) });
    const tx = texts[n % 4];
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 2.3), new THREE.MeshBasicMaterial({ map: makeAlpineBannerTexture(tx[0], tx[1], '#7a4a22', '#33200e'), side: THREE.DoubleSide }));
    ban.position.copy(wp(f, 0, 9.6)); ban.quaternion.copy(frameQuat(f).multiply(rotB)); scene.add(ban);
  });
  const wood = alpWoodMat();
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), wood, pil);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), alpStoneMat(), base);
  makeInstanced(new THREE.TorusGeometry(gw, 0.38, 6, 24, Math.PI), wood, arch);
}


// ─── Himmel: Zirrus, Lichtstrahlen ──────────────────────────────────────────────
const alp = { sea: [], seaTex: null, snow: null, snowUni: null, smoke: null, gond: null, gondBody: null, gondN: 0, cable: null, wfTex: null, wf: null, chalets: [], q: 2 };
function buildAlpineSky() {
  const cir = makeAlpineCirrusTexture(), rn = mulberry32(404);
  for (let i = 0; i < 9; i++) {
    const a = rn() * Math.PI * 2, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cir, color: 0xffe2dc, transparent: true, opacity: 0.35 + rn() * 0.25, depthWrite: false, fog: false }));
    s.scale.set(380 + rn() * 220, 80 + rn() * 40, 1); s.position.set(Math.cos(a) * 430, 210 + rn() * 90, Math.sin(a) * 430); s.renderOrder = -4;
    skyGroup.add(s); cloudSprites.push(s);
  }
  const sd = LDIR.clone().normalize().multiplyScalar(500);          // dezente Lichtstrahlen um die Sonne
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: 0xffe0b0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, rotation: -0.9 + i * 0.36 }));
    s.scale.set(46, 620, 1); s.position.copy(sd).add(new THREE.Vector3((i - 2.5) * 8, 0, 0)); s.renderOrder = -7; skyGroup.add(s);
  }
}

// ─── Gelände-Streuung ─────────────────────────────────────────────────────────────
function alpNearTunnel(x, z) {
  const r = cityNearest(x, z, 62);
  return r.i >= 0 && Math.abs(wrapIdx(r.i - tunnelR.c)) < tunnelR.h + Math.round(30 / DS);
}
function alpineSpots(seed, count, o) {
  const rn = mulberry32(seed), out = [], R = o.R || 400;
  for (let t = 0; t < (o.tries || count * 80) && out.length < count; t++) {
    const x = ALP.CX + (rn() - 0.5) * 2 * R, z = ALP.CZ + (rn() - 0.5) * 2 * R;
    const h = alpineHeightAt(x, z); if (h < o.hMin || h > o.hMax) continue;
    const d = alpineDistAt(x, z); if (d < o.dMin || d > o.dMax) continue;
    const s = alpineSlopeAt(x, z); if (s < o.sMin || s > o.sMax) continue;
    const ra = rn(), rb = rn(), rc = rn(), rd = rn();
    if (o.keep && !o.keep(x, z, h, ra)) continue;
    if (o.clear && !clearOfScenery(x, z, o.clear)) continue;
    if (alpNearTunnel(x, z)) continue;
    out.push({ x, z, h, s, a: ra, b: rb, c: rc, d: rd });
    if (o.reg !== false) sceneryPts.push(x, z);
  }
  return out;
}

// ─── Szenerie: Höhengelände, Wolkenmeer, Bergwelt ────────────────────────────────
function createAlpineScenery() {
  if (!cityGrid) buildCityGrid();
  createAlpineTerrainMesh();
  createAlpineCloudSea();
  collectDeco(1, createAlpineBuildings);   // zuerst: Hütten und Kapelle reservieren ihren Platz, die Bäume weichen aus
  collectDeco(1, createAlpineFlora);
  if (SCENE.ALP_WATERFALL) createAlpineWaterfall();
}
function createAlpineTerrainMesh() {
  const NV = ALP.N + 1, CS = ALP.CS, pos = new Float32Array(NV * NV * 3), col = new Float32Array(NV * NV * 3), uv = new Float32Array(NV * NV * 2);
  const mix = (a, b, t) => a + (b - a) * t;
  for (let iz = 0; iz < NV; iz++) for (let ix = 0; ix < NV; ix++) {
    const k = iz * NV + ix, x = ALP.X0 + ix * CS, z = ALP.Z0 + iz * CS, h = alpH[k];
    const hx = alpH[iz * NV + Math.min(NV - 1, ix + 1)] - alpH[iz * NV + Math.max(0, ix - 1)];
    const hz = alpH[Math.min(NV - 1, iz + 1) * NV + ix] - alpH[Math.max(0, iz - 1) * NV + ix];
    const slope = Math.sqrt(hx * hx + hz * hz) / (2 * CS), D = alpD[k];
    const n1 = fbm(x * 0.03 + 7, z * 0.03 + 3), n2 = vnoise(x * 0.17, z * 0.17), n3 = vnoise(x * 0.5, z * 0.5);
    let r = 0.27, g = 0.43, b = 0.16;                                           // Wiese
    const mid = smooth01(20, 50, h + (n1 - 0.5) * 12);
    r = mix(r, 0.47, mid); g = mix(g, 0.5, mid); b = mix(b, 0.23, mid);        // Almwiese
    const sc = smooth01(54, 78, h + (n1 - 0.5) * 16);
    r = mix(r, 0.52, sc); g = mix(g, 0.49, sc); b = mix(b, 0.45, sc);          // Geröll
    const rk = smooth01(0.55, 1.0, slope + (n2 - 0.5) * 0.25);
    r = mix(r, 0.43, rk); g = mix(g, 0.39, rk); b = mix(b, 0.35, rk);          // Fels
    const cut = (1 - smooth01(14, 36, D)) * smooth01(0.45, 0.85, slope);
    r = mix(r, 0.40, cut * 0.55); g = mix(g, 0.31, cut * 0.55); b = mix(b, 0.22, cut * 0.55);   // dunkle Erde an Böschungen
    const sn = Math.max(smooth01(78, 98, h + (n1 - 0.5) * 30) * (1 - 0.6 * rk), smooth01(0.58, 0.72, n2) * smooth01(36, 44, h) * (1 - smooth01(0.4, 0.7, slope)) * 0.9);
    const pink = smooth01(80, 180, h) * 0.12;                                   // Alpenglühen: Schnee oben leicht rosa
    r = mix(r, 0.97, sn); g = mix(g, 0.97 - pink * 0.5, sn); b = mix(b, 1.0 - pink, sn);
    const dk = (0.55 + 0.45 * smooth01(-12, 6, h)) * (0.93 + 0.14 * n3);       // unter dem Wolkenmeer dunkler
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    col[k * 3] = r * dk; col[k * 3 + 1] = g * dk; col[k * 3 + 2] = b * dk;
    uv[k * 2] = x / 18; uv[k * 2 + 1] = z / 18;
  }
  const idx = new Uint16Array(ALP.N * ALP.N * 6); let q = 0;
  for (let iz = 0; iz < ALP.N; iz++) for (let ix = 0; ix < ALP.N; ix++) {
    const a = iz * NV + ix, b = a + 1, c = a + NV, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
  const tex = makeAlpineGroundTexture(); tex.wrapT = THREE.RepeatWrapping;
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, map: tex, vertexColors: true }));
  m.receiveShadow = true; scene.add(m);
  // Rand-Schürze, damit man nirgends unter das Gelände sieht
  const sp = [], si = [];
  const edge = (k) => { sp.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], pos[k * 3], -80, pos[k * 3 + 2]); };
  const sides = [[0, 1], [0, NV], [NV - 1, NV], [(NV - 1) * NV, 1]];
  sides.forEach(([s0, st]) => { const b0 = sp.length / 3; for (let i = 0; i < NV; i++) edge(s0 + i * st); for (let i = 0; i < NV - 1; i++) { const a = b0 + i * 2; si.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); } });
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si);
  scene.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x9aa6bf, side: THREE.DoubleSide })));
}
function createAlpineCloudSea() {
  alp.seaTex = makeAlpineCloudSeaTexture(); alp.seaTex.repeat.set(7, 7);
  const levels = [[SEAY(6), 0.2], [SEAY(2), 0.3], [SEAY(-2), 0.42], [SEAY(-8), 0.6], [SEAY(-16), 0.85]];
  function SEAY(d) { return ALP.SEA + d; }
  levels.forEach(([y, a], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshBasicMaterial({ map: alp.seaTex, color: 0xfff0ec, transparent: true, opacity: a, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(ALP.CX, y, ALP.CZ); m.renderOrder = 2 + i; scene.add(m); alp.sea.push(m);
  });
}
function createAlpineFlora() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), Yax = V3(0, 1, 0), yawQ = a => new THREE.Quaternion().setFromAxisAngle(Yax, a);
  const swayMat = c => { const m = new THREE.MeshLambertMaterial({ color: c }); m.onBeforeCompile = swayShader; return m; };
  const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l);
  // Kiefern/Fichten: nur in tieferen Lagen, verschwinden mit der Höhe
  const pines = alpineSpots(901, SCENE.ALP_PINES, { dMin: 20, dMax: 400, hMin: -2, hMax: 62, sMin: 0, sMax: 0.85, clear: 7, tries: 60000, keep: (x, z, h, r) => r < 1 - smooth01(30, 52, h) });
  const trunk = [], c1 = [], c2 = [], c3 = [];
  pines.forEach(p => {
    const s = 0.8 + p.b * 0.9, y = p.h - 0.2, col = hsl(0.33 + p.c * 0.04, 0.4, 0.14 + p.d * 0.08), q = yawQ(p.a * 6.28);
    trunk.push({ p: V3(p.x, y + 1.1 * s, p.z), q, s: V3(s, s, s) });
    c1.push({ p: V3(p.x, y + 3.2 * s, p.z), q, s: V3(s, s, s), c: col }); c2.push({ p: V3(p.x, y + 5.0 * s, p.z), q, s: V3(s * 0.8, s, s * 0.8), c: col }); c3.push({ p: V3(p.x, y + 6.6 * s, p.z), q, s: V3(s * 0.55, s, s * 0.55), c: col });
  });
  makeInstanced(new THREE.CylinderGeometry(0.22, 0.34, 2.4, 5), swayMat(0x4a3322), trunk);
  makeInstanced(new THREE.ConeGeometry(2.3, 3.6, 7), swayMat(0xffffff), c1);
  makeInstanced(new THREE.ConeGeometry(1.9, 3.2, 7), swayMat(0xffffff), c2);
  makeInstanced(new THREE.ConeGeometry(1.4, 3.0, 7), swayMat(0xffffff), c3);
  // Latschenkiefern: flache dunkle Büsche bis in grosse Höhe
  const bushes = alpineSpots(902, SCENE.ALP_BUSHES, { dMin: 14, dMax: 400, hMin: 0, hMax: 70, sMin: 0, sMax: 0.9, clear: 3, tries: 40000, keep: (x, z, h, r) => r < 1 - smooth01(48, 70, h) });
  makeInstanced(new THREE.IcosahedronGeometry(1, 0), swayMat(0xffffff), bushes.map(p => ({ p: V3(p.x, p.h + 0.2, p.z), q: yawQ(p.a * 6.28), s: V3(1.3 + p.b * 1.4, 0.7 + p.c * 0.5, 1.3 + p.d * 1.2), c: hsl(0.3 + p.c * 0.05, 0.35, 0.13 + p.d * 0.07) })));
  // Felsbrocken und Felsnadeln
  const rocks = alpineSpots(903, SCENE.ALP_ROCKS, { dMin: 12, dMax: 400, hMin: 0, hMax: 200, sMin: 0, sMax: 1.4, clear: 2, tries: 40000 });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const rq = p => new THREE.Quaternion().setFromEuler(new THREE.Euler(p.a * 3, p.b * 6.28, p.c * 3));
  makeInstanced(new THREE.DodecahedronGeometry(1, 0), rockMat, rocks.map(p => { const s = 0.8 + p.d * p.d * 3.4; return { p: V3(p.x, p.h + s * 0.2, p.z), q: rq(p), s: V3(s * 1.3, s * 0.8, s), c: hsl(0.08, 0.06 + p.c * 0.06, 0.26 + p.b * 0.22) }; }));
  const spires = alpineSpots(904, SCENE.ALP_SPIRES, { dMin: 26, dMax: 400, hMin: 20, hMax: 200, sMin: 0.55, sMax: 1.6, clear: 6, tries: 40000 });
  makeInstanced(new THREE.ConeGeometry(1, 1, 6), rockMat, spires.map(p => { const hh = 5 + p.d * 11; return { p: V3(p.x, p.h + hh * 0.4, p.z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler((p.a - 0.5) * 0.3, p.b * 6.28, (p.c - 0.5) * 0.3)), s: V3(1.4 + p.a * 1.2, hh, 1.4 + p.c * 1.2), c: hsl(0.07, 0.07, 0.3 + p.b * 0.18) }; }));
  // Geröllfelder: viele kleine dunkle Steine auf steilen Hängen
  const fields = alpineSpots(905, SCENE.ALP_SCREE, { dMin: 26, dMax: 300, hMin: 14, hMax: 110, sMin: 0.5, sMax: 1.0, clear: 12, tries: 30000 });
  const rn = mulberry32(906), scree = [];
  fields.forEach(f0 => { for (let k = 0; k < 36; k++) { const a = rn() * 6.28, r = Math.sqrt(rn()) * 8, x = f0.x + Math.cos(a) * r, z = f0.z + Math.sin(a) * r, s = 0.2 + rn() * 0.5; scree.push({ p: V3(x, alpineHeightAt(x, z) + s * 0.15, z), q: rq({ a: rn(), b: rn(), c: rn() }), s: V3(s * 1.4, s * 0.7, s), c: hsl(0.08, 0.05, 0.22 + rn() * 0.16) }); } });
  makeInstanced(new THREE.DodecahedronGeometry(1, 0), rockMat, scree);
  // Almwiesen mit Blumen (kleine Blüten-Tupfen)
  const fl = alpineSpots(907, SCENE.ALP_FLOWERS, { dMin: 12, dMax: 160, hMin: 4, hMax: 46, sMin: 0, sMax: 0.5, tries: 40000, reg: false });
  const palette = [0xffe14a, 0xb06bff, 0xffffff, 0xff5a4a, 0x6ab7ff], fi = [], rn2 = mulberry32(908);
  fl.forEach(p => { const col = new THREE.Color(palette[(p.a * palette.length) | 0]); for (let k = 0; k < 4; k++) { const x = p.x + (rn2() - 0.5) * 3, z = p.z + (rn2() - 0.5) * 3, s = 0.7 + rn2() * 0.6; fi.push({ p: V3(x, alpineHeightAt(x, z) + 0.15, z), s: V3(s, s, s), c: col }); } });
  makeInstanced(new THREE.SphereGeometry(0.16, 5, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), fi);
}

// Holz-Chalets mit Steinsockel, Satteldach, Schornstein (Rauch in createAlpineLife) und eine Kapelle am Wegesrand
function createAlpineBuildings() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), Yax = V3(0, 1, 0), yawQ = a => new THREE.Quaternion().setFromAxisAngle(Yax, a);
  const spots = alpineSpots(910, SCENE.ALP_CHALETS, { dMin: 24, dMax: 120, hMin: 6, hMax: 48, sMin: 0, sMax: 0.4, clear: 36, tries: 60000 });
  alp.chalets = spots;
  const body = [], base = [], roof = [], win = [], chim = [], quarter = yawQ(Math.PI / 2);
  spots.forEach(p => {
    const s = 0.95 + p.b * 0.35, yaw = p.a * 6.28, q = yawQ(yaw), qr = yawQ(yaw).multiply(quarter);
    let g0 = Infinity; for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) g0 = Math.min(g0, alpineHeightAt(p.x + a * 3.8 * s * Math.cos(yaw) + b * 2.8 * s * Math.sin(yaw), p.z - a * 3.8 * s * Math.sin(yaw) + b * 2.8 * s * Math.cos(yaw)));
    p.y0 = g0; p.s = s; p.yaw = yaw;
    const baseH = 1.3 * s, bodyH = 4.0 * s, y = g0 - 0.3;
    const out = (ox, oy, oz) => { const c = Math.cos(yaw), sn = Math.sin(yaw); return V3(p.x + ox * c + oz * sn, oy, p.z - ox * sn + oz * c); };
    base.push({ p: V3(p.x, y + baseH / 2, p.z), q, s: V3(s, baseH + 0.6, s) });
    body.push({ p: V3(p.x, y + baseH + bodyH / 2, p.z), q, s: V3(s, s * 4.0, s) });
    roof.push({ p: V3(p.x, y + baseH + bodyH, p.z), q: qr, s: V3(s, s, s) });
    chim.push({ p: out(2.0 * s, y + baseH + bodyH + 1.6 * s, 0.4 * s), q, s: V3(s, s, s) });
    p.chim = out(2.0 * s, y + baseH + bodyH + 2.9 * s, 0.4 * s);
    [-1.8, 1.8].forEach(wx => { win.push({ p: out(wx * s, y + baseH + 2.0 * s, 2.64 * s), q, s: V3(s, s, s) }); });
  });
  makeInstanced(alpineBoxGeoWood(7, 1, 5.2), alpWoodMat(), body.map(b => b));
  makeInstanced(new THREE.BoxGeometry(7.4, 1, 5.6), alpStoneMat(), base);
  makeInstanced(alpinePrism(6.8, 8.8, 2.3), lambert(0x4e3220), roof);
  makeInstanced(new THREE.BoxGeometry(0.8, 3.2, 0.8), alpStoneMat(), chim);
  makeInstanced(new THREE.BoxGeometry(1.1, 1.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xffd48a }), win);
  // Kapelle: flache Stelle nahe der Strecke, Tür zur Strasse
  if (SCENE.ALP_CHAPEL) {
    const cand = alpineSpots(911, 1, { dMin: 15, dMax: 36, hMin: 10, hMax: 42, sMin: 0, sMax: 0.16, clear: 30, tries: 90000, keep: (x, z) => { const r = cityNearest(x, z, 40); return r.i >= 0 && Math.abs(wrapIdx(r.i)) > 90 && !inBridge(r.i) && !inTunnel(r.i); } });
    if (cand.length) {
      const p = cand[0], r = cityNearest(p.x, p.z, 40), f = frames[r.i], yaw = Math.atan2(f.P.x - p.x, f.P.z - p.z), q = yawQ(yaw);
      let g0 = Infinity; for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) g0 = Math.min(g0, alpineHeightAt(p.x + a * 3, p.z + b * 4));
      const y = g0 - 0.4, grp = new THREE.Group(); grp.position.set(p.x, y, p.z); grp.rotation.y = yaw;
      const add = (geo, mat, x, yy, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, yy, z); m.castShadow = true; grp.add(m); return m; };
      const white = lambert(0xe9e3d3);
      add(new THREE.BoxGeometry(5, 5, 7), white, 0, 2.5, 0);
      add(new THREE.BoxGeometry(5.4, 1.2, 7.4), alpStoneMat(), 0, 0.2, 0);
      const rf = add(alpinePrism(6.2, 8.2, 2.4), lambert(0x58402e), 0, 5.0, 0); rf.rotation.y = Math.PI / 2;
      add(new THREE.BoxGeometry(1.8, 3.6, 1.8), white, 0, 6.2, -2.4);
      add(new THREE.ConeGeometry(1.45, 2.8, 4), lambert(0x3e3a38), 0, 9.3, -2.4).rotation.y = Math.PI / 4;
      add(new THREE.BoxGeometry(0.1, 1.2, 0.1), lambert(0x222222), 0, 11.2, -2.4); add(new THREE.BoxGeometry(0.6, 0.1, 0.1), lambert(0x222222), 0, 11.5, -2.4);
      const door = add(new THREE.PlaneGeometry(1.5, 2.5), new THREE.MeshBasicMaterial({ color: 0x3a2412, side: THREE.DoubleSide }), 0, 1.55, 3.52);
      add(new THREE.PlaneGeometry(0.9, 1.1), new THREE.MeshBasicMaterial({ color: 0x9fc6ff, side: THREE.DoubleSide }), 1.8, 3.2, 3.52); add(new THREE.PlaneGeometry(0.9, 1.1), new THREE.MeshBasicMaterial({ color: 0x9fc6ff, side: THREE.DoubleSide }), -1.8, 3.2, 3.52);
      scene.add(grp);
    }
  }
}

// Wasserfall: Band, das dem steilsten Abstieg einer Felswand folgt, mit laufender Textur und Gischt
function createAlpineWaterfall() {
  const cand = alpineSpots(920, 1, { dMin: 34, dMax: 110, hMin: 55, hMax: 110, sMin: 0.95, sMax: 2.5, reg: false, tries: 90000, keep: (x, z) => z < -40 && x > 10 });
  if (!cand.length) return;
  let x = cand[0].x, z = cand[0].z; const pts = [];
  for (let k = 0; k < 70; k++) {
    const h = alpineHeightAt(x, z), e = 1.5;
    const gx = (alpineHeightAt(x + e, z) - alpineHeightAt(x - e, z)) / (2 * e), gz = (alpineHeightAt(x, z + e) - alpineHeightAt(x, z - e)) / (2 * e), gl = Math.hypot(gx, gz);
    pts.push([x, h, z]);
    if (gl < 0.28 || h < 20) break;
    x -= gx / gl * 1.6; z -= gz / gl * 1.6;
  }
  if (pts.length < 8) return;
  const pos = [], uv = [], idx = []; let acc = 0;
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[2] - a[2]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    if (i) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
    const w = 1.5 + i * 0.03;
    [-1, 1].forEach(sg => { const px = p[0] - dz * w * sg, pz = p[2] + dx * w * sg; pos.push(px, alpineHeightAt(px, pz) + 0.35, pz); uv.push(sg < 0 ? 0 : 1, acc / 9); });
    if (i) { const o = (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  alp.wfTex = makeAlpineWaterfallTexture();
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: alp.wfTex, color: 0xeaf4ff, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.renderOrder = 3; scene.add(m);
  const last = pts[pts.length - 1];
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: 0xe8f2ff, transparent: true, opacity: 0.55, depthWrite: false }));
  mist.scale.set(14, 9, 1); mist.position.set(last[0], last[1] + 3, last[2]); scene.add(mist);
  alp.wf = { top: pts[0], bottom: last };
}


// ─── Strecken-Details: Schilder, Schneestangen, Wimpelketten, Schneereste, Lawinengalerie ─────
function buildAlpineDetails() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), Yax = V3(0, 1, 0), start = Math.round(70 / DS);
  // frei = nicht in/nahe Brücke, Unterführung, Tunnel, Start, Sektor-Torbogen oder Tribüne (sonst stehen Schilder in Wänden)
  const free = i => trackFree(i, 10) && Math.abs(wrapIdx(i)) > start &&
    !gantrySpots.some(s => Math.abs(wrapIdx(i - s)) < 10) && !standSpots.some(s => Math.abs(wrapIdx(i - s.c)) < s.half + 8);
  const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l);
  const altText = y => { const a = Math.round((1900 + y * 14.5) / 10) * 10; return Math.floor(a / 1000) + '.' + String(a % 1000).padStart(3, '0') + ' m'; };
  const postMat = lambert(0x6a6e74);
  const posts = [], planes = [], used = [];                                    // used: bereits gesetzte Schilder (Index, Seite) -> kein Überlappen
  const spaceFor = (i, lat) => !used.some(u => Math.abs(wrapIdx(i - u.i)) < 24 && (u.lat > 0) === (lat > 0));
  const sign = (i, lat, kind, text, flip, size, faceBack) => {              // Schild auf Pfosten, dem Fahrer zugewandt
    const f = frames[mod(i)], b = wp(f, lat, -0.05), h = size + 1.0;
    used.push({ i: mod(i), lat });
    posts.push({ p: V3(b.x, b.y - 0.3 + h / 2, b.z), s: V3(1, h + 0.6, 1) });
    let tex = makeAlpineSignTexture(kind, text);
    if (flip) { tex = tex.clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 }));
    m.position.set(b.x, b.y + 0.7 + size / 2 + 0.3, b.z);
    m.rotation.y = Math.atan2(-f.Th.x, -f.Th.z);
    scene.add(m);
  };
  // Kehren: Spiegel-Masten, Pfeiltafeln mit Höhenmetern, Warnschild „Kehre“
  const apex = [];
  for (let i = 0; i < N; i++) {
    const k = Math.abs(frames[i].kappa); if (k < 0.045) continue;
    let top = true; for (let d = -40; d <= 40; d++) if (Math.abs(frames[mod(i + d)].kappa) > k + 1e-9) { top = false; break; }
    if (top && !apex.some(a => Math.abs(wrapIdx(i - a)) < 80)) apex.push(i);
  }
  const mirrors = [];
  apex.forEach(a => {
    const f = frames[a], outer = -Math.sign(f.kappa), latO = outer * (HALF_W + 3.45);
    sign(a, latO, 'arrow', altText(f.P.y), f.kappa > 0, 2.3);
    for (let d = 62; d <= 130; d += 2) {                 // Warnschild ~60 m vor der Kehre – auf freier, gerader Strecke (nie im Tunnel/Viadukt)
      const j = mod(a - d);
      if (free(j) && free(mod(j - 8)) && Math.abs(frames[j].kappa) < 0.012 && spaceFor(j, -(HALF_W + 3.3))) { sign(j, -(HALF_W + 3.3), 'hairpin', '', false, 2.1); break; }
    }
    // Spiegel-Mast am Kurvenausgang der Innenseite
    const g = frames[mod(a + 14)], bm = wp(g, -outer * (HALF_W + 3.2), -0.05);
    mirrors.push({ p: V3(bm.x, bm.y + 1.3, bm.z), s: V3(1, 1, 1) });
    const mm = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0xcfe4ff, side: THREE.DoubleSide }));
    mm.position.set(bm.x, bm.y + 2.7, bm.z); mm.rotation.y = Math.atan2(-g.Th.x * 0.5 - g.Lh.x * outer, -g.Th.z * 0.5 - g.Lh.z * outer); scene.add(mm);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 16), new THREE.MeshBasicMaterial({ color: 0xd8352b, side: THREE.DoubleSide })); rim.position.copy(mm.position); rim.rotation.copy(mm.rotation); scene.add(rim);
  });
  makeInstanced(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), postMat, mirrors.map(m => ({ p: V3(m.p.x, m.p.y + 0.0, m.p.z), s: V3(1, 1, 1) })));
  // Steinschlag-Warnungen an Abschnitten mit hohen Felswänden, Höhenmeter-Tafeln und Kilometersteine
  let rockSigns = 0;
  for (let i = start; i < N && rockSigns < 4; i += 7) {
    const f = frames[i]; if (!free(i) || !free(mod(i + 25)) || Math.abs(f.kappa) > 0.02) continue;
    const wall = gAt(f, 26) - f.P.y, wallR = gAt(f, -26) - f.P.y;
    if (Math.max(wall, wallR) < 10) continue;
    const rs = wall > wallR ? (HALF_W + 3.3) : -(HALF_W + 3.3);
    if (!spaceFor(i, rs)) continue;
    sign(i, rs, 'rock', '', false, 2.0); rockSigns++; i += 170;
  }
  [Math.round(N * 0.97), Math.round(N * 0.36), Math.round(N * 0.62)].forEach(i0 => {
    for (let d = 0; d < 160; d++) { const i = mod(i0 + d); if (free(i) && Math.abs(frames[i].kappa) < 0.01 && spaceFor(i, -(HALF_W + 3.3))) { sign(i, -(HALF_W + 3.3), 'height', altText(frames[i].P.y), false, 2.4); break; } }
  });
  for (let km = 1; km <= 5; km++) {
    const i0 = Math.round(km * 250 / DS);
    for (let d = 0; d < 60; d++) { const i = mod(i0 + d); if (free(i) && Math.abs(frames[i].kappa) < 0.03 && spaceFor(i, -(HALF_W + 3.2))) { const f = frames[i], b = wp(f, -(HALF_W + 3.2), -0.05); const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: makeAlpineSignTexture('km', String(km)), transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 })); m.position.set(b.x, b.y + 0.55, b.z); m.rotation.y = Math.atan2(-f.Th.x, -f.Th.z); scene.add(m); break; } }
  }
  makeInstanced(new THREE.CylinderGeometry(0.05, 0.06, 1, 6), postMat, posts);

  // Schneestangen (rot-weiss mit Reflektor) am Strassenrand
  if (SCENE.ALP_POLES) {
    const pole = [], band = [], refl = [], qy = f => yawQuat(f);
    for (let i = start; i < N; i += 12) {
      if (!free(i) || !free(mod(i + 6)) || !free(mod(i - 6))) continue;
      const f = frames[i], sg = (i / 12 | 0) % 2 ? 1 : -1, b = wp(f, sg * (HALF_W + 2.55), -0.05);
      pole.push({ p: V3(b.x, b.y + 1.1, b.z), q: qy(f) });
      band.push({ p: V3(b.x, b.y + 1.85, b.z), q: qy(f) }); band.push({ p: V3(b.x, b.y + 1.2, b.z), q: qy(f) });
      refl.push({ p: V3(b.x - f.Lh.x * sg * 0.0, b.y + 2.0, b.z), q: qy(f) });
    }
    makeInstanced(new THREE.CylinderGeometry(0.035, 0.04, 2.2, 5), lambert(0xf4f4f0), pole);
    makeInstanced(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 5), lambert(0xd8231f), band);
    makeInstanced(new THREE.BoxGeometry(0.1, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: 0xffb030 }), refl);
  }
  // Schneereste am Rand in hohen Lagen (nie auf der Fahrbahn)
  {
    const rn = mulberry32(515), items = [], tex = makeAlpineSnowPatchTexture(), rotX = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -Math.PI / 2);
    for (let t = 0; t < 900 && items.length < 150; t++) {
      const i = (rn() * N) | 0, f = frames[i]; if (!free(i) || f.P.y < 33) continue;
      const sg = rn() < 0.5 ? 1 : -1, lat = sg * (HALF_W + 1.5 + rn() * 1.4), w = 1.6 + rn() * 3.2;
      const q = frameQuat(f).multiply(rotX).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), rn() * 6.28));
      items.push({ p: wp(f, lat, -0.02), q, s: V3(w, w * (0.6 + rn() * 0.4), 1) });
    }
    const m = makeInstanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), items);
  }
  // Wimpelketten über der Passhöhe (flatternd)
  if (SCENE.ALP_PENNANTS) collectDeco(1, buildAlpinePennants);
  // Lawinengalerie auf der Abfahrt südlich der Brücke
  if (SCENE.ALP_GALLERY) buildAlpineGallery();
}

function buildAlpinePennants() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), cols = [0xd8352b, 0xf2c200, 0x2f7fd8, 0xf6f3ea, 0x3a9a48], gw = HALF_W + 3.0;
  const segs = [], pen = [], pol = [];
  [Math.round(24 / DS), -Math.round(30 / DS), -Math.round(56 / DS)].forEach((o, n) => {
    const f = frames[mod(o)], a = wp(f, gw, 0), b = wp(f, -gw, 0), hy = 8.6;
    [a, b].forEach(p => pol.push({ p: V3(p.x, p.y + hy / 2 - 0.3, p.z), s: V3(1, hy + 0.6, 1) }));
    const pt = u => { const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, y = a.y + (b.y - a.y) * u + hy - 1.7 * 4 * u * (1 - u); return V3(x, y, z); };
    const M = 18;
    for (let k = 0; k < M; k++) {
      const p0 = pt(k / M), p1 = pt((k + 1) / M), d = p1.clone().sub(p0), len = d.length(), mid = p0.clone().add(p1).multiplyScalar(0.5);
      segs.push({ p: mid, q: new THREE.Quaternion().setFromUnitVectors(V3(1, 0, 0), d.normalize()), s: V3(len, 0.04, 0.04) });
      if (k < M - 1) { const pp = pt((k + 0.5) / M + 0.5 / M); pen.push({ p: pp, q: yawQuat(f), s: V3(1, 1, 1), c: new THREE.Color(cols[(k + n) % cols.length]) }); }
    }
  });
  makeInstanced(new THREE.CylinderGeometry(0.08, 0.11, 1, 6), lambert(0x5a3c24), pol);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), lambert(0x222222), segs);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.3, 0, 0, 0.3, 0, 0, 0, -0.8, 0], 3));
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = crowdUni.time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n float ph = instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.9;\n transformed.z += sin(uTime * 7.0 + ph) * 0.14 * (-transformed.y);\n transformed.x += sin(uTime * 5.0 + ph * 1.7) * 0.05 * (-transformed.y);');
  };
  makeInstanced(tri, mat, pen);
}

// Lawinengalerie: offener Betonüberbau mit Stützen, nur wenn der Abschnitt frei und gerade ist
function buildAlpineGallery() {
  const c0 = mod(bridgeR.c + bridgeR.h + Math.round(14 / DS)), len = Math.round(34 / DS);
  for (let k = -4; k <= len + 4; k++) { const i = mod(c0 + k), f = frames[i]; if (inBridge(i) || inTunnel(i) || inUnder(i) || Math.abs(f.kappa) > 0.012) return; }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), f0 = frames[c0], mountainSide = gAt(f0, 16) > gAt(f0, -16) ? 1 : -1;
  const pil = [], slab = [], beam = [], wall = [], bays = 6, step = len / bays, lat = HALF_W + 2.4, hRoof = 6.3;
  for (let k = 0; k <= bays; k++) {
    const f = frames[mod(c0 + Math.round(k * step))];
    [-1, 1].forEach(sg => {
      const b = wp(f, sg * lat, -0.05), g = Math.min(gAt(f, sg * lat), b.y) - 0.4, top = b.y + hRoof, h = top - g;
      pil.push({ p: V3(b.x, g + h / 2, b.z), q: yawQuat(f), s: V3(0.9, h, 0.9) });
    });
    beam.push({ p: wp(f, 0, hRoof - 0.35), q: frameQuat(f), s: V3(2 * lat + 1.4, 0.7, 0.9) });
  }
  for (let k = 0; k < bays; k++) {
    const f = frames[mod(c0 + Math.round((k + 0.5) * step))];
    slab.push({ p: wp(f, 0, hRoof + 0.15), q: frameQuat(f), s: V3(2 * lat + 2.2, 0.4, step * DS + 0.2) });
    wall.push({ p: wp(f, mountainSide * (lat + 0.45), 0.55), q: frameQuat(f), s: V3(0.3, 1.1, step * DS - 0.9) });
  }
  const concrete = lambert(0xb8b5ac);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), concrete, pil);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), concrete, slab);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), lambert(0x9e9b92), beam);
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), concrete, wall);
  const sf = frames[mod(c0 - Math.round(8 / DS))], sb = wp(sf, -(HALF_W + 3.3), -0.05);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: makeSignTexture('LAWINENGALERIE', '#14456f', '#ffffff'), side: THREE.DoubleSide }));
  board.position.set(sb.x, sb.y + 2.2, sb.z); board.rotation.y = Math.atan2(-sf.Th.x, -sf.Th.z); scene.add(board);
}

// ─── Lebendiges: Seilbahn, Schnee, Rauch, Qualität ───────────────────────────────
function createAlpineLife() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // Rauch aus den Schornsteinen
  const pts = [], ph = [], rn = mulberry32(930);
  alp.chalets.forEach(c => { if (!c.chim) return; for (let k = 0; k < 6; k++) { pts.push(c.chim.x, c.chim.y, c.chim.z); ph.push(k / 6 + rn() * 0.05); } });
  if (pts.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: crowdUni.time },
      vertexShader: 'uniform float uTime; attribute float aPh; varying float vA;\nvoid main(){ float t = fract(uTime * 0.085 + aPh); vec3 p = position + vec3(t * t * 7.0, t * 11.0, t * t * 2.5);\n vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (3.0 + t * 9.0) * (300.0 / -mv.z); vA = (1.0 - t) * smoothstep(0.0, 0.08, t) * 0.5; }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.93, 0.91, 0.89), smoothstep(0.5, 0.05, d) * vA); }',
      transparent: true, depthWrite: false
    });
    alp.smoke = new THREE.Points(g, mat); alp.smoke.frustumCulled = false; scene.add(alp.smoke);
  }
  // Schneeflocken/Staub um die Kamera (in der Höhe, sehr dezent)
  if (SCENE.ALP_SNOWFALL) {
    const n = SCENE.ALP_SNOWFALL, arr = [], aph = [];
    for (let i = 0; i < n; i++) { arr.push(Math.random() * 60, Math.random() * 30, Math.random() * 60); aph.push(Math.random()); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.setAttribute('aPh', new THREE.Float32BufferAttribute(aph, 1));
    alp.snowUni = { uTime: crowdUni.time, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: alp.snowUni,
      vertexShader: 'uniform float uTime; uniform vec3 uCam; attribute float aPh; varying float vA;\nvoid main(){ vec3 r = position - uCam + vec3(30.0, 15.0, 30.0);\n r.y -= uTime * (0.9 + aPh * 0.6); r.x += sin(uTime * 0.7 + aPh * 6.28) * 1.2;\n r = mod(r, vec3(60.0, 30.0, 60.0)) - vec3(30.0, 15.0, 30.0);\n vec4 mv = viewMatrix * vec4(uCam + r, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (0.14 + aPh * 0.12) * (520.0 / -mv.z);\n vA = smoothstep(32.0, 6.0, length(r)); }',
      fragmentShader: 'uniform float uAlpha; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.1, d) * vA * uAlpha); }',
      transparent: true, depthWrite: false
    });
    alp.snow = new THREE.Points(g, mat); alp.snow.frustumCulled = false; scene.add(alp.snow);
  }
  if (SCENE.ALP_CABLEWAY) buildAlpineCableway();
  applyAlpineQuality(quality);
}

// Seilbahn über der Bergflanke: zwei Seile, Pylonen, Stationen, fahrende Gondeln (animiert)
function buildAlpineCableway() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const A = { x: 150, z: -168 }, B = { x: 78, z: -300 };
  const hA = alpineHeightAt(A.x, A.z), hB = alpineHeightAt(B.x, B.z);
  let yA = hA + 10, yB = hB + 10, worst = 0;                           // Seil muss überall mindestens 9 m über dem Gelände laufen
  for (let t = 0; t <= 1; t += 0.02) { const g = alpineHeightAt(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t), l = yA + (yB - yA) * t; worst = Math.max(worst, g + 9 - l); }
  yA += worst; yB += worst;
  const ax = B.x - A.x, az = B.z - A.z, L = Math.hypot(ax, az), dx = ax / L, dz = az / L, ox = -dz * 2.6, oz = dx * 2.6;
  const lineAt = (t, s) => V3(A.x + ax * t + ox * s, yA + (yB - yA) * t - 3.2 * 4 * t * (1 - t), A.z + az * t + oz * s);
  const segs = [], pyl = [], ST = 24;
  [-1, 1].forEach(s => { for (let k = 0; k < ST; k++) { const p0 = lineAt(k / ST, s), p1 = lineAt((k + 1) / ST, s), d = p1.clone().sub(p0), len = d.length(); segs.push({ p: p0.clone().add(p1).multiplyScalar(0.5), q: new THREE.Quaternion().setFromUnitVectors(V3(1, 0, 0), d.normalize()), s: V3(len, 0.07, 0.07) }); } });
  makeInstanced(new THREE.BoxGeometry(1, 1, 1), lambert(0x2a2a2e), segs);
  [0, 0.34, 0.67, 1].forEach(t => {
    const px = A.x + ax * t, pz = A.z + az * t, g = alpineHeightAt(px, pz) - 0.6, top = yA + (yB - yA) * t - 3.2 * 4 * t * (1 - t) + 0.9, h = top - g, yaw = Math.atan2(dx, dz);
    const grp = new THREE.Group(); grp.position.set(px, g, pz); grp.rotation.y = yaw;
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; grp.add(m); };
    const steel = lambert(0x8a9096);
    if (t === 0 || t === 1) {                                              // Stationen: Steinsockel, Holzhaus, Dach
      add(new THREE.BoxGeometry(9, 3, 7), alpStoneMat(), 0, 1.2, 0);
      add(alpineBoxGeoWood(8, 1, 6), alpWoodMat(), 0, 5.2, 0); grp.children[grp.children.length - 1].scale.y = 4;
      add(alpinePrism(7.6, 9, 1.8), lambert(0x4e3220), 0, 7.2, 0);
      add(new THREE.CylinderGeometry(1.6, 1.6, 0.5, 14), steel, 0, h > 12 ? 8.2 : 8.2, 0);
    } else {
      add(new THREE.CylinderGeometry(0.28, 0.45, h, 6), steel, 0, h / 2, 0);
      add(new THREE.BoxGeometry(6.4, 0.35, 0.5), steel, 0, h - 0.6, 0);
    }
    scene.add(grp);
  });
  alp.cable = { A, B, yA, yB, ox, oz, ax, az, dx, dz, lineAt };
  const n = 6; alp.gondN = n;
  alp.gond = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 1.4, 1.4), lambert(0xffffff), n * 2);
  alp.gondRoof = new THREE.InstancedMesh(new THREE.BoxGeometry(2.0, 0.22, 1.7), lambert(0x33261a), n * 2);
  alp.gondRod = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4), lambert(0x333333), n * 2);
  const cols = [0xd8352b, 0x2f7fd8, 0xf2c200, 0x3a9a48, 0xffffff, 0xd8352b];
  for (let i = 0; i < n * 2; i++) alp.gond.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  [alp.gond, alp.gondRoof, alp.gondRod].forEach(m => { m.frustumCulled = false; scene.add(m); });
  alp.gondT = 0;
}
const _gM = new THREE.Matrix4(), _gP = new THREE.Vector3(), _gS = new THREE.Vector3(1, 1, 1), _gQ = new THREE.Quaternion(), _gE = new THREE.Euler();
function updateAlpineLife(dt) {
  if (alp.snowUni) {
    alp.snowUni.uCam.value.copy(camera.position);
    alp.snowUni.uAlpha.value = (alp.q === 0 ? 0 : (alp.q === 1 ? 0.45 : 0.7)) * smooth01(24, 40, camera.position.y);
  }
  if (alp.seaTex) alp.seaTex.offset.x += dt * 0.0016;
  if (alp.wfTex) alp.wfTex.offset.y -= dt * 0.9;
  if (alp.cable) {
    alp.gondT = (alp.gondT + dt * 0.011) % 1;
    const n = alp.gondN, c = alp.cable, yaw = Math.atan2(c.dx, c.dz);
    for (let side = 0; side < 2; side++) for (let k = 0; k < n; k++) {
      const idx = side * n + k, vis = alp.q === 0 ? k < 1 : alp.q === 1 ? k < 3 : true;
      let t = ((alp.gondT + k / n) % 1); if (side) t = 1 - t;                   // ein Strang rauf, einer runter
      const p = c.lineAt(t, side ? 1 : -1);
      _gQ.setFromAxisAngle(_gE.set(0, 1, 0), 0).setFromEuler(_gE.set(Math.sin(performance.now() * 0.0006 + k) * 0.05, yaw, 0));
      const sc = vis ? 1 : 0; _gS.set(sc, sc, sc);
      _gP.set(p.x, p.y - 2.5, p.z); _gM.compose(_gP, _gQ, _gS); alp.gond.setMatrixAt(idx, _gM);
      _gP.set(p.x, p.y - 1.72, p.z); _gM.compose(_gP, _gQ, _gS); alp.gondRoof.setMatrixAt(idx, _gM);
      _gP.set(p.x, p.y - 0.9, p.z); _gM.compose(_gP, _gQ, _gS); alp.gondRod.setMatrixAt(idx, _gM);
    }
    alp.gond.instanceMatrix.needsUpdate = true; alp.gondRoof.instanceMatrix.needsUpdate = true; alp.gondRod.instanceMatrix.needsUpdate = true;
    if (alp.gond.instanceColor) alp.gond.instanceColor.needsUpdate = true;
  }
}
function applyAlpineQuality(q) {
  alp.q = q;
  alp.sea.forEach((m, i) => { m.visible = q >= 2 || i === 1 || i === 3 || i === 4; });
  if (alp.snow) alp.snow.visible = q > 0;
  if (alp.smoke) alp.smoke.visible = q > 0;
  if (alp.wf) { /* Wasserfall bleibt immer an (günstig) */ }
}


// ─── Kollision / Fahrbahnerkennung ────────────────────────────────────────────
// Nächster Punkt im Suchfenster um den letzten Index – inkl. Höhe, so dass an der
// Kreuzung nie die falsche Strecke (oben/unten) erkannt wird.
function locate(x, z, y, hint) {
  let best = Infinity, bi = hint;
  for (let o = -SEARCH_W; o <= SEARCH_W; o++) {
    const i = mod(hint + o);
    const p = frames[i].P;
    const dx = x - p.x, dz = z - p.z, dy = y - p.y;
    const c = dx * dx + dz * dz + 6 * dy * dy;
    if (c < best) { best = c; bi = i; }
  }
  return bi;
}

function project(x, z, bi) {
  const f0 = frames[bi];
  const along = (x - f0.P.x) * f0.Th.x + (z - f0.P.z) * f0.Th.z;
  let fa, fb, t;
  if (along >= 0) { fa = f0; fb = frames[mod(bi + 1)]; t = clamp(along / DS, 0, 1); }
  else { fa = frames[mod(bi - 1)]; fb = f0; t = clamp(1 + along / DS, 0, 1); }
  const px = fa.P.x + (fb.P.x - fa.P.x) * t;
  const py = fa.P.y + (fb.P.y - fa.P.y) * t;
  const pz = fa.P.z + (fb.P.z - fa.P.z) * t;
  let thx = fa.Th.x + (fb.Th.x - fa.Th.x) * t;
  let thz = fa.Th.z + (fb.Th.z - fa.Th.z) * t;
  const l = Math.hypot(thx, thz) || 1;
  thx /= l; thz /= l;
  trk.i = bi;
  trk.thx = thx; trk.thz = thz;
  trk.lhx = thz; trk.lhz = -thx;
  trk.d = (x - px) * trk.lhx + (z - pz) * trk.lhz;
  trk.py = py;
  trk.tanB = Math.tan(fa.bank + (fb.bank - fa.bank) * t);
  trk.up.copy(fa.Up).lerp(fb.Up, t).normalize();
}

function refreshTrack() {
  cs.idx = locate(cs.x, cs.z, cs.y, cs.idx);
  project(cs.x, cs.z, cs.idx);
}

// ─── Physik ───────────────────────────────────────────────────────────────────
// Feste Hindernisse (Brückenpfeiler): Auto wird herausgeschoben, frontaler Aufprall bremst fast bis zum Stillstand,
// streifendes Anfahren bremst nur leicht. Oben auf der Brücke (cs.y über der Pfeilerkante) gilt nichts davon.
function collideSolids(sp) {
  for (let n = 0; n < solids.length; n++) {
    const o = solids[n];
    if (cs.y > o.top - 0.6) continue;
    const dx = cs.x - o.x, dz = cs.z - o.z;
    if (dx * dx + dz * dz > o.r2) continue;
    const lx = dx * o.lhx + dz * o.lhz, ld = dx * o.thx + dz * o.thz;
    const vx = lx - clamp(lx, -o.hw, o.hw), vd = ld - clamp(ld, -o.hd, o.hd), d2 = vx * vx + vd * vd;
    if (d2 >= CAR_R * CAR_R) continue;
    let nl, nd, pen;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); nl = vx / d; nd = vd / d; pen = CAR_R - d; }
    else {                                                              // Automitte im Pfeiler: auf kürzestem Weg heraus
      const pl = o.hw - Math.abs(lx), pd = o.hd - Math.abs(ld);
      if (pl < pd) { nl = Math.sign(lx) || 1; nd = 0; pen = pl + CAR_R; } else { nl = 0; nd = Math.sign(ld) || 1; pen = pd + CAR_R; }
    }
    const nx = nl * o.lhx + nd * o.thx, nz = nl * o.lhz + nd * o.thz;
    cs.x += nx * pen; cs.z += nz * pen;
    const dir = sp >= 0 ? cs.angle : cs.angle + Math.PI;
    const into = -(Math.sin(dir) * nx + Math.cos(dir) * nz);          // 1 = frontal gegen die Fläche, 0 = streifend
    if (into > 0) sp *= 1 - Math.min(1, into * 1.05) * 0.95;
  }
  return sp;
}

function updatePhysics(dt, controls) {
  const up    = controls && act('up');
  const down  = controls && act('down');
  const left  = controls && act('left');
  const right = controls && act('right');

  // Boost (Shift): verbraucht Energie, lädt nach kurzer Pause wieder auf
  const wantBoost = controls && act('boost') && !down && (up || cs.speed > 5);
  if (boost.locked && boost.energy >= BOOST_MIN_START) boost.locked = false;
  boost.on = !!wantBoost && !boost.locked && boost.energy > 0;
  if (boost.on) {
    boost.energy = Math.max(0, boost.energy - BOOST_DRAIN * dt);
    boost.idle = 0;
    if (boost.energy <= 0) { boost.locked = true; boost.on = false; }
  } else {
    boost.idle += dt;
    if (boost.idle > BOOST_REGEN_DELAY) boost.energy = Math.min(1, boost.energy + BOOST_REGEN * dt);
  }

  let sp = cs.speed;
  cs.braking = !!down && sp > 0.5;
  if (boost.on) sp = Math.min(sp + (ACCEL + BOOST_ACCEL) * dt, BOOST_SPEED);
  else if (up) sp = Math.min(sp + ACCEL * (1 - 0.35 * Math.max(0, sp) / MAX_SPEED) * dt, Math.max(sp, MAX_SPEED));
  else if (down) sp = Math.max(sp - BRAKE * dt, -REVERSE_MAX);
  else sp *= Math.exp(-DRAG * dt);
  if (!boost.on && sp > MAX_SPEED) sp = Math.max(MAX_SPEED, sp - 14 * dt);   // Boost klingt sanft aus
  if (!up && !down && Math.abs(sp) < 0.1) sp = 0;

  const steerIn = (left ? 1 : 0) - (right ? 1 : 0);
  cs.steer += (steerIn - cs.steer) * (1 - Math.exp(-9 * dt));
  const sa = Math.abs(sp);
  const rate = TURN_RATE * clamp(sa / 9, 0, 1) * (1 - 0.25 * sa / MAX_SPEED);
  cs.angle = wrapAngle(cs.angle + cs.steer * rate * (sp >= 0 ? 1 : -1) * dt);

  cs.x += Math.sin(cs.angle) * sp * dt;
  cs.z += Math.cos(cs.angle) * sp * dt;
  sp = collideSolids(sp);

  // Fahrbahn: nächster Kurvenpunkt (inkl. Höhe), sanft zurückdrücken, Tempoverlust
  cs.idx = locate(cs.x, cs.z, cs.y, cs.idx);
  project(cs.x, cs.z, cs.idx);
  let d = trk.d;
  if (Math.abs(d) > WALL_LIMIT) {
    const over = Math.abs(d) - WALL_LIMIT;
    const sgn = Math.sign(d);
    cs.x -= sgn * over * trk.lhx;
    cs.z -= sgn * over * trk.lhz;
    d = sgn * WALL_LIMIT;
    const tAng = Math.atan2(trk.thx, trk.thz);
    // Fahrtrichtung (Geschwindigkeitsvektor) zur nächstliegenden Streckenrichtung ausrichten
    const velAng = sp >= 0 ? cs.angle : cs.angle + Math.PI;
    const target = Math.abs(wrapAngle(tAng - velAng)) <= Math.PI / 2 ? tAng : tAng + Math.PI;
    const diff = wrapAngle(target - velAng);
    sp *= Math.exp(-(1.0 + 3.5 * Math.abs(Math.sin(diff))) * dt);
    cs.angle = wrapAngle(cs.angle + diff * Math.min(1, 3 * dt));
  }
  cs.speed = sp;

  // Höhe der Fahrbahn (Brücke, Hügel, Kurvenneigung) – kein Durchfallen
  const roadY = trk.py - d * trk.tanB;
  cs.y += (roadY - cs.y) * (1 - Math.exp(-25 * dt));

  // Falsche Richtung?
  const dirDot = (Math.sin(cs.angle) * trk.thx + Math.cos(cs.angle) * trk.thz) * (sp >= 0 ? 1 : -1);
  if (dirDot < -0.3 && Math.abs(sp) > 5) race.wrongTimer += dt; else race.wrongTimer = 0;
}

// Checkpoints: nur Vorwärts-Fortschritt zählt (maxProgress), Abkürzen/Rückwärts bringt nichts
function handleProgress(now) {
  let dI = cs.idx - race.prevIdx;
  if (dI > N / 2) dI -= N; else if (dI < -N / 2) dI += N;
  race.prevIdx = cs.idx;
  race.progress += dI;
  if (race.progress > race.maxProgress) race.maxProgress = race.progress;
  const step = N / CP_N;
  while (race.maxProgress >= (race.cp + 1) * step - 1e-9) {
    race.cp++;
    if (race.cp % CP_N === 0 && onLapComplete(race.cp / CP_N, now)) return;
  }
}

function raceTime(now) { return now - race.startWall - race.pausedAccum; }

function onLapComplete(n, now) {
  const t = raceTime(now);
  const lapTime = t - race.lapStart;
  race.lapStart = t;
  race.laps.push(lapTime);
  const prevBest = best.lap;                                   // für Delta / Bestrunden-Meldung
  const isBest = prevBest !== null && lapTime < prevBest;
  if (best.lap === null || lapTime < best.lap) { best.lap = lapTime; race.lapRecord = true; saveRecords(best); updateBestDisplay(); }
  const delta = prevBest === null ? null : lapTime - prevBest;
  setText($('lastLapDisplay'), 'Letzte: ' + formatTime(lapTime));
  showLapDelta(delta);
  if (n >= TOTAL_LAPS) { finishRace(t); return true; }
  sfxLap(isBest);
  setLapUI(n + 1);
  if (isBest) showToast('Bestrunde: ' + formatTime(lapTime), 'best', delta);
  else showToast('Runde ' + n + ': ' + formatTime(lapTime), 'lap', delta);
  return false;
}

function finishRace(t) {
  state = 'finished';
  race.finalTime = t;
  let newBest = false;
  if (best.total === null || t < best.total) { best.total = t; newBest = true; }
  sfxFinish(newBest || race.lapRecord);
  saveRecords(best);
  updateBestDisplay();
  setText($('finalTime'), formatTime(t));
  const fb = $('finalBest');
  const recs = [];
  if (newBest) recs.push('Neue Bestzeit!');
  if (race.lapRecord) recs.push('Neue Bestrunde!');
  setText(fb, recs.length ? '🏆 ' + recs.join(' · ') : 'Bestzeit: ' + formatTime(best.total));
  fb.classList.toggle('newbest', recs.length > 0);

  // Tabelle der Rundenzeiten, schnellste Runde hervorgehoben
  const list = $('finalLaps');
  list.textContent = '';
  const fastest = Math.min.apply(null, race.laps);
  race.laps.forEach((l, i) => {
    const row = document.createElement('div');
    row.className = 'lap-row' + (l === fastest ? ' fastest' : '');
    const a = document.createElement('span'); a.textContent = 'Runde ' + (i + 1);
    const tag = document.createElement('span'); tag.className = 'lap-tag'; tag.textContent = l === fastest ? '⚡ schnellste' : '';
    const b = document.createElement('span'); b.textContent = formatTime(l);
    row.appendChild(a); row.appendChild(tag); row.appendChild(b);
    list.appendChild(row);
  });

  // Konfetti nur bei neuer Bestzeit (reine CSS-Animation)
  const cf = $('confetti');
  cf.textContent = '';
  if (recs.length) {
    for (let i = 0; i < 36; i++) {
      const c = document.createElement('i');
      c.style.left = (Math.random() * 100).toFixed(1) + '%';
      c.style.background = 'hsl(' + ((Math.random() * 360) | 0) + ',90%,60%)';
      c.style.setProperty('--d', (2.4 + Math.random() * 2.2).toFixed(2) + 's');
      c.style.setProperty('--dl', (-Math.random() * 4).toFixed(2) + 's');
      c.style.setProperty('--r', (180 + ((Math.random() * 540) | 0)) + 'deg');
      cf.appendChild(c);
    }
  }
  $('finishOverlay').classList.remove('hidden');
  $('wrongWay').classList.add('hidden');
}

// ─── Spielsteuerung ───────────────────────────────────────────────────────────
function clearKeys() { for (const k in keys) keys[k] = false; }

function resetRace() {
  clearKeys();
  const gap = Math.round(START_GAP_M / DS);
  const i0 = mod(-gap);
  const f = frames[i0];
  cs.x = f.P.x; cs.z = f.P.z; cs.y = f.P.y;
  cs.angle = Math.atan2(f.Th.x, f.Th.z);
  cs.speed = 0; cs.steer = 0; cs.idx = i0; cs.braking = false; cs.pitch = 0;
  boost.energy = 1; boost.on = false; boost.locked = false; boost.idle = 0;
  race.progress = -gap; race.maxProgress = -gap; race.prevIdx = i0; race.cp = 0;
  race.lapStart = 0; race.laps.length = 0; race.wrongTimer = 0;
  race.pausedAccum = 0; race.goHideAt = 0; race.finalTime = 0; race.lapRecord = false;
  refreshTrack();
  carUp.copy(trk.up);
  exhaustPool.forEach(p => { p.visible = false; p.userData.life = 0; });
  setLapUI(1);
  setText($('lastLapDisplay'), 'Letzte: –');
  setText($('timeDisplay'), '0:00.0');
  $('wrongWay').classList.add('hidden');
  $('lapDelta').classList.remove('show');
  resetToasts();
  clearSkids();
  updateVisuals(0, true);
}

function startCountdown() {
  audioInit();                       // Nutzeraktion (Klick): AudioContext erstellen bzw. fortsetzen
  resetRace();
  menu3d.stop();                     // Showroom beenden und freigeben, damit das Spiel nicht langsamer wird
  $('overlay').classList.add('hidden');
  $('finishOverlay').classList.add('hidden');
  $('pauseOverlay').classList.add('hidden');
  state = 'countdown';
  race.cdStart = performance.now();
  lastCdText = '';
}

function pauseGame() {
  if (state !== 'racing') return;
  state = 'paused';
  race.pauseStart = performance.now();
  clearKeys();
  setText($('pauseLap'), $('lapDisplay').textContent);                       // Zwischenstand im Pause-Menü
  setText($('pauseTime'), formatTime(race.pauseStart - race.startWall - race.pausedAccum));
  setText($('pauseBest'), best.total === null ? '–' : formatTime(best.total));
  setText($('pauseBestLap'), best.lap === null ? '–' : formatTime(best.lap));
  $('pauseOverlay').classList.remove('hidden');
}
function resumeGame() {
  if (state !== 'paused') return;
  audioResume();
  race.pausedAccum += performance.now() - race.pauseStart;
  state = 'racing';
  lastFrame = performance.now();
  $('pauseOverlay').classList.add('hidden');
}

function setCountdownText(text) {
  if (text === lastCdText) return;
  lastCdText = text;
  sfxCountdown(text);
  const el = $('countdown'), num = $('cdNum');
  setText(num, text);
  // Startampel: 3 -> 1 Licht rot, 2 -> 2, 1 -> 3, GO! -> alle grün
  $('tlights').className = text === 'GO!' ? 'go' : 'n' + (4 - (parseInt(text, 10) || 3));
  el.classList.remove('hidden');
  num.classList.remove('pop');
  void num.offsetWidth;
  num.classList.add('pop');
}

function updateCountdown(now) {
  const e = now - race.cdStart;
  const stepIdx = Math.floor(e / COUNTDOWN_STEP);
  if (stepIdx < 3) {
    setCountdownText(String(3 - stepIdx));
  } else {
    state = 'racing';
    race.startWall = race.cdStart + 3 * COUNTDOWN_STEP;
    race.pausedAccum = 0;
    race.lapStart = 0;
    setCountdownText('GO!');
    race.goHideAt = now + 800;
  }
}

// ─── HUD-Hilfen: Runden-Segmente, Delta, Toast-Queue, Minimap ───────────────
function fmtDelta(ms) { return (ms < 0 ? '−' : '+') + (Math.abs(ms) / 1000).toFixed(2) + ' s'; }

function buildLapDots() {
  const box = $('lapDots');
  box.textContent = '';
  for (let i = 0; i < TOTAL_LAPS; i++) box.appendChild(document.createElement('i'));
}
function setLapUI(n) {                       // n = aktuelle Runde (1-basiert)
  setText($('lapDisplay'), n + ' / ' + TOTAL_LAPS);
  const dots = $('lapDots').children;
  for (let i = 0; i < dots.length; i++) dots[i].className = i < n - 1 ? 'done' : (i === n - 1 ? 'cur' : '');
}
function showLapDelta(ms) {                  // Delta zur bisherigen Bestrunde (grün = schneller)
  const el = $('lapDelta');
  el.classList.remove('show');
  if (ms === null) return;
  setText(el, fmtDelta(ms));
  el.classList.toggle('faster', ms < 0);
  el.classList.toggle('slower', ms >= 0);
  void el.offsetWidth;
  el.classList.add('show');
}

const TOAST_ICONS = { lap: '⏱️', best: '🏆', boost: '🔥' };
function showToast(text, kind, delta) {      // kind: 'lap' | 'best' | 'boost'
  kind = kind || 'lap';
  if (toastCur && toastCur.text === text && toastCur.kind === kind) return;
  if (toastQueue.some(q => q.text === text && q.kind === kind)) return;
  toastQueue.push({ text, kind, delta: delta === undefined ? null : delta });
  if (toastQueue.length > 3) toastQueue.shift();
  if (toastPhase === 0) startNextToast();
}
function startNextToast() {
  const q = toastQueue.shift();
  if (!q) { toastPhase = 0; toastCur = null; return; }
  toastCur = q;
  const t = $('toast');
  t.className = 'kind-' + q.kind;            // entfernt hidden/out
  $('toastIcon').textContent = TOAST_ICONS[q.kind] || '⏱️';
  $('toastText').textContent = q.text;
  const d = $('toastDelta');
  if (q.delta === null) { d.textContent = ''; d.className = ''; }
  else { d.textContent = fmtDelta(q.delta); d.className = q.delta < 0 ? 'faster' : 'slower'; }
  void t.offsetWidth;
  toastPhase = 1;
  toastHideAt = performance.now() + 2500;
}
function updateToasts(now) {
  if (toastPhase === 0 || now < toastHideAt) return;
  const t = $('toast');
  if (toastPhase === 1) { t.classList.add('out'); toastPhase = 2; toastHideAt = now + 260; }
  else { t.classList.add('hidden'); toastPhase = 0; toastCur = null; if (toastQueue.length) startNextToast(); }
}
function resetToasts() {
  toastQueue.length = 0; toastPhase = 0; toastCur = null; toastHideAt = 0;
  $('toast').classList.add('hidden');
}

// Minimap: Streckenumriss einmal als SVG-Pfad (Weltkoordinaten), pro Frame nur das Auto-Dreieck bewegen
function buildMinimap() {
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < N; i++) {
    const p = frames[i].P;
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  const pad = 14;
  $('minimap').setAttribute('viewBox', (minX - pad) + ' ' + (minZ - pad) + ' ' + (maxX - minX + 2 * pad) + ' ' + (maxZ - minZ + 2 * pad));
  let d = '';
  for (let i = 0; i < N; i += 8) { const p = frames[i].P; d += (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.z.toFixed(1); }
  d += 'Z';
  $('mapTrack').setAttribute('d', d);
  $('mapTrackOuter').setAttribute('d', d);
  const f0 = frames[0], hw = HALF_W + 3, st = $('mapStart');          // Start/Ziel-Linie
  st.setAttribute('x1', (f0.P.x + f0.Lh.x * hw).toFixed(1)); st.setAttribute('y1', (f0.P.z + f0.Lh.z * hw).toFixed(1));
  st.setAttribute('x2', (f0.P.x - f0.Lh.x * hw).toFixed(1)); st.setAttribute('y2', (f0.P.z - f0.Lh.z * hw).toFixed(1));
}

function updateBestDisplay() {
  setText($('bestDisplay'), 'Best: ' + (best.lap === null ? '–' : formatTime(best.lap)));
  setText($('menuBestTotal'), best.total === null ? '–' : formatTime(best.total));
  setText($('menuBestLap'), best.lap === null ? '–' : formatTime(best.lap));
  setText($('pauseBest'), best.total === null ? '–' : formatTime(best.total));
  setText($('pauseBestLap'), best.lap === null ? '–' : formatTime(best.lap));
}

// ─── Abgas ────────────────────────────────────────────────────────────────────
const _ev = new THREE.Vector3();
function spawnExhaust() {
  const p = exhaustPool[exhaustNext];
  exhaustNext = (exhaustNext + 1) % exhaustPool.length;
  car.updateMatrixWorld(true);
  _ev.set((Math.random() < 0.5 ? -0.12 : 0.12), 0.62, -1.02);
  car.localToWorld(_ev);
  p.position.copy(_ev);
  const fx = Math.sin(cs.angle), fz = Math.cos(cs.angle);
  p.userData.vel.set(-fx * 2 + (Math.random() - 0.5), 0.8 + Math.random() * 0.8, -fz * 2 + (Math.random() - 0.5));
  p.userData.life = 1;
  p.material.color.setHex(boost.on ? 0xffa03a : 0xff6a2a);
  p.scale.setScalar(1);
  p.visible = true;
}

function updateExhaust(dt, emit) {
  if (emit) {
    exhaustTimer += dt;
    const step = boost.on ? 0.012 : 0.03;
    while (exhaustTimer > step) { exhaustTimer -= step; spawnExhaust(); }
  }
  for (let i = 0; i < exhaustPool.length; i++) {
    const p = exhaustPool[i];
    if (!p.visible) continue;
    p.userData.life -= dt / 0.55;
    if (p.userData.life <= 0) { p.visible = false; continue; }
    p.position.addScaledVector(p.userData.vel, dt);
    p.material.opacity = p.userData.life * 0.5;
    p.scale.setScalar(1 + (1 - p.userData.life) * 2.5);
  }
}

// ─── Visuals: Auto, Kamera, Lichter ───────────────────────────────────────────
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _f = new THREE.Vector3(), _l = new THREE.Vector3();
const _e = new THREE.Euler(), _qr = new THREE.Quaternion();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camAngle = 0, camDist = 5.6;

function updateCarMesh(dt, snap) {
  carUp.lerp(trk.up, snap ? 1 : 1 - Math.exp(-10 * dt)).normalize();
  _f.set(Math.sin(cs.angle), 0, Math.cos(cs.angle));
  _f.addScaledVector(carUp, -_f.dot(carUp)).normalize();
  _l.crossVectors(carUp, _f).normalize();
  _m.makeBasis(_l, carUp, _f);
  _q.setFromRotationMatrix(_m);
  // Karosserie: Rollen in Kurven, Nicken beim Bremsen (vor) und Boosten (zurück)
  const pitchT = boost.on ? -0.035 : (cs.braking ? 0.035 : 0);
  cs.pitch += (pitchT - cs.pitch) * (snap ? 1 : 1 - Math.exp(-8 * dt));
  _e.set(cs.pitch, 0, cs.steer * 0.07 * clamp(Math.abs(cs.speed) / MAX_SPEED, 0, 1));
  _q.multiply(_qr.setFromEuler(_e));
  if (snap) car.quaternion.copy(_q); else car.quaternion.slerp(_q, 1 - Math.exp(-16 * dt));
  car.position.set(cs.x, cs.y + 0.06, cs.z);
  const spin = cs.speed * dt / (0.26 * 1.3);
  for (let i = 0; i < carWheels.length; i++) carWheels[i].rotation.x += spin;
  for (let i = 0; i < carSteerPivots.length; i++) carSteerPivots[i].rotation.y = cs.steer * 0.32;   // Vorderräder lenken (nur Optik)
}

function camChase(dt, snap) {
  camAngle = wrapAngle(camAngle + wrapAngle(cs.angle - camAngle) * (snap ? 1 : 1 - Math.exp(-5 * dt)));
  const k2 = snap ? 1 : 1 - Math.exp(-11 * dt);
  camDist += ((boost.on ? 6.6 : 5.6) - camDist) * (snap ? 1 : 1 - Math.exp(-4 * dt));
  const tx = cs.x - Math.sin(camAngle) * camDist;
  const tz = cs.z - Math.cos(camAngle) * camDist;
  const ty = cs.y + 2.9;
  camPos.x += (tx - camPos.x) * k2;
  camPos.y += (ty - camPos.y) * k2;
  camPos.z += (tz - camPos.z) * k2;
  camera.position.copy(camPos);
  // leichter Kamera-Shake bei hohem Tempo und beim Boost (nur Offset, camPos bleibt sauber)
  if (!snap && quality > 0 && FX.SHAKE > 0) {
    const fr = clamp(Math.abs(cs.speed) / MAX_SPEED, 0, 1.3);
    const amp = FX.SHAKE * (quality > 1 ? 1 : 0.5) * (clamp((fr - 0.7) * 0.05, 0, 0.02) + (boost.on ? 0.035 : 0));
    if (amp > 0) {
      const t = fxClock;
      camera.position.x += (Math.sin(t * 61.0) + Math.sin(t * 37.0 + 1.7)) * 0.5 * amp;
      camera.position.y += (Math.sin(t * 53.0 + 0.6) + Math.sin(t * 29.0 + 2.9)) * 0.5 * amp;
      camera.position.z += Math.sin(t * 43.0 + 4.1) * 0.5 * amp;
    }
  }
  const k3 = snap ? 1 : 1 - Math.exp(-14 * dt);
  camLook.x += (cs.x + Math.sin(camAngle) * 7 - camLook.x) * k3;
  camLook.y += (cs.y + 0.9 - camLook.y) * k3;
  camLook.z += (cs.z + Math.cos(camAngle) * 7 - camLook.z) * k3;
  camera.lookAt(camLook);

  // FOV: weich zum Zielwert, dazu ein kurzer Stoss beim Start des Boosts
  const tf = 62 + fovAspectBonus + 14 * clamp(Math.abs(cs.speed) / MAX_SPEED, 0, 1) + (boost.on ? 8 : 0);
  camFovBase += (tf - camFovBase) * (snap ? 1 : 1 - Math.exp(-4 * dt));
  if (snap) { fovKick = 0; prevBoostOn = boost.on; }
  else {
    if (boost.on && !prevBoostOn && quality > 0) fovKick = FX.BOOST_FOV_KICK;
    prevBoostOn = boost.on;
    fovKick *= Math.exp(-4.5 * dt);
  }
  const fv = camFovBase + fovKick;
  if (snap || Math.abs(camera.fov - fv) > 0.02) {
    camera.fov = fv;
    camera.updateProjectionMatrix();
  }
}

// ─── Kamera-Modi: Verfolger (Standard), Cockpit, Helikopter, Fernsehkamera ─────
let camMode = 0, camSnapNext = true, camEff = 0;
let cockpitHide = [];                       // Helm, Visier, Halo (Bügel + Strebe): im Cockpit-Blick ausgeblendet
const _cv = new THREE.Vector3(), _cq = new THREE.Quaternion(), _yAx = new THREE.Vector3(0, 1, 0);

function applyCamMode() {
  const ck = camMode === 1;
  cockpitHide.forEach(o => { o.visible = !ck; });
  const nr = ck ? 0.12 : 0.3;               // im Cockpit näher an der Kamera: kleinere Nahebene
  if (camera && camera.near !== nr) { camera.near = nr; camera.updateProjectionMatrix(); }
}
function showCamBadge() {
  const b = $('camBadge');
  if (!b) return;
  b.textContent = '📷 ' + CAM_MODES[camMode].name;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}
function setCamMode(i, announce) {
  camMode = ((i % CAM_MODES.length) + CAM_MODES.length) % CAM_MODES.length;
  camSnapNext = true;
  settings.camera = camMode;
  saveSettings();
  applyCamMode();
  if (announce) showCamBadge();
}
function cycleCamera() { setCamMode(camMode + 1, true); }

function setCamFov(tf, rate, snap, dt, kick) {
  camFovBase += (tf - camFovBase) * (snap ? 1 : 1 - Math.exp(-rate * dt));
  if (snap) { fovKick = 0; prevBoostOn = boost.on; }
  else if (kick) {
    if (boost.on && !prevBoostOn && quality > 0) fovKick = FX.BOOST_FOV_KICK;
    prevBoostOn = boost.on;
    fovKick *= Math.exp(-4.5 * dt);
  } else { prevBoostOn = boost.on; fovKick = 0; }
  const fv = camFovBase + fovKick;
  if (snap || Math.abs(camera.fov - fv) > 0.02) { camera.fov = fv; camera.updateProjectionMatrix(); }
}
function camShake(scale) {
  if (quality <= 0 || FX.SHAKE <= 0) return;
  const fr = clamp(Math.abs(cs.speed) / MAX_SPEED, 0, 1.3);
  const amp = scale * FX.SHAKE * (quality > 1 ? 1 : 0.5) * (clamp((fr - 0.7) * 0.05, 0, 0.02) + (boost.on ? 0.035 : 0));
  if (amp <= 0) return;
  const t = fxClock;
  camera.position.x += (Math.sin(t * 61.0) + Math.sin(t * 37.0 + 1.7)) * 0.5 * amp;
  camera.position.y += (Math.sin(t * 53.0 + 0.6) + Math.sin(t * 29.0 + 2.9)) * 0.5 * amp;
  camera.position.z += Math.sin(t * 43.0 + 4.1) * 0.5 * amp;
}

function camCockpit(dt, snap) {
  _cv.set(0, 0.60, 0.17).multiplyScalar(car.scale.x).applyQuaternion(car.quaternion).add(car.position);   // Augenhöhe über dem Helm
  camPos.copy(_cv);
  camera.position.copy(_cv);
  _cq.setFromAxisAngle(_yAx, Math.PI + cs.steer * 0.16);                                                    // Blick folgt leicht der Lenkung
  camera.quaternion.copy(car.quaternion).multiply(_cq);
  if (!snap) camShake(0.7);
  camAngle = cs.angle;                                                                                       // Verfolger-Zustand mitführen
  camLook.set(cs.x + Math.sin(cs.angle) * 7, cs.y + 0.9, cs.z + Math.cos(cs.angle) * 7);
  setCamFov(78 + fovAspectBonus + 12 * clamp(Math.abs(cs.speed) / MAX_SPEED, 0, 1) + (boost.on ? 8 : 0), 4, snap, dt, true);
}

function camHeli(dt, snap) {
  camAngle = wrapAngle(camAngle + wrapAngle(cs.angle - camAngle) * (snap ? 1 : 1 - Math.exp(-2.2 * dt)));
  const sw = fxClock * 0.35, sa = Math.sin(camAngle), ca = Math.cos(camAngle);
  const back = 20 + Math.sin(sw) * 2.5, side = Math.cos(sw * 0.8) * 5;                                       // leichtes Schweben
  const tx = cs.x - sa * back + ca * side, tz = cs.z - ca * back - sa * side;
  let ty = cs.y + 30 + Math.sin(sw * 1.3) * 1.5;
  if (ALPINE) ty = Math.max(ty, alpineHeightAt(tx, tz) + 10);                                                // nicht im Berg
  const k2 = snap ? 1 : 1 - Math.exp(-3 * dt);
  camPos.x += (tx - camPos.x) * k2; camPos.y += (ty - camPos.y) * k2; camPos.z += (tz - camPos.z) * k2;
  camera.position.copy(camPos);
  const k3 = snap ? 1 : 1 - Math.exp(-8 * dt);
  camLook.x += (cs.x + sa * 12 - camLook.x) * k3; camLook.y += (cs.y - camLook.y) * k3; camLook.z += (cs.z + ca * 12 - camLook.z) * k3;
  camera.lookAt(camLook);
  setCamFov(58 + fovAspectBonus + 6 * clamp(Math.abs(cs.speed) / MAX_SPEED, 0, 1), 3, snap, dt, false);
}

function updateCamera(dt, snap) {
  if (camSnapNext) { snap = true; camSnapNext = false; }
  let mode = camMode;
  if (mode === 2 && (inTunnel(cs.idx) || inUnder(cs.idx))) mode = 0;     // Tunnel-/Brückendach würde die Sicht verdecken
  if (mode !== camEff) { camEff = mode; if (mode === 1) snap = true; }
  if (mode === 1) camCockpit(dt, snap);
  else if (mode === 2) camHeli(dt, snap);
  else camChase(dt, snap);
}

// Schattenkamera folgt dem Auto und rastet auf Schatten-Texel ein (kein Flimmern)
const LDIR = new THREE.Vector3().fromArray(THEME.ldir || (THEME === THEMES.night ? [-25, 55, 30] : [-62, 30, 62]));   // Richtung zur Sonne/zum Mond
const LDN = LDIR.clone().normalize();
const LX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), LDN).normalize();
const LY = new THREE.Vector3().crossVectors(LDN, LX);

function updateVisuals(dt, snap) {
  updateCarMesh(dt, snap);
  updateCamera(dt, snap);
  updateCarFx(dt);
  if (mountains) mountains.position.set(camera.position.x, MTN_Y, camera.position.z);
  if (skyGroup) skyGroup.position.copy(camera.position);
  const texel = 68 / moon.shadow.mapSize.x;
  const tx = cs.x * LX.x + cs.y * LX.y + cs.z * LX.z, ty = cs.x * LY.x + cs.y * LY.y + cs.z * LY.z;
  const sx = Math.round(tx / texel) * texel - tx, sy = Math.round(ty / texel) * texel - ty;
  const px = cs.x + LX.x * sx + LY.x * sy, py = cs.y + LX.y * sx + LY.y * sy, pz = cs.z + LX.z * sx + LY.z * sy;
  moon.position.set(px + LDIR.x, py + LDIR.y, pz + LDIR.z);
  moon.target.position.set(px, py, pz);
  moon.target.updateMatrixWorld();
  carGlow.position.set(cs.x, cs.y + 2.2, cs.z);
  const tTarget = inTunnel(cs.idx) ? 2.6 : 0;
  tunnelLight.intensity += (tTarget - tunnelLight.intensity) * (snap ? 1 : 1 - Math.exp(-8 * dt));
  tunnelLight.position.set(cs.x, cs.y + 4.6, cs.z);
}

// ─── Haupt-Schleife (nur EINE) ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// MONDLICHT-RING – alles, was nur bei THEME.moonring läuft (Strecken 1–3 bleiben unberührt)
// Vollmond mit Saturn-Ring, Polarlicht, Sternschnuppen, Mondtore, Eiskristalle, zugefrorener See,
// Himmelslaternen und leiser Schneefall.
// ═══════════════════════════════════════════════════════════════════════════════
const mr = { t: 0, gates: [], aurora: [], streak: null, camU: { value: new THREE.Vector3() } };

function makeMoonTexture() {
  const { c, g } = newCanvas(512, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#fbfdff'); gr.addColorStop(1, '#dce8ff');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  const rn = mulberry32(88);
  for (let i = 0; i < 26; i++) blob(g, rn() * 512, 40 + rn() * 176, 16 + rn() * 44, '120,145,195', 0.10 + rn() * 0.12);   // Maria
  for (let i = 0; i < 70; i++) {                                                                                       // Krater
    const x = rn() * 512, y = 20 + rn() * 216, r = 3 + rn() * 10;
    g.strokeStyle = 'rgba(110,135,180,0.5)'; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(x - 1, y - 1, r * 0.55, 0, 6.283); g.fill();
  }
  return toTexture(c, false);
}

function makeMoonRingTexture() {            // RingGeometry-UV: Mitte = (0.5, 0.5), Aussenrand = 0.5
  const S = 512, { c, g } = newCanvas(S, S);
  const rn = mulberry32(19);
  g.clearRect(0, 0, S, S);
  const band = (r0, r1, a, rgb) => {         // Radien als Anteil des Aussenradius (0..1)
    const gr = g.createRadialGradient(S / 2, S / 2, r0 * S / 2, S / 2, S / 2, r1 * S / 2);
    gr.addColorStop(0, 'rgba(' + rgb + ',0)'); gr.addColorStop(0.5, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, r1 * S / 2, 0, 6.283); g.fill();
  };
  band(0.44, 0.60, 0.55, '170,215,255'); band(0.56, 0.70, 0.85, '215,240,255'); band(0.68, 0.80, 0.40, '150,200,255');
  band(0.78, 0.92, 0.65, '200,230,255'); band(0.90, 1.00, 0.25, '160,210,255');
  g.globalCompositeOperation = 'destination-out';                         // Cassini-Lücken
  [[0.665, 0.012], [0.775, 0.02], [0.905, 0.012]].forEach(o => { g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = o[1] * S; g.beginPath(); g.arc(S / 2, S / 2, o[0] * S / 2, 0, 6.283); g.stroke(); });
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 140; i++) {                                         // feine Ringlets
    const r = (0.46 + rn() * 0.52) * S / 2; g.strokeStyle = 'rgba(235,248,255,' + (0.05 + rn() * 0.12) + ')'; g.lineWidth = 0.6; g.beginPath(); g.arc(S / 2, S / 2, r, 0, 6.283); g.stroke();
  }
  g.globalCompositeOperation = 'destination-in';                          // weicher Aussen-/Innenrand
  const m = g.createRadialGradient(S / 2, S / 2, 0.42 * S / 2, S / 2, S / 2, S / 2);
  m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.1, 'rgba(0,0,0,1)'); m.addColorStop(0.92, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, S, S);
  return toTexture(c, false);
}

function makeAuroraTexture(seed) {
  const W = 1024, H = 256, { c, g } = newCanvas(W, H);
  g.clearRect(0, 0, W, H);
  for (let x = 0; x < W; x += 2) {
    const u = x / W, t = Math.sin(u * 12.5 + seed) * 0.5 + 0.5;
    const h = 70 + 150 * Math.pow(Math.abs(Math.sin(x * 0.013 + seed * 3) * 0.6 + Math.sin(x * 0.047 + seed) * 0.4), 1.2);
    const edge = Math.min(1, u / 0.14, (1 - u) / 0.14);
    const a = (0.10 + 0.40 * Math.abs(Math.sin(x * 0.031 + seed * 5))) * edge;
    const rgb = Math.round(70 + t * 110) + ',' + Math.round(255 - t * 120) + ',' + Math.round(150 + t * 105);
    const gr = g.createLinearGradient(0, H, 0, H - h);
    gr.addColorStop(0, 'rgba(' + rgb + ',0)'); gr.addColorStop(0.12, 'rgba(' + rgb + ',' + a + ')');
    gr.addColorStop(0.6, 'rgba(' + rgb + ',' + a * 0.45 + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(x, H - h, 2.2, h);
  }
  return toTexture(c, false);
}

function makeFrostGroundTexture() {
  const S = 256, { c, g } = newCanvas(S, S);
  g.fillStyle = '#8fa6c8'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(99), cols = ['225,238,255', '170,195,230', '120,145,190', '240,248,255'];
  for (let i = 0; i < 30; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 50, col = cols[(rnd() * cols.length) | 0];
    drawWrapped(S, x, y, r, (px, py) => blob(g, px, py, r, col, 0.10 + rnd() * 0.16));
  }
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,' + (0.10 + rnd() * 0.2) + ')' : 'rgba(60,85,130,' + (0.08 + rnd() * 0.14) + ')';
    g.fillRect(rnd() * S, rnd() * S, 1, 1 + rnd() * 2);
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(rnd() * S, rnd() * S, 1, 1); }   // Eisfunkeln
  const t = toTexture(c, true); t.wrapS = THREE.RepeatWrapping; t.repeat.set(140, 140);
  return t;
}

function makeIceTexture() {
  const S = 512, { c, g } = newCanvas(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S / 2);
  gr.addColorStop(0, '#d8f0ff'); gr.addColorStop(0.7, '#9fcbe8'); gr.addColorStop(1, '#6f9cc4');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const rn = mulberry32(5);
  for (let i = 0; i < 26; i++) {                                         // Risse: verzweigte Linien
    let x = rn() * S, y = rn() * S, a = rn() * 6.283;
    g.strokeStyle = 'rgba(255,255,255,' + (0.18 + rn() * 0.25) + ')'; g.lineWidth = 0.8 + rn() * 1.2; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 9; k++) { a += (rn() - 0.5) * 1.1; x += Math.cos(a) * (14 + rn() * 26); y += Math.sin(a) * (14 + rn() * 26); g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 60; i++) blob(g, rn() * S, rn() * S, 10 + rn() * 30, '255,255,255', 0.06 + rn() * 0.08);
  return toTexture(c, false);
}

function makeStreakTexture(w, h, vertical) {            // länglicher Lichtstreifen mit hellem Kopf (Sternschnuppe / Mondpfad)
  const { c, g } = newCanvas(w, h);
  const gr = vertical ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, 'rgba(190,225,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const m = vertical ? g.createLinearGradient(w, 0, 0, 0) : g.createLinearGradient(0, h, 0, 0);
  const mm = vertical ? g.createLinearGradient(0, 0, w, 0) : g.createLinearGradient(0, 0, 0, h);
  mm.addColorStop(0, 'rgba(0,0,0,0)'); mm.addColorStop(0.5, 'rgba(0,0,0,1)'); mm.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mm; g.fillRect(0, 0, w, h);
  return toTexture(c, false);
}

// Vollmond (gross, folgt der Kamera) mit schräg stehendem Saturn-Ring, Polarlicht-Vorhängen und Sternschnuppen
function buildMoonRingSky() {
  const P = LDIR.clone().normalize().multiplyScalar(500), S = 34;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(S, 40, 28), new THREE.MeshBasicMaterial({ map: makeMoonTexture(), fog: false }));
  moon.position.copy(P); moon.rotation.y = 2.2; moon.renderOrder = -6; skyGroup.add(moon);
  const glow = (size, color, op) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.scale.set(size, size, 1); sp.position.copy(P); sp.renderOrder = -7; skyGroup.add(sp);
  };
  glow(1000, 0x5f86ff, 0.30); glow(380, 0xa9c8ff, 0.62);
  const rg = new THREE.Group(); rg.position.copy(P); rg.lookAt(0, 0, 0); skyGroup.add(rg);        // lokale +z zeigt zum Betrachter
  const roll = new THREE.Group(); roll.rotation.z = -0.42; rg.add(roll);
  const ring = new THREE.Mesh(new THREE.RingGeometry(44, 118, 128, 1), new THREE.MeshBasicMaterial({
    map: makeMoonRingTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.95
  }));
  ring.rotation.x = 1.2; ring.renderOrder = -6; roll.add(ring);                                    // Rückseite verdeckt der Mond (Tiefentest), Vorderseite läuft davor
  // Polarlicht: drei grosse Vorhänge in unterschiedlichen Richtungen
  [[0.2, 2.3, 380, 140, 1.3], [2.7, 1.9, 392, 165, 4.1], [4.5, 1.7, 366, 150, 7.7]].forEach((o, i) => {
    const mat = new THREE.MeshBasicMaterial({ map: makeAuroraTexture(o[4]), transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.8 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(o[2], o[2], 150, 40, 1, true, o[0], o[1]), mat);
    m.position.y = o[3]; m.renderOrder = -6; skyGroup.add(m); mr.aurora.push({ mesh: m, mat });
  });
  // Sternschnuppe (wird in updateMoonRing immer wieder neu gestartet)
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(70, 1.8), new THREE.MeshBasicMaterial({
    map: makeStreakTexture(128, 8, false), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, opacity: 0
  }));
  sm.renderOrder = -6; sm.visible = false; skyGroup.add(sm);
  mr.streak = { mesh: sm, v: new THREE.Vector3(), life: 0, dur: 1, next: 3.5 };
}

// Grösste freie Fläche abseits der Strecke → zugefrorener See (muss vor createScenery feststehen, damit dort keine Bäume stehen)
function pickMoonLake() {
  if (!SCENE.MR_LAKE) return null;
  let best = null;
  for (let x = -260; x <= 330; x += 10) for (let z = -230; z <= 300; z += 10) {
    const d = Math.sqrt(minDistToTrack2(x, z, 0));
    if (d < 48) continue;
    const score = Math.min(d, 90) - 0.05 * Math.hypot(x - 80, z - 60);       // gross genug, aber nah am Geschehen
    if (!best || score > best.score) best = { x, z, d, score };
  }
  if (!best) return null;
  const r = Math.min(62, best.d - 24);
  return r >= 22 ? { x: best.x, z: best.z, r } : null;
}

function createMoonRingWorld() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const rnA = mulberry32(4242);

  // ── Zugefrorener See mit Mondpfad und Eislaternen ──
  if (MR_LAKE) {
    const L = MR_LAKE;
    const snow = new THREE.Mesh(new THREE.CircleGeometry(L.r + 3.2, 56), new THREE.MeshLambertMaterial({ color: 0xdbe9ff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const ice = new THREE.Mesh(new THREE.CircleGeometry(L.r, 56), new THREE.MeshPhongMaterial({
      map: makeIceTexture(), color: 0xffffff, specular: 0xdff2ff, shininess: 140, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    }));
    [[snow, 0.03], [ice, 0.06]].forEach(o => { o[0].rotation.x = -Math.PI / 2; o[0].position.set(L.x, GROUND_Y + o[1], L.z); o[0].receiveShadow = true; scene.add(o[0]); });
    mr.ice = ice;
    const dir = LDIR.clone().setY(0).normalize();                                   // Mondpfad zeigt zum Mond
    const path = new THREE.Mesh(new THREE.PlaneGeometry(L.r * 0.55, L.r * 1.5), new THREE.MeshBasicMaterial({
      map: makeStreakTexture(16, 128, true), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6
    }));
    path.rotation.x = -Math.PI / 2; path.rotation.z = Math.atan2(dir.x, dir.z) + Math.PI; path.position.set(L.x + dir.x * L.r * 0.5, GROUND_Y + 0.09, L.z + dir.z * L.r * 0.5);
    scene.add(path);
    const posts = [], gl = [];
    for (let k = 0; k < 22; k++) {
      const a = k / 22 * 6.283, x = L.x + Math.cos(a) * (L.r + 4.5), z = L.z + Math.sin(a) * (L.r + 4.5);
      posts.push({ p: V3(x, GROUND_Y + 1.5, z) }); gl.push(x, GROUND_Y + 3.2, z);
    }
    makeInstanced(new THREE.CylinderGeometry(0.08, 0.13, 3.1, 6), new THREE.MeshLambertMaterial({ color: 0x8aa0c6 }), posts);
    glowPoints(gl, 4.2, 0x8fe4ff, 0.9);
  }

  // ── Eiskristalle an den Kurvenscheiteln (leuchten von innen) ──
  if (SCENE.MR_CRYSTALS) {
    const apex = [];
    for (let i = 0; i < N; i++) {
      const k = Math.abs(frames[i].kappa);
      if (k < 0.028 || !trackFree(i, 10)) continue;
      let top = true; for (let d = -30; d <= 30; d++) if (Math.abs(frames[mod(i + d)].kappa) > k + 1e-9) { top = false; break; }
      if (top && !apex.some(a => Math.abs(wrapIdx(i - a.i)) < 50)) apex.push({ i, k });
    }
    apex.sort((a, b) => b.k - a.k);
    const items = [], gl = [], md = (HALF_W + 5) * (HALF_W + 5);
    apex.slice(0, SCENE.MR_CRYSTALS).forEach(ap => {
      const out = frames[ap.i].kappa > 0 ? -1 : 1, cnt = 5 + ((rnA() * 3) | 0);
      for (let k = 0; k < cnt; k++) {
        const g = frames[mod(ap.i + Math.round((rnA() - 0.5) * 22 / DS))], lat = out * (HALF_W + 6 + rnA() * 10);
        const x = g.P.x + g.Lh.x * lat, z = g.P.z + g.Lh.z * lat;
        if (minDistToTrack2(x, z, md) < md || (MR_LAKE && Math.hypot(x - MR_LAKE.x, z - MR_LAKE.z) < MR_LAKE.r + 8)) continue;
        const h = 2.8 + rnA() * 6.5, w = 0.7 + rnA() * 0.9;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnA() - 0.5) * 0.35, rnA() * 6.28, (rnA() - 0.5) * 0.35, 'YXZ'));
        items.push({ p: V3(x, GROUND_Y + h * 0.5 - 0.2, z), q, s: V3(w, h, w) });
        gl.push(x, GROUND_Y + h * 0.75, z);
      }
    });
    const cg = new THREE.ConeGeometry(0.5, 1, 5);
    makeInstanced(cg, new THREE.MeshLambertMaterial({ color: 0xcdeeff, emissive: 0x2c8ed6, transparent: true, opacity: 0.9 }), items);
    glowPoints(gl, 6.5, 0x6fd0ff, 0.55);
  }

  // ── Mondtore: leuchtende Bögen über der Strecke, pulsieren der Reihe nach ──
  if (SCENE.MR_GATES) {
    const R = HALF_W + 2.2, picked = [], gap = Math.floor(N / (SCENE.MR_GATES + 1)), gl = [];
    for (let s = 0; s < N && picked.length < SCENE.MR_GATES; s += 3) {
      const i = mod(Math.round(N * 0.04) + s);
      if (!trackFree(i, 18) || Math.abs(wrapIdx(i)) < 45) continue;
      if (picked.some(p => Math.abs(wrapIdx(i - p)) < gap) || gantrySpots.some(g => Math.abs(wrapIdx(i - g)) < 16)) continue;
      if (standSpots.some(sp => Math.abs(wrapIdx(i - sp.c)) < sp.half + 14)) continue;
      let straight = true; for (let d = -12; d <= 12; d += 4) if (Math.abs(frames[mod(i + d)].kappa) > 0.012) { straight = false; break; }
      if (straight) picked.push(i);
    }
    picked.sort((a, b) => a - b);
    picked.forEach((i, k) => {
      const f = frames[i], q = frameQuat(f), b = wp(f, 0, -0.02);
      const mk = (rad, tube, color) => {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
        const m = new THREE.Mesh(new THREE.TorusGeometry(rad, tube, 8, 64, Math.PI), mat);
        m.position.copy(b); m.quaternion.copy(q); scene.add(m); return mat;
      };
      mr.gates.push({ k, i, m1: mk(R, 0.34, 0x7fdcff), m2: mk(R - 0.75, 0.1, 0xffffff) });
      for (let a = 0; a <= 12; a++) { const t = a / 12 * Math.PI, p = wp(f, R * Math.cos(t), R * Math.sin(t)); gl.push(p.x, p.y, p.z); }
    });
    glowPoints(gl, 5.5, 0x8fe4ff, 0.7);
  }

  // ── Himmelslaternen (steigen auf) und leiser Schneefall – folgen der Kamera ──
  const mkParticles = (n, box, off, o) => {
    const pos = new Float32Array(n * 3), ph = new Float32Array(n), rn = mulberry32(o.seed);
    for (let i = 0; i < n; i++) { pos[i * 3] = rn() * box[0]; pos[i * 3 + 1] = rn() * box[1]; pos[i * 3 + 2] = rn() * box[2]; ph[i] = rn(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: crowdUni.time, uCam: mr.camU, uBox: { value: V3(box[0], box[1], box[2]) }, uOff: { value: V3(0, off, 0) },
        uSpeed: { value: o.speed }, uSize: { value: o.size }, uSway: { value: o.sway }, uCol: { value: new THREE.Color(o.color) }, uAlpha: { value: o.alpha }, uFlick: { value: o.flick || 0 }
      },
      vertexShader: 'uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uOff; uniform float uSpeed; uniform float uSize; uniform float uSway; uniform float uFlick;\n' +
        'attribute float aPh; varying float vA;\n' +
        'void main(){ vec3 p = position;\n' +
        ' p.y += uTime * uSpeed * (0.7 + aPh * 0.6); p.x += sin(uTime * 0.7 + aPh * 40.0) * uSway; p.z += cos(uTime * 0.6 + aPh * 31.0) * uSway;\n' +
        ' vec3 rel = mod(p - uCam - uOff, uBox) - uBox * 0.5;\n' +
        ' vec4 mv = modelViewMatrix * vec4(uCam + uOff + rel, 1.0); gl_Position = projectionMatrix * mv;\n' +
        ' gl_PointSize = min(46.0, uSize * 420.0 / max(1.0, -mv.z));\n' +
        ' float edge = length(rel / uBox) * 2.0;\n' +
        ' vA = (1.0 - smoothstep(0.6, 1.0, edge)) * (1.0 - uFlick + uFlick * (0.6 + 0.4 * sin(uTime * 3.0 + aPh * 50.0))); }',
      fragmentShader: 'uniform vec3 uCol; uniform float uAlpha; varying float vA;\n' +
        'void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uCol, smoothstep(0.5, 0.05, d) * vA * uAlpha); }',
      transparent: true, depthWrite: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  };
  if (SCENE.MR_LANTERNS) mkParticles(SCENE.MR_LANTERNS, [150, 56, 150], 32, { seed: 71, size: 0.7, color: 0xffa850, alpha: 0.95, speed: 0.9, sway: 3, flick: 0.5, additive: true });
  if (SCENE.MR_SNOW) mkParticles(SCENE.MR_SNOW, [60, 30, 60], 8, { seed: 72, size: 0.085, color: 0xffffff, alpha: 0.8, speed: -1.1, sway: 1.1 });
}

function updateMoonRing(dt) {
  mr.t += dt;
  const t = mr.t;
  updateMoonRingLandmarks(dt, t);
  mr.camU.value.copy(camera.position);
  for (let i = 0; i < mr.gates.length; i++) {                      // Lauflicht: die Tore pulsieren nacheinander
    const g = mr.gates[i], o = 0.52 + 0.4 * Math.sin(t * 2.6 - g.k * 1.15);
    g.m1.opacity = o; g.m2.opacity = Math.min(1, o + 0.3);
  }
  for (let i = 0; i < mr.aurora.length; i++) {
    const a = mr.aurora[i];
    a.mesh.rotation.y += dt * (0.004 + 0.002 * i);
    a.mesh.scale.y = 1 + 0.07 * Math.sin(t * 0.45 + i * 2.1);
    a.mat.opacity = 0.7 + 0.22 * Math.sin(t * 0.3 + i * 1.7);
  }
  const s = mr.streak;
  if (s) {
    if (!s.mesh.visible) {
      s.next -= dt;
      if (s.next <= 0) {                                           // neue Sternschnuppe irgendwo am Himmel
        const az = Math.random() * 6.283, el = 0.45 + Math.random() * 0.5, r = 470;
        const rad = V3n(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
        const tan = new THREE.Vector3().crossVectors(rad, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1);
        const vx = tan.clone().add(new THREE.Vector3(0, -0.5, 0)).normalize();
        const yy = new THREE.Vector3().crossVectors(rad, vx).normalize();
        s.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vx, yy, rad));
        s.mesh.position.copy(rad).multiplyScalar(r);
        s.v.copy(vx).multiplyScalar(380); s.life = 0; s.dur = 0.8 + Math.random() * 0.4; s.mesh.visible = true;
      }
    } else {
      s.life += dt; s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.material.opacity = Math.sin(Math.min(1, s.life / s.dur) * Math.PI);
      if (s.life >= s.dur) { s.mesh.visible = false; s.next = 4 + Math.random() * 6; }
    }
  }
}
function V3n(x, y, z) { return new THREE.Vector3(x, y, z); }


// ── Mondlicht-Ring: Wahrzeichen & Deko (Leuchtturm, Runensäulen, Eissplitter, Feuerwerk) ──
function makeRuneTexture() {
  const { c, g } = newCanvas(128, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#17356a'); gr.addColorStop(1, '#0a1838');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
  const rn = mulberry32(61);
  g.strokeStyle = '#a8ecff'; g.lineWidth = 3.2; g.shadowColor = '#5fd8ff'; g.shadowBlur = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let r = 0; r < 5; r++) {                                   // fünf Runen übereinander
    const cy = 30 + r * 48, n = 3 + ((rn() * 3) | 0);
    g.beginPath(); g.moveTo(64, cy - 21); g.lineTo(64, cy + 21);
    let x = 64, y = cy - 18;
    g.moveTo(x, y);
    for (let k = 0; k < n; k++) { x = 64 + (rn() - 0.5) * 54; y = cy - 18 + (k + 1) * 36 / n; g.lineTo(x, y); }
    g.stroke();
    g.beginPath(); g.arc(64, cy, 15 + rn() * 5, rn() * 6, rn() * 6 + 2.6); g.stroke();
  }
  return toTexture(c, false);
}

function createMoonRingLandmarks() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── Mond-Leuchtturm: Eisspitze auf einer Insel im See, rotierende Ringe, zwei Suchstrahlen ──
  if (MR_LAKE) {
    const L = MR_LAKE, grp = new THREE.Group(); grp.position.set(L.x, GROUND_Y + 0.1, L.z); scene.add(grp);
    const iceMat = new THREE.MeshLambertMaterial({ color: 0xcdeeff, emissive: 0x2f8fe0, transparent: true, opacity: 0.93 });
    const isl = new THREE.Mesh(new THREE.CylinderGeometry(7, 9.5, 1.4, 24), new THREE.MeshLambertMaterial({ color: 0xdbe9ff })); isl.position.y = 0.5; grp.add(isl);
    const main = new THREE.Mesh(new THREE.ConeGeometry(2.5, 32, 6), iceMat); main.position.y = 17; grp.add(main);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * 6.283, h = 7 + (k % 3) * 3.6, c = new THREE.Mesh(new THREE.ConeGeometry(1.05, h, 5), iceMat);
      c.position.set(Math.cos(a) * 4.8, 0.7 + h / 2, Math.sin(a) * 4.8); c.rotation.z = -Math.cos(a) * 0.3; c.rotation.x = Math.sin(a) * 0.3; grp.add(c);
    }
    const rings = [];
    [[10, 0.2, 0.5, 0.2, 0x7fdcff], [13.5, 0.16, -0.35, 0.45, 0xb48cff], [17, 0.14, 0.22, -0.3, 0x9fe8ff]].forEach(o => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(o[0], o[1], 8, 80), new THREE.MeshBasicMaterial({ color: o[4], transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.y = 21; m.rotation.set(1.1 + o[2], o[3], 0); grp.add(m); rings.push({ mesh: m, sx: o[2], sy: o[3] });
    });
    const beams = new THREE.Group(); beams.position.y = 33; grp.add(beams);
    [[0, 0x7fe0ff], [Math.PI, 0xb48cff]].forEach(o => {
      const geo = new THREE.CylinderGeometry(0.25, 6, 190, 14, 1, true); geo.translate(0, 95, 0);
      const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: o[1], transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      const piv = new THREE.Group(); piv.rotation.y = o[0]; b.rotation.x = 0.85; piv.add(b); beams.add(piv);
    });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: 0x8fe8ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(46, 46, 1); glow.position.y = 30; grp.add(glow);
    mr.spire = { rings, beams, glow };

    // ── Mond-Feuerwerk über dem See: drei Bursts im Wechsel ──
    const B = 3, P = 110, n = B * P, pos = new Float32Array(n * 3), dir = new Float32Array(n * 3), bi = new Float32Array(n), rn = mulberry32(333);
    const C = [[L.x - 30, 64, L.z + 10], [L.x + 25, 80, L.z - 20], [L.x, 72, L.z + 35]];
    for (let b = 0; b < B; b++) for (let k = 0; k < P; k++) {
      const i = b * P + k, u = rn() * 2 - 1, a = rn() * 6.283, r = Math.sqrt(1 - u * u), sp = 13 + rn() * 11;
      dir[i * 3] = Math.cos(a) * r * sp; dir[i * 3 + 1] = u * sp; dir[i * 3 + 2] = Math.sin(a) * r * sp; bi[i] = b;
      pos[i * 3] = C[b][0]; pos[i * 3 + 1] = C[b][1]; pos[i * 3 + 2] = C[b][2];
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3)); g.setAttribute('aB', new THREE.BufferAttribute(bi, 1));
    const fm = new THREE.ShaderMaterial({
      uniforms: { uTime: crowdUni.time },
      vertexShader: 'uniform float uTime; attribute vec3 aDir; attribute float aB; varying vec4 vC;\n' +
        'void main(){ float t = mod(uTime - aB * 3.4, 10.0); float dur = 3.4;\n' +
        ' if (t > dur) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vC = vec4(0.0); return; }\n' +
        ' vec3 p = position + aDir * ((1.0 - exp(-1.8 * t)) / 1.8) + vec3(0.0, -3.2 * t * t, 0.0);\n' +
        ' vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;\n' +
        ' gl_PointSize = min(40.0, (1.0 + 1.6 * (1.0 - t / dur)) * 2.4 * 420.0 / max(1.0, -mv.z));\n' +
        ' vec3 col = aB < 0.5 ? vec3(0.45, 0.9, 1.0) : (aB < 1.5 ? vec3(0.95, 0.55, 1.0) : vec3(1.0, 0.85, 0.5));\n' +
        ' vC = vec4(col, (1.0 - t / dur) * (1.0 - t / dur)); }',
      fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC.rgb, smoothstep(0.5, 0.02, d) * vC.a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const fw = new THREE.Points(g, fm); fw.frustumCulled = false; scene.add(fw);
  }

  // ── Runensäulen an den Mondtoren (pulsieren im Takt der Tore) ──
  const runeTex = makeRuneTexture(), capGlow = [];
  mr.runes = [];
  mr.gates.forEach(gt => {
    const f = frames[gt.i], mat = new THREE.MeshBasicMaterial({ map: runeTex, color: 0xffffff }), capMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
    [-1, 1].forEach(sg => {
      const b = wp(f, sg * (HALF_W + 4.6), -0.05);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.35, 5.4, 4, 1), mat);
      p.position.set(b.x, b.y + 2.7, b.z); p.quaternion.copy(yawQuat(f)); p.rotateY(Math.PI / 4); scene.add(p);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.5, 4), capMat);
      cap.position.set(b.x, b.y + 6.1, b.z); cap.quaternion.copy(p.quaternion); scene.add(cap);
      capGlow.push(b.x, b.y + 6.4, b.z);
    });
    mr.runes.push({ mat, k: gt.k });
  });
  glowPoints(capGlow, 5, 0x8fe4ff, 0.85);

  // ── Schwebende Eissplitter (bobben und drehen sich langsam) ──
  const rn = mulberry32(9090), sh = [], md = (HALF_W + 9) * (HALF_W + 9);
  for (let t = 0; t < 900 && sh.length < 48; t++) {
    const i = (rn() * N) | 0; if (!trackFree(i, 12) || frames[i].P.y > 4) continue;
    const f = frames[i], lat = (rn() < 0.5 ? -1 : 1) * (HALF_W + 11 + rn() * 22), x = f.P.x + f.Lh.x * lat, z = f.P.z + f.Lh.z * lat;
    if (minDistToTrack2(x, z, md) < md || (MR_LAKE && Math.hypot(x - MR_LAKE.x, z - MR_LAKE.z) < MR_LAKE.r + 14)) continue;
    sh.push({ x, z, y: 5 + rn() * 11, ph: rn() * 6.28, sp: 0.5 + rn() * 0.8, s: 0.4 + rn() * 0.55 });
  }
  if (sh.length) {
    const im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1), new THREE.MeshLambertMaterial({ color: 0x8fd0ff, emissive: 0x2a7de0, transparent: true, opacity: 0.88 }), sh.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; scene.add(im);
    const gp = new Float32Array(sh.length * 3), gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
    const pts = new THREE.Points(gg, new THREE.PointsMaterial({ size: 7, map: getGlowTex(), color: 0x6fd0ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; scene.add(pts);
    mr.shards = { list: sh, im, gp, gg };
  }
}

const _mrM = new THREE.Matrix4(), _mrQ = new THREE.Quaternion(), _mrP = new THREE.Vector3(), _mrS = new THREE.Vector3(), _mrE = new THREE.Euler();
function updateMoonRingLandmarks(dt, t) {
  updateMoonRingExtras(dt, t);
  const sp = mr.spire;
  if (sp) {
    sp.rings.forEach(r => { r.mesh.rotation.x += dt * r.sx; r.mesh.rotation.y += dt * r.sy; });
    sp.beams.rotation.y = t * 0.32;
    sp.glow.material.opacity = 0.65 + 0.2 * Math.sin(t * 1.7);
  }
  if (mr.runes) for (let i = 0; i < mr.runes.length; i++) { const r = mr.runes[i]; r.mat.color.setScalar(0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.6 - r.k * 1.15))); }
  const sh = mr.shards;
  if (sh) {
    for (let i = 0; i < sh.list.length; i++) {
      const s = sh.list[i], y = GROUND_Y + s.y + Math.sin(t * s.sp + s.ph) * 0.9;
      _mrP.set(s.x, y, s.z); _mrE.set(0.25 * Math.sin(t * 0.4 + s.ph), t * 0.45 * s.sp + s.ph, 0); _mrQ.setFromEuler(_mrE); _mrS.set(s.s, s.s * 2.1, s.s);
      sh.im.setMatrixAt(i, _mrM.compose(_mrP, _mrQ, _mrS));
      sh.gp[i * 3] = s.x; sh.gp[i * 3 + 1] = y; sh.gp[i * 3 + 2] = s.z;
    }
    sh.im.instanceMatrix.needsUpdate = true; sh.gg.attributes.position.needsUpdate = true;
  }
}


// ── Mondlicht-Ring: Veredelung (Lauflichter, Glitzerschnee, Frostportale, Titelbogen, Nebel, Kometen) ──
function makeTitleTexture() {
  const { c, g } = newCanvas(1024, 256);
  g.clearRect(0, 0, 1024, 256);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 100px "Arial Black", Impact, sans-serif';
  const gr = g.createLinearGradient(0, 40, 0, 190); gr.addColorStop(0, '#f2fcff'); gr.addColorStop(0.55, '#a8e4ff'); gr.addColorStop(1, '#6a9cff');
  g.shadowColor = '#4fd0ff'; g.shadowBlur = 34; g.fillStyle = gr; g.fillText('MONDLICHT·RING', 512, 108);
  g.shadowBlur = 12; g.fillText('MONDLICHT·RING', 512, 108);
  g.shadowBlur = 14; g.font = '700 40px Arial, sans-serif'; g.fillStyle = '#c9eeff'; g.fillText('D I E   L E T Z T E   P R Ü F U N G', 512, 212);
  return toTexture(c, false);
}

function createMoonRingExtras() {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── Lauflichter: Lichtwellen laufen an beiden Streckenrändern entlang ──
  {
    const pos = [], aS = [], step = Math.max(1, Math.round(5 / DS));
    for (let i = 0; i < N; i += step) {
      if (inTunnel(i)) continue;
      const f = frames[i];
      [-1, 1].forEach(sg => { const p = wp(f, sg * (HALF_W + 0.8), 0.3); pos.push(p.x, p.y, p.z); aS.push(i * DS); });
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: crowdUni.time },
      vertexShader: 'uniform float uTime; attribute float aS; varying float vG;\n' +
        'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;\n' +
        ' float ph = fract(aS / 70.0 - uTime * 0.55); float g = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.05, 0.45, ph)); vG = 0.22 + 0.78 * g;\n' +
        ' gl_PointSize = min(34.0, (1.0 + 1.4 * g) * 1.1 * 420.0 / max(1.0, -mv.z)); }',
      fragmentShader: 'varying float vG; void main(){ float d = length(gl_PointCoord - 0.5); vec3 c = mix(vec3(0.25, 0.75, 1.0), vec3(0.9, 1.0, 1.0), vG); gl_FragColor = vec4(c, smoothstep(0.5, 0.0, d) * vG); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  }

  // ── Glitzerschnee: funkelnde Eiskristalle am Boden um die Kamera ──
  {
    const n = 1100, box = 80, pos = new Float32Array(n * 3), ph = new Float32Array(n), rn = mulberry32(515);
    for (let i = 0; i < n; i++) { pos[i * 3] = rn() * box; pos[i * 3 + 2] = rn() * box; ph[i] = rn(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: crowdUni.time, uCam: mr.camU, uBox: { value: box }, uY: { value: GROUND_Y + 0.12 } },
      vertexShader: 'uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uY; attribute float aPh; varying float vA;\n' +
        'void main(){ vec2 rel = mod(position.xz - uCam.xz, uBox) - uBox * 0.5; vec3 w = vec3(uCam.x + rel.x, uY + aPh * 0.7, uCam.z + rel.y);\n' +
        ' vec4 mv = modelViewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv;\n' +
        ' float tw = 0.5 + 0.5 * sin(uTime * (2.0 + aPh * 3.0) + aPh * 80.0); vA = pow(tw, 5.0) * (1.0 - smoothstep(0.35, 0.5, length(rel) / uBox));\n' +
        ' gl_PointSize = min(14.0, 0.28 * 420.0 / max(1.0, -mv.z) * (0.6 + tw)); }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.82, 0.95, 1.0, smoothstep(0.5, 0.0, d) * vA); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  }

  // ── Frostportale: leuchtende Eisbögen mit hängenden Eiszapfen vor und hinter dem Tunnel ──
  const gl = [];
  [-1, 1].forEach(sd => {
    const i = mod(tunnelR.c + sd * (tunnelR.h + 5)), f = frames[i], q = frameQuat(f), b = wp(f, 0, -0.02), R = HALF_W + 4.6;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: 0xcdeeff }));
    arc.position.copy(b); arc.quaternion.copy(q); scene.add(arc);
    const flip = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), Math.PI)), items = [], rn = mulberry32(900 + i);
    for (let k = 1; k < 34; k++) {
      const t = k / 34 * Math.PI, len = 1.2 + rn() * 2.6, p = wp(f, (R - 0.3) * Math.cos(t), (R - 0.3) * Math.sin(t) - len / 2);
      items.push({ p, q: flip, s: V3(0.8 + rn() * 0.5, len, 0.8 + rn() * 0.5) });
    }
    makeInstanced(new THREE.ConeGeometry(0.3, 1, 5), new THREE.MeshLambertMaterial({ color: 0xdff4ff, emissive: 0x4aa8ff }), items);
    for (let a = 0; a <= 16; a++) { const t = a / 16 * Math.PI, p = wp(f, R * Math.cos(t), R * Math.sin(t)); gl.push(p.x, p.y, p.z); }
  });
  glowPoints(gl, 5.5, 0x9fe8ff, 0.8);

  // ── Titelbogen hinter dem Start: Eis-Pylonen, Leuchtbogen und leuchtender Schriftzug ──
  {
    const i = mod(Math.round(75 / DS)), f = frames[i], q = frameQuat(f), R = HALF_W + 6, ice = new THREE.MeshLambertMaterial({ color: 0xcdeeff, emissive: 0x3fa0f0 });
    [-1, 1].forEach(sg => {
      const b = wp(f, sg * R, -0.05), c = new THREE.Mesh(new THREE.ConeGeometry(1.5, 19, 6), ice);
      c.position.set(b.x, b.y + 9, b.z); scene.add(c);
      const g2 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 11, 5), ice); g2.position.set(b.x + f.Lh.x * sg * 2.2, b.y + 5, b.z + f.Lh.z * sg * 2.2); g2.rotation.z = -sg * 0.3; scene.add(g2);
    });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: 0x8fe4ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    arc.position.copy(wp(f, 0, -0.02)); arc.quaternion.copy(q); scene.add(arc);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: makeTitleTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    sign.position.copy(wp(f, 0, R + 3.4)); sign.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI)); scene.add(sign);
    const gp = []; for (let a = 0; a <= 14; a++) { const t = a / 14 * Math.PI, p = wp(f, R * Math.cos(t), R * Math.sin(t)); gp.push(p.x, p.y, p.z); }
    glowPoints(gp, 6, 0x9fe8ff, 0.8);
  }

  // ── Nebelbänke über dem Schnee ──
  {
    const tex = makeCloudTexture(), rn = mulberry32(2718); mr.mist = [];
    for (let t = 0; t < 400 && mr.mist.length < 22; t++) {
      const i = (rn() * N) | 0, f = frames[i], lat = (rn() < 0.5 ? -1 : 1) * (HALF_W + 22 + rn() * 60), x = f.P.x + f.Lh.x * lat, z = f.P.z + f.Lh.z * lat;
      if (f.P.y > 5) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xa8c8f4, transparent: true, opacity: 0.2 + rn() * 0.1, depthWrite: false }));
      const w = 60 + rn() * 60; sp.scale.set(w, w * 0.22, 1); sp.position.set(x, GROUND_Y + 3 + rn() * 4, z); scene.add(sp);
      mr.mist.push({ sp, x, z, ph: rn() * 6.28, amp: 3 + rn() * 5 });
    }
  }

  // ── Wellen auf dem See, Kometen ──
  mr.ripples = [];
  if (MR_LAKE) for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 72), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(MR_LAKE.x, GROUND_Y + 0.11, MR_LAKE.z); scene.add(m); mr.ripples.push(m);
  }
  mr.comets = [];
  [[1.5, 70], [5.5, 70], [9, 160]].forEach(o => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o[1], 2.2), new THREE.MeshBasicMaterial({ map: makeStreakTexture(128, 8, false), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, opacity: 0 }));
    m.renderOrder = -6; m.visible = false; skyGroup.add(m); mr.comets.push({ mesh: m, v: new THREE.Vector3(), life: 0, dur: 1, next: o[0], slow: o[1] > 100 });
  });
}

function updateMoonRingExtras(dt, t) {
  for (let i = 0; i < mr.ripples.length; i++) {              // Wellen laufen vom Leuchtturm zum Ufer
    const s = ((t + i * 1.4) % 4.2) / 4.2, r = 8 + s * (MR_LAKE.r - 8);
    mr.ripples[i].scale.set(r, r, 1); mr.ripples[i].material.opacity = Math.sin(s * Math.PI) * 0.45;
  }
  if (mr.ice) mr.ice.material.emissive.setHSL(0.56 + 0.07 * Math.sin(t * 0.25), 0.7, 0.06 + 0.03 * Math.sin(t * 0.8));
  for (let i = 0; i < mr.aurora.length; i++) mr.aurora[i].mat.color.setHSL(0.5 + 0.1 * Math.sin(t * 0.06 + i * 2.1), 0.6, 0.82);
  if (mr.mist) for (let i = 0; i < mr.mist.length; i++) { const m = mr.mist[i]; m.sp.position.x = m.x + Math.sin(t * 0.05 + m.ph) * m.amp * 3; m.sp.position.z = m.z + Math.cos(t * 0.04 + m.ph) * m.amp * 3; }
  for (let i = 0; i < mr.comets.length; i++) {               // Sternschnuppen/Kometen
    const s = mr.comets[i];
    if (!s.mesh.visible) {
      s.next -= dt;
      if (s.next <= 0) {
        const az = Math.random() * 6.283, el = 0.4 + Math.random() * 0.55;
        const rad = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
        const tan = new THREE.Vector3().crossVectors(rad, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1);
        const vx = tan.add(new THREE.Vector3(0, -0.45, 0)).normalize(), yy = new THREE.Vector3().crossVectors(rad, vx).normalize();
        s.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vx, yy, rad));
        s.mesh.position.copy(rad).multiplyScalar(470); s.v.copy(vx).multiplyScalar(s.slow ? 150 : 360);
        s.life = 0; s.dur = s.slow ? 3.2 : 0.9 + Math.random() * 0.4; s.mesh.visible = true;
      }
    } else {
      s.life += dt; s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.material.opacity = Math.sin(Math.min(1, s.life / s.dur) * Math.PI);
      if (s.life >= s.dur) { s.mesh.visible = false; s.next = (s.slow ? 14 : 3) + Math.random() * 6; }
    }
  }
}


function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const rawDt = (now - lastFrame) / 1000;
  lastFrame = now;
  const dt = clamp(rawDt, 0.0001, 0.05);
  if (state === 'menu') return;                 // Hauptmenü: Spielszene wird nicht gerendert (das Menü hat einen eigenen Renderer)

  if (settings.quality === 'auto' && state === 'racing' && rawDt < 0.5) {      // Auto-Qualität bei niedriger FPS
    fpsFrames++; fpsTime += rawDt;
    if (fpsTime >= 2) {
      if (fpsFrames / fpsTime < 46) {
        if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); resizeCanvas(); }
        else if (quality > 0) setQuality(quality - 1);       // danach: Schatten-/Partikel-Stufen
      }
      fpsFrames = 0; fpsTime = 0;
    }
  }

  if (state === 'countdown') updateCountdown(now);
  if (race.goHideAt && now > race.goHideAt) { $('countdown').classList.add('hidden'); race.goHideAt = 0; }
  updateToasts(now);

  if (state === 'racing') {
    updatePhysics(dt, true);
    handleProgress(now);
  } else if (state === 'finished') {
    updatePhysics(dt, false);
  }

  if (state !== 'paused') {
    const accel = state === 'racing' && (act('up') || boost.on) && cs.speed > 3;
    updateVisuals(dt, false);
    updateExhaust(dt, accel);
    updateFx(dt);
    updateAtmosphere(dt);
  }
  updateHUD(now);
  updateAudio(dt);
  renderer.render(scene, camera);
}

function updateHUD(now) {
  let t = 0;
  if (state === 'racing') t = Math.max(0, raceTime(now));
  else if (state === 'finished') t = race.finalTime;
  else if (state === 'paused') t = race.pauseStart - race.startWall - race.pausedAccum;
  if (state !== 'menu' && state !== 'countdown') setText($('timeDisplay'), formatTime(t));

  const kmh = Math.round(Math.abs(cs.speed) / MAX_SPEED * 200);
  setText($('speedDisplay'), String(kmh));
  const bar = $('speedBar');                                   // Tacho-Bogen (pathLength = 100)
  const w = (100 - Math.min(100, kmh / 200 * 100)).toFixed(1);
  if (bar._w !== w) { bar._w = w; bar.style.strokeDashoffset = w; }

  const bb = $('boostBar'), row = $('boostRow');               // Boost: 10 Segmente
  const bkey = Math.round(boost.energy * 40);
  if (bb._e !== bkey) {
    bb._e = bkey;
    const segs = bb.children, e10 = boost.energy * 10;
    for (let k = 0; k < segs.length; k++) segs[k].style.setProperty('--f', clamp(e10 - k, 0, 1).toFixed(2));
  }
  const full = boost.energy >= 0.999 && !boost.on && !boost.locked;
  if (bb._full !== full) { bb._full = full; bb.classList.toggle('full', full); }
  if (bb._on !== boost.on) {
    bb._on = boost.on;
    bb.classList.toggle('on', boost.on);
    row.classList.toggle('on', boost.on);
    $('gauge').classList.toggle('boosting', boost.on);
    $('speedDisplay').classList.toggle('boosting', boost.on);
  }
  if (bb._lk !== boost.locked) {
    bb._lk = boost.locked;
    bb.classList.toggle('locked', boost.locked);
    row.classList.toggle('locked', boost.locked);
    if (boost.locked && state === 'racing') { showToast('Boost leer', 'boost'); sfxBoostEmpty(); }
  }

  // Minimap: nur das Auto-Dreieck, nur bei sichtbarer Änderung
  const mc = $('mapCar');
  const mx = Math.round(cs.x * 2) / 2, mz = Math.round(cs.z * 2) / 2, ma = Math.round((180 - cs.angle * 180 / Math.PI) / 3) * 3;
  const mk = mx + ',' + mz + ',' + ma;
  if (mc._k !== mk) { mc._k = mk; mc.setAttribute('transform', 'translate(' + mx + ' ' + mz + ') rotate(' + ma + ')'); }

  const vig = $('vignette');
  const vo = (clamp(Math.abs(cs.speed) / MAX_SPEED, 0, 1.3) * 0.45 + (boost.on ? 0.3 : 0)).toFixed(2);
  if (vig._o !== vo) { vig._o = vo; vig.style.opacity = vo; }

  const ww = state === 'racing' && race.wrongTimer > 0.7;
  if (ww !== !!$('wrongWay')._on) {
    $('wrongWay')._on = ww;
    $('wrongWay').classList.toggle('hidden', !ww);
  }
}

// ─── Grösse / Eingabe / Start ─────────────────────────────────────────────────
function resizeCanvas() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  const aspect = w / h;
  // UI-Skalierung: Referenz 900 x 600, begrenzt durch die kleinere Seite (nichts wird abgeschnitten)
  container.style.setProperty('--s', clamp(Math.min(w / 900, h / 600), 0.36, 2.4).toFixed(3));
  // Menü: im Hochformat / auf schmalen Fenstern (gleiche Bedingung wie die Media-Query in style.css) nach der Breite skalieren
  const compact = !!(window.matchMedia && window.matchMedia('(max-aspect-ratio: 5/4), (max-width: 760px)').matches);
  if (compact) container.style.setProperty('--ms', clamp(w / 520, 0.72, 1.5).toFixed(3));
  else container.style.removeProperty('--ms');
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);          // false: Grösse kommt per CSS (100 % des Containers), Canvas wird nicht umgestylt
  camera.aspect = aspect;
  // schmale Fenster: vertikalen FOV leicht erhöhen, damit Strecke und Auto gut sichtbar bleiben
  fovAspectBonus = aspect < 1.4 ? clamp((1.4 - aspect) * 22, 0, 18) : 0;
  camera.updateProjectionMatrix();
  menu3d.resize();
}

function onViewportChange() {
  resizeCanvas();
  setTimeout(resizeCanvas, 150);          // manche mobilen Browser melden die neue Grösse erst verzögert
}

function bindUI() {
  document.addEventListener('keydown', e => {
    if (settingsOpen) {                                   // Einstellungen offen: nur Esc schliesst, der Rest gehört den Bedienelementen
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); closeSettings(); }
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code) keys[e.code] = true;
    if (e.repeat || !e.code) return;
    if (isBound('mute', e.code)) toggleMute();
    if (isBound('pause', e.code)) {
      if (state === 'racing') pauseGame(); else if (state === 'paused') resumeGame();
    }
    if (isBound('camera', e.code) && (state === 'racing' || state === 'countdown')) cycleCamera();
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { clearKeys(); pauseGame(); audioAway(); });
  window.addEventListener('focus', audioResume);
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { window.addEventListener(ev, audioInit, true); });   // Audio schon bei der ersten Eingabe bereitmachen
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearKeys(); pauseGame(); audioAway(); } else audioResume(); });
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', onViewportChange);

  $('muteBtn').addEventListener('click', e => { toggleMute(); e.currentTarget.blur(); });
  // Rekorde-Reset, Strecken-Auswahl und Menü-Tasten: siehe initMenu()
  $('startBtn').addEventListener('click', startFromMenu);
  $('restartBtn').addEventListener('click', startCountdown);
  $('pauseRestartBtn').addEventListener('click', startCountdown);
  $('pauseMenuBtn').addEventListener('click', showMenu);
  $('menuBtn').addEventListener('click', showMenu);
  $('resumeBtn').addEventListener('click', resumeGame);
}

// ─── Hauptmenü: Strecken-Auswahl, Rekorde, 3D-Showroom ───────────────────────
const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const SVG_NS = 'http://www.w3.org/2000/svg';
const PV_W = 120, PV_H = 64, PV_PAD = 10;      // Box der Kartenvorschau

function svgEl(tag, attrs, cls) {
  const el = document.createElementNS(SVG_NS, tag);
  if (cls) el.setAttribute('class', cls);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// Vorschau aus den Kontrollpunkten (gleiche Ausrichtung wie die Minimap im HUD: x -> rechts, z -> unten)
function trackPreview(t) {
  if (!t.points) return { d: t.preview || '', start: null };
  const off = t.startOffset | 0;
  const rot = t.points.slice(off).concat(t.points.slice(0, off));
  const cv = new THREE.CatmullRomCurve3(rot.map(p => new THREE.Vector3(p[0], p[1], p[2])), true, 'centripetal');
  const pts = cv.getPoints(160);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
  const k = Math.min((PV_W - 2 * PV_PAD) / Math.max(1, x1 - x0), (PV_H - 2 * PV_PAD) / Math.max(1, z1 - z0));
  const ox = (PV_W - (x1 - x0) * k) / 2 - x0 * k, oz = (PV_H - (z1 - z0) * k) / 2 - z0 * k;
  const X = p => p.x * k + ox, Z = p => p.z * k + oz;
  let d = '';
  pts.forEach((p, i) => { d += (i ? 'L' : 'M') + X(p).toFixed(1) + ' ' + Z(p).toFixed(1); });
  d += 'Z';
  const p0 = cv.getPointAt(0), tg = cv.getTangentAt(0);
  const nx = tg.z, nz = -tg.x, nl = Math.hypot(nx, nz) || 1, s = 5, sx = X(p0), sz = Z(p0);
  return { d, start: { x1: sx + nx / nl * s, y1: sz + nz / nl * s, x2: sx - nx / nl * s, y2: sz - nz / nl * s } };
}

let cardEls = [];
function buildTrackCards() {
  const list = $('trackList');
  list.textContent = '';
  cardEls = TRACKS.map((t, i) => {
    const card = document.createElement('div');
    card.className = 'track-card' + (t.locked ? ' locked' : '');
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', 'false');
    card.setAttribute('aria-label', t.name + (t.locked ? ', bald verfügbar' : ', Schwierigkeit ' + t.difficulty + ' von 5, ' + t.laps + ' Runden'));
    if (t.locked) { card.setAttribute('aria-disabled', 'true'); card.title = 'Bald verfügbar'; }
    card.tabIndex = -1;
    card.style.setProperty('--i', i);

    const inner = document.createElement('div');
    inner.className = 'tc-in';

    const wrap = document.createElement('div');
    wrap.className = 'tc-mapwrap';
    const pv = trackPreview(t);
    const map = svgEl('svg', { viewBox: '0 0 ' + PV_W + ' ' + PV_H, 'aria-hidden': 'true' }, 'tc-map');
    map.appendChild(svgEl('path', { d: pv.d }, 'm-out'));
    map.appendChild(svgEl('path', { d: pv.d }, 'm-line'));
    if (pv.start) map.appendChild(svgEl('line', { x1: pv.start.x1.toFixed(1), y1: pv.start.y1.toFixed(1), x2: pv.start.x2.toFixed(1), y2: pv.start.y2.toFixed(1) }, 'm-start'));
    wrap.appendChild(map);
    if (t.locked) {
      const lock = document.createElement('span');
      lock.className = 'tc-lock';
      const sv = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
      sv.appendChild(svgEl('rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }));
      sv.appendChild(svgEl('path', { d: 'M8 11V8a4 4 0 0 1 8 0v3' }));
      lock.appendChild(sv);
      wrap.appendChild(lock);
    }
    inner.appendChild(wrap);

    const name = document.createElement('div');
    name.className = 'tc-name';
    name.textContent = t.name;
    inner.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'tc-meta';
    const stars = document.createElement('span');
    stars.className = 'stars';
    stars.setAttribute('aria-hidden', 'true');
    for (let k = 0; k < 5; k++) {
      const s = document.createElement('i');
      s.textContent = '★';
      if (k >= t.difficulty) s.className = 'off';
      stars.appendChild(s);
    }
    meta.appendChild(stars);
    const info = document.createElement('span');
    if (t.locked) { info.className = 'tc-soon'; info.textContent = 'Bald verfügbar'; }
    else info.textContent = t.laps + (t.laps === 1 ? ' Runde' : ' Runden');
    meta.appendChild(info);
    inner.appendChild(meta);

    card.appendChild(inner);
    card.addEventListener('click', () => onCardClick(i));
    list.appendChild(card);
    return card;
  });
}

function refreshMenu() {
  cardEls.forEach((el, i) => {
    const on = TRACKS[i] === selTrack;
    el.classList.toggle('selected', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    el.tabIndex = on ? 0 : -1;
  });
  setText($('recTrack'), selTrack.name);
  showResetConfirm(false);
}

function selectTrack(idx) {
  const t = TRACKS[idx];
  if (!trackUsable(t)) return false;
  selTrack = t;
  try { localStorage.setItem(TRACK_KEY, t.id); } catch (e) { /* ignorieren */ }
  TOTAL_LAPS = t.laps;
  buildLapDots();
  setLapUI(1);
  best = loadRecords(t.id);                   // Rekorde der gewählten Strecke anzeigen
  updateBestDisplay();
  refreshMenu();
  return true;
}

function shakeCard(i) {
  const el = cardEls[i];
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 450);
}
let hintTimer = 0;
function flashHint(text) {
  const h = $('trackHint');
  if (h._def === undefined) h._def = h.textContent;
  h.textContent = text;
  h.classList.add('flash');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { h.textContent = h._def; h.classList.remove('flash'); }, 2200);
}

function onCardClick(i) {
  const t = TRACKS[i];
  if (t.locked) { shakeCard(i); flashHint('„' + t.name + '“ ist bald verfügbar'); return; }
  if (selectTrack(i) && cardEls[i]) cardEls[i].focus({ preventScroll: true });
}

// ←/→: nächste freigeschaltete Strecke wählen; gibt es keine, wackelt die Nachbarkarte (gesperrt) bzw. die gewählte
function stepTrack(dir) {
  const cur = TRACKS.indexOf(selTrack);
  for (let i = cur + dir; i >= 0 && i < TRACKS.length; i += dir) {
    if (trackUsable(TRACKS[i])) { selectTrack(i); return; }
  }
  const nb = cur + dir;
  if (nb >= 0 && nb < TRACKS.length) { shakeCard(nb); flashHint('Weitere Strecken folgen bald'); }
  else shakeCard(cur);
}

// Rekorde zurücksetzen: Klick -> kurze Rückfrage (verfällt nach 5 s), gilt nur für die gewählte Strecke
let resetTimer = 0;
function showResetConfirm(on) {
  clearTimeout(resetTimer);
  $('resetRecBtn').classList.toggle('hidden', on);
  $('resetConfirm').classList.toggle('hidden', !on);
  if (on) resetTimer = setTimeout(() => showResetConfirm(false), 5000);
}

function startFromMenu() {
  if (state !== 'menu') return;
  if (selTrack !== builtTrack) {
    // Die 3D-Welt ist nur für builtTrack gebaut: bei Strecken-Wechsel Seite neu laden und direkt starten
    try { localStorage.setItem(TRACK_KEY, selTrack.id); sessionStorage.setItem(AUTOSTART_KEY, '1'); } catch (e) { /* ignorieren */ }
    location.reload();
    return;
  }
  startCountdown();
}

function showMenu() {
  if (state === 'menu') return;
  state = 'menu';
  clearKeys();
  audioSilence();
  resetToasts();
  ['pauseOverlay', 'finishOverlay', 'countdown', 'wrongWay'].forEach(id => $(id).classList.add('hidden'));
  race.goHideAt = 0;
  resetRace();
  refreshMenu();
  $('overlay').classList.remove('hidden');
  menu3d.start();
}

function bindMenuEvents() {
  $('resetRecBtn').addEventListener('click', () => { showResetConfirm(true); $('resetNo').focus(); });
  $('resetNo').addEventListener('click', () => { showResetConfirm(false); $('resetRecBtn').focus(); });
  $('resetYes').addEventListener('click', () => { resetRecords(); showResetConfirm(false); $('resetRecBtn').focus(); });
  $('trackList').addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    const i = cardEls.indexOf(e.target);
    if (i >= 0) { e.preventDefault(); onCardClick(i); }
  });
  document.addEventListener('keydown', e => {
    if (state !== 'menu' || settingsOpen) return;
    if (e.code === 'ArrowLeft') stepTrack(-1);
    else if (e.code === 'ArrowRight') stepTrack(1);
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && !(e.target && e.target.closest && e.target.closest('button'))) startFromMenu();
  });
}

// Parallax: Hintergrund-Ebenen folgen der Maus (weich nachgeführt, nur solange sich etwas bewegt)
function bindParallax() {
  if (REDUCED) return;
  const ov = $('overlay');
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const step = () => {
    cx += (tx - cx) * 0.07; cy += (ty - cy) * 0.07;
    ov.style.setProperty('--px', cx.toFixed(3));
    ov.style.setProperty('--py', cy.toFixed(3));
    raf = (Math.abs(tx - cx) > 0.003 || Math.abs(ty - cy) > 0.003) ? requestAnimationFrame(step) : 0;
  };
  ov.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const r = ov.getBoundingClientRect();
    tx = clamp(((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2, -1, 1);
    ty = clamp(((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2, -1, 1);
    if (!raf) raf = requestAnimationFrame(step);
  });
  ov.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(step); });
}

function initMenu() {
  buildTrackCards();
  refreshMenu();
  bindMenuEvents();
  bindParallax();
}

// ─── 3D-Showroom: eigener Renderer + eigene Szene, nur solange das Menü sichtbar ist ─────────
// start() erzeugt Canvas, Renderer und Szene; stop() bricht die Schleife ab und gibt alles frei
// (Geometrien, Materialien, Texturen, WebGL-Kontext). Das Auto kommt aus buildCarModel() – dasselbe
// Modell wie im Spiel.
const menu3d = (function () {
  const SPIN = REDUCED ? 0.16 : 0.5;                 // Eigendrehung (rad/s)
  const PLAT_R = 2.7, PLAT_H = 0.26;
  let rdr = null, scn = null, cam = null, cvs = null, stageEl = null, ro = null;
  let raf = 0, running = false, lastT = 0, bound = false;
  let table = null, rig = null, glowMat = null;
  let spin = SPIN, dragging = false, lastX = 0, lastMoveT = 0;

  function makePadTexture() {
    const { c, g } = newCanvas(512, 512);
    const gr = g.createRadialGradient(256, 256, 0, 256, 256, 256);
    gr.addColorStop(0, '#1b2352'); gr.addColorStop(0.65, '#0d1130'); gr.addColorStop(1, '#070a1e');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    g.translate(256, 256);
    g.lineWidth = 2; g.strokeStyle = 'rgba(68,170,255,0.5)';
    [70, 130, 190, 240].forEach(r => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); });
    g.strokeStyle = 'rgba(255,68,170,0.45)';
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      g.beginPath(); g.moveTo(Math.cos(a) * 196, Math.sin(a) * 196); g.lineTo(Math.cos(a) * 232, Math.sin(a) * 232); g.stroke();
    }
    return toTexture(c, false);
  }
  function makeGlowRingTexture() {
    const { c, g } = newCanvas(256, 256);
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    const edge = PLAT_R / (PLAT_R * 1.7);              // Rand der Plattform relativ zur Ebene
    gr.addColorStop(0, 'rgba(255,68,170,0)');
    gr.addColorStop(edge - 0.02, 'rgba(255,68,170,0.7)');
    gr.addColorStop(edge + 0.18, 'rgba(150,90,255,0.28)');
    gr.addColorStop(1, 'rgba(68,170,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return toTexture(c, false);
  }

  function buildScene() {
    scn.add(new THREE.HemisphereLight(0x9db4ff, 0x2a1038, 0.9));
    const key = new THREE.DirectionalLight(0xfff1e2, 1.5); key.position.set(-5, 7, 6); scn.add(key);
    const rimB = new THREE.DirectionalLight(0x44aaff, 1.9); rimB.position.set(-7, 3.5, -6); scn.add(rimB);
    const rimP = new THREE.DirectionalLight(0xff44aa, 1.9); rimP.position.set(7, 3.5, -6); scn.add(rimP);
    const kick = new THREE.PointLight(0x6a7cff, 0.7, 14); kick.position.set(0, 1.2, 5); scn.add(kick);

    table = new THREE.Group();
    scn.add(table);

    // Auto: identisches Modell wie im Spiel (Räder leicht eingelenkt für die Pose)
    rig = { wheels: [], steer: [], flames: [], tails: [] };
    const carM = buildCarModel(rdr, rig);
    carM.position.y = 0.06;
    rig.steer.forEach(p => { p.rotation.y = 0.14; });
    table.add(carM);

    // Plattform: dunkler Zylinder + Deckfläche mit Ringmuster + zwei Neon-Ringe
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x0b0d1c, metalness: 0.85, roughness: 0.35, envMap: rig.env, envMapIntensity: 0.9 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(PLAT_R, PLAT_R + 0.12, PLAT_H, 72), baseMat);
    base.position.y = -PLAT_H / 2;
    table.add(base);
    const top = new THREE.Mesh(new THREE.CircleGeometry(PLAT_R - 0.02, 72),
      new THREE.MeshStandardMaterial({ map: makePadTexture(), metalness: 0.6, roughness: 0.45, envMap: rig.env, envMapIntensity: 0.7 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.004;
    table.add(top);
    const ringG = new THREE.TorusGeometry(PLAT_R + 0.02, 0.05, 10, 128); ringG.rotateX(Math.PI / 2);
    const ringTop = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xff55b0 }));
    ringTop.position.y = 0.012;
    table.add(ringTop);
    const ringG2 = new THREE.TorusGeometry(PLAT_R + 0.13, 0.035, 8, 128); ringG2.rotateX(Math.PI / 2);
    const ringLow = new THREE.Mesh(ringG2, new THREE.MeshBasicMaterial({ color: 0x44aaff }));
    ringLow.position.y = -PLAT_H + 0.03;
    table.add(ringLow);

    // Glühen auf dem "Boden" unter der Plattform (additiv, bleibt beim Drehen stehen)
    glowMat = new THREE.MeshBasicMaterial({
      map: makeGlowRingTexture(), transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const glowG = new THREE.PlaneGeometry(PLAT_R * 3.4, PLAT_R * 3.4); glowG.rotateX(-Math.PI / 2);
    const glow = new THREE.Mesh(glowG, glowMat);
    glow.position.y = -PLAT_H - 0.02;
    scn.add(glow);

    table.rotation.y = -0.55;
  }

  function resize() {
    if (!rdr || !stageEl || !cam) return;
    const w = Math.max(1, stageEl.clientWidth), h = Math.max(1, stageEl.clientHeight);
    rdr.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    rdr.setSize(w, h, false);
    cam.aspect = w / h;
    const tv = Math.tan(cam.fov * Math.PI / 360);
    const dist = Math.max(3.6 / (tv * cam.aspect), 2.1 / tv);     // Plattform + Glühen passen immer ins Bild
    const e = 0.2;                                                // Blickwinkel von oben (rad)
    cam.position.set(0, 0.5 + Math.sin(e) * dist, Math.cos(e) * dist);
    cam.lookAt(0, 0.5, 0);
    cam.updateProjectionMatrix();
  }

  function bindPointer() {
    if (bound) return;
    bound = true;
    const el = stageEl;
    el.addEventListener('pointerdown', e => {
      if (!running || e.button > 0) return;
      dragging = true; lastX = e.clientX; lastMoveT = performance.now(); spin = 0;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignorieren */ }
      el.classList.add('grabbing', 'touched');
    });
    el.addEventListener('pointermove', e => {
      if (!dragging || !table) return;
      const now = performance.now(), dx = e.clientX - lastX, dtm = Math.max(1, now - lastMoveT);
      lastX = e.clientX; lastMoveT = now;
      const dr = dx * 0.012;
      table.rotation.y += dr;
      spin = clamp(dr / (dtm / 1000), -7, 7) * 0.6 + spin * 0.4;
    });
    const end = e => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('grabbing');
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignorieren */ }
      if (performance.now() - lastMoveT > 90) spin = 0;           // losgelassen ohne Schwung
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    if (!dragging) {
      spin += (SPIN - spin) * (1 - Math.exp(-dt * 1.4));          // nach dem Ziehen sanft zurück zur Eigendrehung
      table.rotation.y += spin * dt;
    }
    if (!REDUCED) glowMat.opacity = 0.82 + 0.1 * Math.sin(now * 0.0016);
    rdr.render(scn, cam);
  }

  function start() {
    if (running) return;
    stageEl = $('carStage');
    if (!stageEl) return;
    const old = stageEl.querySelector('canvas');
    if (old) old.remove();
    cvs = document.createElement('canvas');
    cvs.setAttribute('aria-hidden', 'true');
    stageEl.insertBefore(cvs, stageEl.firstChild);
    try {
      rdr = new THREE.WebGLRenderer({ canvas: cvs, alpha: true, antialias: true });
    } catch (e) { rdr = null; cvs.remove(); cvs = null; return; }     // ohne zweiten WebGL-Kontext: Menü läuft ohne Auto weiter
    rdr.setClearColor(0x000000, 0);
    rdr.toneMapping = THREE.ACESFilmicToneMapping;
    rdr.toneMappingExposure = 1.15;
    scn = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    buildScene();
    bindPointer();
    spin = SPIN; dragging = false;
    resize();
    if ('ResizeObserver' in window) { ro = new ResizeObserver(resize); ro.observe(stageEl); }
    running = true;
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function disposeMaterial(m) {
    ['map', 'envMap', 'emissiveMap', 'alphaMap', 'roughnessMap', 'metalnessMap'].forEach(k => {
      const t = m[k];
      if (t && t !== _glowTex) t.dispose();                        // die Glow-Textur gehört auch dem Spiel
    });
    m.dispose();
  }

  function stop() {
    if (!rdr) { running = false; return; }
    running = false;
    cancelAnimationFrame(raf); raf = 0;
    if (ro) { ro.disconnect(); ro = null; }
    dragging = false;
    if (stageEl) stageEl.classList.remove('grabbing');
    scn.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(disposeMaterial);
    });
    if (rig && rig.env) rig.env.dispose();
    rdr.dispose();
    rdr.forceContextLoss();                                        // WebGL-Kontext sofort freigeben
    if (cvs && cvs.parentNode) cvs.parentNode.removeChild(cvs);
    rdr = scn = cam = cvs = table = rig = glowMat = null;
  }

  return { start, stop, resize };
})();

// ─── Einstellungs-Menü: Qualität, Lautstärke, Kamera, Tastenbelegung ─────────────
let settingsOpen = false, settingsOpener = null;
const segBtns = { quality: [], camera: [] }; // Buttons der Auswahlleisten

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Tastenhinweise (HUD unten, Steuerungs-Karte im Menü, Pause-Text, Boost-Taste, Ton-Knopf) aus der aktuellen Belegung
function renderKeyHints() {
  const hint = $('controls-hint');
  if (hint) {
    hint.textContent = '';
    const grp = (caps, text) => {
      const g = el('span', 'hint-grp');
      caps.forEach(c => g.appendChild(el('span', 'key', c)));
      g.appendChild(document.createTextNode(' ' + text));
      hint.appendChild(g);
    };
    grp([hintLabel('up'), hintLabel('down')], 'Gas/Bremse');
    grp([hintLabel('left'), hintLabel('right')], 'Lenken');
    grp([hintLabel('boost')], 'Boost');
    grp([hintLabel('camera')], 'Kamera');
    grp([hintLabel('pause')], 'Pause');
  }
  const bk = $('boostKey');
  if (bk) bk.textContent = hintLabel('boost');
  const kl = $('kbdList');
  if (kl) {
    kl.textContent = '';
    const row = (caps, text) => {
      const k = el('div', 'kbd-keys');
      caps.forEach(c => k.appendChild(el('span', 'key lg' + (c.length > 3 ? ' wide' : ''), c)));
      kl.appendChild(k);
      kl.appendChild(el('div', 'kbd-text', text));
    };
    const all = id => { const l = settings.keys[id].filter(Boolean).map(keyLabel); return l.length ? l : ['–']; };
    row(all('up'), 'Gas');
    row(all('down'), 'Bremse');
    row([hintLabel('left'), hintLabel('right')], 'Lenken');
    row(all('boost'), 'Boost');
    row(all('camera'), 'Kamera wechseln');
    row(all('pause'), 'Pause');
    row(all('mute'), 'Ton an/aus');
  }
  const ph = $('pauseHint');
  if (ph) {
    const p = settings.keys.pause.filter(Boolean).map(keyLabel);
    ph.textContent = p.length ? p.join(' oder ') + ' zum Weiterfahren' : '„Weiter“ zum Weiterfahren';
  }
  applyMuteUI();
}

// Auswahlleisten (Qualität, Kamera): einmal bauen, danach nur den Zustand nachziehen
function buildSeg(boxId, key, items, onPick) {
  const box = $(boxId);
  box.textContent = '';
  segBtns[key] = items.map(it => {
    const b = el('button', 'seg-btn', it.label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => onPick(it.value));
    box.appendChild(b);
    return { btn: b, value: it.value };
  });
}
function updateSeg(key, current) {
  segBtns[key].forEach(s => {
    const on = s.value === current;
    s.btn.classList.toggle('on', on);
    s.btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function renderSettings() {
  updateSeg('quality', settings.quality);
  setText($('qualityInfo'), QUALITY_INFO[settings.quality]);
  updateSeg('camera', camMode);
  setText($('camInfo'), CAM_MODES[camMode].info + ' Umschalten im Rennen mit ' + hintLabel('camera') + '.');
  const v = Math.round(settings.volume * 100);
  $('volRange').value = v;
  $('volVal').textContent = v + ' %';
  renderControlsList();
  applyMuteUI();
}
function renderControlsList() {
  const box = $('ctrlList');
  if (!box) return;
  box.textContent = '';
  ACTIONS.forEach(a => {
    const r = el('div', 'ctrl-row');
    r.appendChild(el('span', 'ctrl-name', a.label));
    const k = el('span', 'ctrl-keys');
    settings.keys[a.id].filter(Boolean).forEach(c => k.appendChild(el('span', 'key lg' + (keyLabel(c).length > 3 ? ' wide' : ''), keyLabel(c))));
    r.appendChild(k);
    box.appendChild(r);
  });
}

function openSettings(opener) {
  if (settingsOpen) return;
  settingsOpen = true;
  settingsOpener = opener || null;
  clearKeys();
  audioInit();                                 // Nutzeraktion: Ton-Test beim Regler funktioniert sofort
  renderSettings();
  const ov = $('settingsOverlay');
  ov.classList.remove('hidden');
  ov.scrollTop = 0;                            // immer oben beginnen
  $('setDoneBtn').focus({ preventScroll: true });
  ov.scrollTop = 0;
}
function closeSettings() {
  if (!settingsOpen) return;
  settingsOpen = false;
  $('settingsOverlay').classList.add('hidden');
  if (settingsOpener && settingsOpener.focus && !settingsOpener.disabled) settingsOpener.focus();
  settingsOpener = null;
}

function initSettingsUI() {
  buildSeg('qualitySeg', 'quality', QUALITY_MODES.map(m => ({ value: m, label: QUALITY_NAMES[m] })), m => { setQualityMode(m); renderSettings(); });
  buildSeg('camSeg', 'camera', CAM_MODES.map((m, i) => ({ value: i, label: m.name })), i => { setCamMode(i, false); renderSettings(); });

  const vr = $('volRange');
  vr.addEventListener('input', () => {
    settings.volume = clamp(vr.value / 100, 0, 1);
    $('volVal').textContent = vr.value + ' %';
    applyVolume();
  });
  vr.addEventListener('change', () => {         // beim Loslassen: kurzer Ton zum Hören der Lautstärke
    saveSettings();
    if (!sfxMuted) sfxTone(660, 0, 0.14, 'square', 0.2);
  });
  $('setMuteBtn').addEventListener('click', () => toggleMute());
  $('setDoneBtn').addEventListener('click', closeSettings);
  $('setDoneBtn2').addEventListener('click', closeSettings);
  $('settingsBtn').addEventListener('click', e => openSettings(e.currentTarget));
  $('pauseSettingsBtn').addEventListener('click', e => openSettings(e.currentTarget));

  try {                                         // Tastennamen passend zum Layout (nur Chromium, nur über https/localhost)
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then(m => { kbLayout = m; renderKeyHints(); }).catch(() => {});
    }
  } catch (e) { /* ignorieren */ }
  renderKeyHints();
  renderSettings();
}

function init() {
  loadSettings();
  container = $('game-container');
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('gameCanvas'), antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    setText($('overlaySub'), 'WebGL wird von diesem Browser nicht unterstützt.');
    $('startBtn').disabled = true;
    return;
  }
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // weiche Schattenkanten
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / Math.max(1, window.innerHeight), 0.3, ALPINE ? 900 : 700);

  buildWorld();
  bindUI();
  TOTAL_LAPS = selTrack.laps;
  buildLapDots();
  buildMinimap();
  best = loadRecords(selTrack.id);
  sfxMuted = loadMuted();
  applyMuteUI();
  updateBestDisplay();
  resizeCanvas();
  resetRace();
  state = 'menu';
  renderer.render(scene, camera);        // einmal vorab rendern: Shader/Texturen sind beim Start bereit, danach ruht die Szene bis zum Rennen
  initMenu();
  initSettingsUI();

  if (!loopStarted) {
    loopStarted = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  // Nach einem Strecken-Wechsel (Reload) direkt losfahren, sonst Menü mit Showroom zeigen
  let auto = false;
  try { auto = sessionStorage.getItem(AUTOSTART_KEY) === '1'; sessionStorage.removeItem(AUTOSTART_KEY); } catch (e) { /* ignorieren */ }
  if (auto) startCountdown(); else menu3d.start();
}

window.addEventListener('load', init);