const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Mock-Daten für Bremen Hauptbahnhof mit realistischen Verspätungen
function generateMockDepartures() {
  const now = new Date();
  const departures = [];
  
  // Verschiedene Buslinien um Bremen Hbf
  const routes = [
    { route: '1', destination: 'Huchting', type: 'Bus' },
    { route: '2', destination: 'Gröpelingen', type: 'Bus' },
    { route: '3', destination: 'Weserwehr', type: 'Bus' },
    { route: '4', destination: 'Arbergen', type: 'Bus' },
    { route: '5', destination: 'Tenever', type: 'Bus' },
    { route: '6', destination: 'Universität', type: 'Bus' },
    { route: '8', destination: 'Kulenkampffallee', type: 'Bus' },
    { route: '10', destination: 'Sebaldsbrück', type: 'Bus' },
    { route: '25', destination: 'Überseestadt', type: 'Bus' },
    { route: '26', destination: 'Flughafen', type: 'Bus' },
    { route: 'RS1', destination: 'Verden', type: 'Bahn' },
    { route: 'RS2', destination: 'Bremerhaven', type: 'Bahn' },
    { route: 'RS3', destination: 'Oldenburg', type: 'Bahn' },
    { route: 'RE8', destination: 'Hamburg', type: 'Bahn' }
  ];
  
  // Nächste 20 Abfahrten generieren
  for (let i = 0; i < 20; i++) {
    const route = routes[Math.floor(Math.random() * routes.length)];
    const scheduledTime = new Date(now.getTime() + (i * 3 + Math.random() * 5) * 60000);
    
    // Zufällige Verspätung zwischen 0 und 8 Minuten
    const delayMinutes = Math.floor(Math.random() * 9);
    const actualTime = new Date(scheduledTime.getTime() + delayMinutes * 60000);
    
    // Gelegentlich pünktliche Verbindungen
    const isOnTime = Math.random() < 0.3;
    const finalTime = isOnTime ? scheduledTime : actualTime;
    const delay = isOnTime ? 0 : delayMinutes;
    
    departures.push({
      id: `${route.route}_${i}`,
      route: route.route,
      destination: route.destination,
      type: route.type,
      scheduledTime: scheduledTime.toISOString(),
      actualTime: finalTime.toISOString(),
      delay: delay,
      platform: Math.floor(Math.random() * 8) + 1,
      isRealtime: true,
      status: delay === 0 ? 'pünktlich' : delay < 3 ? 'leichte Verspätung' : 'Verspätung'
    });
  }
  
  // Nach Abfahrtszeit sortieren
  return departures.sort((a, b) => new Date(a.actualTime) - new Date(b.actualTime));
}

/**
 * Formatiert Zeitstempel für Anzeige
 */
function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Hauptendpoint für Bremen Hauptbahnhof Abfahrten
 */
app.get('/api/haferkamp-hbf', (req, res) => {
  try {
    console.log('\n=== Mock Bremen Hbf Abfahrten generiert ===');
    
    const departures = generateMockDepartures();
    
    // Für Frontend formatierte Antwort
    const formattedDepartures = departures.map(dep => ({
      ...dep,
      scheduledTimeFormatted: formatTime(dep.scheduledTime),
      actualTimeFormatted: formatTime(dep.actualTime),
      delayText: dep.delay === 0 ? '' : `+${dep.delay} Min`,
      delayClass: dep.delay === 0 ? 'ontime' : dep.delay < 3 ? 'slight-delay' : 'delay'
    }));
    
    console.log(`✅ ${formattedDepartures.length} Abfahrten generiert`);
    console.log(`📍 Bremen Hauptbahnhof (Mock-Daten mit realistischen Verspätungen)`);
    
    res.json({
      success: true,
      location: 'Bremen Hauptbahnhof',
      timestamp: new Date().toISOString(),
      departures: formattedDepartures,
      count: formattedDepartures.length,
      type: 'mock-realtime'
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Generieren der Mock-Daten:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      departures: []
    });
  }
});

/**
 * Test-Endpoint
 */
app.get('/api/test-otp', (req, res) => {
  res.json({
    success: true,
    message: 'Mock Info Board API funktioniert!',
    location: 'Bremen Hauptbahnhof',
    type: 'Mock-Daten mit Echtzeit-Verspätungen',
    timestamp: new Date().toISOString()
  });
});

/**
 * Automatische Aktualisierung alle Minute
 */
setInterval(() => {
  console.log(`🔄 ${new Date().toLocaleTimeString('de-DE')} - Mock-Daten aktualisiert`);
}, 60000);

// Server starten
app.listen(PORT, () => {
  console.log(`\n🚌 VBN Mock Info Board Server gestartet`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`🧪 Test-URL: http://localhost:${PORT}/api/test-otp`);
  console.log(`🚏 Bremen Hbf: http://localhost:${PORT}/api/haferkamp-hbf`);
  console.log(`⏰ Mock-Daten mit realistischen Verspätungen`);
  console.log(`📍 Location: Bremen Hauptbahnhof`);
  console.log(`🔄 Auto-Update: Jede Minute`);
});
