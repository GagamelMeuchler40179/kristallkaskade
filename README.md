# Kristallkaskade

Kostenloses, **werbefreies** Match-3-Puzzle im Stil von Candy Crush Saga.
Steine verwandeln sich bei besonderen Kombinationen in Spezialsteine.

Aktuell: spielbare Web-/PWA-Version auf GitHub. Daraus wird später die Android-App (APK / Play Store).

## Spielen

- **Im Browser:** nach dem Aktivieren von GitHub Pages  
  `https://gagamelmeuchler40179.github.io/kristallkaskade/`
- **Auf Android (sofort):** Seite im Chrome öffnen → Menü → **Zum Startbildschirm hinzufügen**.  
  Die App startet dann ohne Browserleiste, offline, ohne Werbung.

Lokal:

```bash
# beliebiger statischer Server, z. B.
python3 -m http.server 8080
# dann http://localhost:8080 öffnen
```

## Spielregeln

Zwei benachbarte Steine tauschen (wischen oder klicken). Drei oder mehr gleiche Farben in einer Reihe oder Spalte verschwinden.

### Verwandlungen

| Kombination | Wird zu | Wirkung |
|---|---|---|
| **4 in einer Linie** | Gestreifter Stein | Räumt die ganze Reihe oder Spalte |
| **L- oder T-Form** | Umhüllter Stein | Explosion 3×3 (zweimal) |
| **5 in einer Linie** | Prismabombe | Tausch mit einer Farbe entfernt alle Steine dieser Farbe |

### Spezial-Kombos (zwei Spezialsteine tauschen)

- Streifen + Streifen → Kreuz (Reihe und Spalte)
- Streifen + Umhüllt → Riesenkreuz (3 Reihen und 3 Spalten)
- Umhüllt + Umhüllt → große Explosion 5×5
- Bombe + Farbe → alle Steine dieser Farbe weg
- Bombe + Streifen → alle Steine dieser Farbe werden zu Streifen und zünden
- Bombe + Umhüllt → alle Steine dieser Farbe werden zu Bomben und explodieren
- Bombe + Bombe → komplettes Feld leer

Ziel jedes Levels: Punktzahl erreichen, bevor die Züge ausgehen. Kettenreaktionen geben Extra-Punkte.

## Projektstand

- [x] Match-3-Kern (Tausch, Matches, Schwerkraft, Ketten)
- [x] Spezialsteine und Verwandlungen
- [x] Spezial-Kombos
- [x] 20 Level, Fortschritt lokal gespeichert
- [x] Touch-Steuerung für Android
- [x] PWA (installierbar, offline)
- [x] Keine Werbung, keine Tracker, kein Konto
- [ ] Native Android-Hülle (Capacitor) und Play-Store-Release

## Später: Android-APK

Wenn wir am Play Store ankommen:

1. [Node.js](https://nodejs.org/) und Android Studio installieren
2. Im Projektordner:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init Kristallkaskade app.kristallkaskade.game --web-dir .
npx cap add android
npx cap sync
npx cap open android
```

3. In Android Studio ein Release-APK bzw. AAB bauen und bei Google Play hochladen.

Keine Werbe-SDKs einbinden.

## Lizenz

MIT. Das Spiel ist frei spielbar und frei weiterentwickelbar.
Kein Bezug zu King, Candy Crush oder deren Marken/Grafiken.
