# Anamorph

Ein browserbasiertes Perspektiv-Puzzle: Du zeichnest mit ein paar Strichen eine
Skizze — Plattformen als Punkte, Wege als Linien — und Anamorph verwandelt sie
in eine 3D-Struktur, deren Wege aus fast jedem Blickwinkel zerfallen wirken.
Nur bei bestimmten Rotationswinkeln "klicken" verbundene Plattformen optisch
zusammen (Prinzip: Anamorphose). Drehe die Struktur wie einen Zauberwürfel,
finde die richtigen Ansichten und führe die Figur zum Ziel.

## Spielen

1. **Zeichnen** — Tippe auf das Papier, um Plattformen zu setzen (max. 12).
   Ziehe von Punkt zu Punkt, um Wege zu verbinden. Markiere Start 🟢 und
   Ziel 🚩. Oder lade eine der fünf Beispiel-Skizzen.
2. **Verwandeln** — „In 3D verwandeln“ erzeugt die Struktur. Eine
   Lösbarkeitsprüfung garantiert, dass jedes generierte Level lösbar ist.
3. **Lösen** — Ziehen dreht die Struktur (sanftes Snapping auf 8 Blickwinkel),
   Tippen lässt die Figur per BFS über die gerade aktiven Wege Richtung Ziel
   laufen. Aktive Wege leuchten als pulsierende Brücken.

## Wie die Anamorphose funktioniert

- **Generator** ([src/game/generator.ts](src/game/generator.ts)): Jede
  Spannbaum-Kante der Skizze bekommt einen der 8 Snap-Winkel zugewiesen. Der
  Kind-Knoten wird entlang der Blickrichtung dieses Winkels in die Tiefe
  versetzt, plus ca. eine Plattformbreite Versatz in der Bildebene. Aus genau
  diesem Winkel erscheinen beide Plattformen benachbart, aus der Startansicht
  garantiert getrennt. Eine Constraint-/Retry-Schleife verhindert
  Durchdringungen und unlösbare Level.
- **Anamorphose-Check** ([src/game/anamorph.ts](src/game/anamorph.ts)): Pro
  Frame werden alle Plattform-Endpunkte über die Orthokamera auf
  Bildschirmkoordinaten projiziert; fällt eine verbundene Zweiergruppe
  innerhalb der Toleranz zusammen, gilt die Kante als „aktiv“.
- **Bewegung** ([src/game/pathfinding.ts](src/game/pathfinding.ts)): BFS über
  die aktuell aktiven Kanten; erreicht sie das Ziel nicht, läuft die Figur zum
  erreichbaren Knoten, der dem Ziel am nächsten ist.

## Entwicklung

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # statisches Build nach dist/
```

Stack: React 18 · Vite · TypeScript · Tailwind CSS 4 · Three.js. Kein Backend.

Die Kernlogik ist headless mit Node ausführbar (Type-Stripping), z. B. für
Lösbarkeits-Tests über alle Beispiel-Skizzen und Seeds.

## Deployment

Statisches Build, kein Server nötig.

- **Vercel**: Repo importieren — Vite wird automatisch erkannt
  (Build `npm run build`, Output `dist`). Fertig.
- **Netlify**: [netlify.toml](netlify.toml) liegt bei — Repo verbinden oder
  `netlify deploy --prod` ausführen.
