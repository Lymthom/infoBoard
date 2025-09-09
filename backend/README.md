# VBN Info Board Backend

## Installation
```bash
cd backend
npm install
```

## Starten
```bash
npm start
# oder für Development:
npm run dev
```

## Endpoints

### GET /api/haferkamp-hbf
Gibt aktuelle Verbindungsdaten von Bremen Haferkamp nach Bremen Hbf zurück.

**Response:**
```json
{
  "success": true,
  "isReal": true,
  "routes": [
    {
      "line": "6",
      "destination": "Bremen Hbf",
      "origin": "Bremen Haferkamp",
      "delay": 2,
      "isReal": true,
      "tripId": "...",
      "routeId": "..."
    }
  ],
  "timestamp": "2025-09-09T...",
  "source": "VBN GTFS Realtime API"
}
```

### GET /api/health
Health Check Endpoint

## Features
- 🔌 VBN GTFS Realtime API Integration
- 🛡️ Automatischer Fallback zu Dummy-Daten
- 🌐 CORS-enabled für Frontend
- 📊 Intelligente Datenfilterung
- ⏱️ Timestamp-basierte Antworten
