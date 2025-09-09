# VBN Info Board - Vollständige Lösung

## 🏗️ Projekt-Struktur

```
infoBoard/
├── index.html              # Frontend (Dark Mode Info Board)
├── backend/
│   ├── server.js           # Express.js Backend
│   ├── package.json        # Dependencies
│   └── README.md           # Backend Dokumentation
├── start-backend.bat       # Windows Starter Script
└── README.md              # Diese Datei
```

## 🚀 Installation & Start

### 1. Backend starten
```bash
# Option A: Automatisch (Windows)
.\start-backend.bat

# Option B: Manuell
cd backend
npm install
npm start
```

### 2. Frontend öffnen
- Öffne `index.html` im Browser
- Das Frontend verbindet sich automatisch mit `localhost:3000`

## 🔌 API Architecture

### Dreistufiger Fallback:
1. **VBN GTFS Realtime API** → Backend filtert echte Daten
2. **Backend Dummy** → Server generiert realistische Daten bei API-Ausfall
3. **Frontend Dummy** → Client-seitiger Notfall-Fallback

### Endpoints:
- `GET /api/haferkamp-hbf` - Hauptendpoint für Verbindungsdaten
- `GET /api/health` - Health Check

## ✨ Features

### Frontend:
- 🌙 **Dark Mode Only** Design
- 🚌 **Fokus auf Haferkamp → Bremen Hbf**
- 📊 **Detaillierte Verbindungsinfo** (Geplant/Tatsächlich für Abfahrt & Ankunft)
- 🎨 **Farbkodierte Verspätungen** (Grün/Gelb/Rot + 💀 für extreme Delays)
- ⚡ **Auto-Refresh** alle 60 Sekunden

### Backend:
- 🔌 **VBN API Integration** mit echten GTFS Realtime Daten
- 🛡️ **Robuster Fallback** bei API-Ausfällen
- 🌐 **CORS-enabled** für Frontend-Zugriff
- 📈 **Intelligente Datenfilterung** für relevante Verbindungen

## 🎯 Verwendung

Das System ist bereit für den Produktiveinsatz:
- **Entwicklung:** Backend läuft lokal, Frontend greift darauf zu
- **Produktion:** Backend kann auf beliebigen Server deployed werden
- **Offline:** Funktioniert auch ohne VBN API durch Dummy-Daten

## 📱 Live Demo

Sobald das Backend läuft, zeigt das Frontend:
- Aktuelle Abfahrtszeiten von Bremen Haferkamp
- Echte Verspätungsdaten von VBN (falls verfügbar)
- Ankunftszeiten am Bremen Hauptbahnhof
- Farbkodierte Pünktlichkeits-Anzeige