const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// VBN OTP API Configuration
const VBN_API_KEY = 'd2471aa95981455d8d0965c14b41efab';
const VBN_OTP_BASE_URL = 'http://gtfsr.vbn.de/api/otp/routers/default';

app.use(cors());
app.use(express.json());

// Bremen Hauptbahnhof Koordinaten (funktioniert nachweislich)
const HAFERKAMP_COORDS = {
  lat: 53.083257,
  lon: 8.813857
};

/**
 * Findet Haltestellen in der Nähe von Haferkamp
 */
async function findNearbyStops(lat, lon, radius = 300) {
  try {
    const response = await fetch(`${VBN_OTP_BASE_URL}/index/stops?lat=${lat}&lon=${lon}&radius=${radius}`, {
      headers: {
        'Authorization': `Bearer ${VBN_API_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const stops = await response.json();
    console.log(`Found ${stops.length} stops within ${radius}m of Haferkamp`);
    
    return stops.filter(stop => 
      stop.name && stop.name.toLowerCase().includes('haferkamp')
    ).slice(0, 10); // Nur die ersten 10 Haferkamp-Stops
    
  } catch (error) {
    console.error('Error finding nearby stops:', error.message);
    return [];
  }
}

/**
 * Holt Abfahrten für eine spezifische Haltestelle mit Echtzeit-Daten
 */
async function getStopDepartures(stopId, maxResults = 20) {
  try {
    const now = new Date();
    const startTime = Math.floor(now.getTime() / 1000);
    const timeRange = 3600 * 3; // 3 Stunden

    const response = await fetch(`${VBN_OTP_BASE_URL}/index/stops/${encodeURIComponent(stopId)}/stoptimes/${startTime}/${startTime + timeRange}`, {
      headers: {
        'Authorization': `Bearer ${VBN_API_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const stopTimes = await response.json();
    
    return stopTimes.slice(0, maxResults).map(st => ({
      stopId: stopId,
      stopName: st.stopName || 'Unbekannt',
      routeShortName: st.routeShortName || st.routeLongName || 'N/A',
      tripHeadsign: st.tripHeadsign || 'Ziel unbekannt',
      scheduledDeparture: formatTimestamp(st.scheduledDeparture),
      realtimeDeparture: st.realtimeDeparture ? formatTimestamp(st.realtimeDeparture) : null,
      delay: st.realtimeDeparture ? Math.floor((st.realtimeDeparture - st.scheduledDeparture) / 60) : 0,
      realtime: !!st.realtimeDeparture,
      vehicleMode: getVehicleMode(st.routeType)
    }));

  } catch (error) {
    console.error(`Error getting departures for stop ${stopId}:`, error.message);
    return [];
  }
}

/**
 * Formatiert Unix-Timestamp zu lesbarer Zeit
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('de-DE', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

/**
 * Bestimmt Verkehrsmittel-Typ basierend auf GTFS Route Type
 */
function getVehicleMode(routeType) {
  const modes = {
    0: 'Straßenbahn', // Tram
    1: 'U-Bahn',      // Subway
    2: 'Bahn',        // Rail
    3: 'Bus',         // Bus
    4: 'Fähre',       // Ferry
    700: 'Bus',       // Bus service
    900: 'Straßenbahn' // Tram service
  };
  return modes[routeType] || 'Unbekannt';
}

/**
 * API Route für alle Haferkamp Abfahrten mit Echtzeit
 */
app.get('/api/haferkamp-hbf', async (req, res) => {
  try {
    console.log('\n=== OTP API Anfrage für Haferkamp Abfahrten ===');
    
    // Finde alle Haferkamp Haltestellen
    const nearbyStops = await findNearbyStops(HAFERKAMP_COORDS.lat, HAFERKAMP_COORDS.lon, 500);
    
    if (nearbyStops.length === 0) {
      console.log('❌ Keine Haferkamp-Haltestellen gefunden');
      return res.json([]);
    }

    console.log(`📍 Gefundene Haferkamp-Haltestellen: ${nearbyStops.length}`);
    nearbyStops.forEach(stop => {
      console.log(`  - ${stop.name} (ID: ${stop.id})`);
    });

    // Sammle alle Abfahrten von allen Haferkamp-Haltestellen
    let allDepartures = [];
    
    for (const stop of nearbyStops) {
      console.log(`\n🚌 Lade Abfahrten für: ${stop.name}`);
      const departures = await getStopDepartures(stop.id, 15);
      
      departures.forEach(dep => {
        dep.stopName = stop.name; // Setze korrekten Haltestellennamen
      });
      
      allDepartures.push(...departures);
      console.log(`   ✅ ${departures.length} Abfahrten gefunden`);
    }

    // Entferne Duplikate und sortiere nach Zeit
    const uniqueDepartures = removeDuplicateDepartures(allDepartures);
    uniqueDepartures.sort((a, b) => {
      const timeA = parseTimeForSort(a.realtimeDeparture || a.scheduledDeparture);
      const timeB = parseTimeForSort(b.realtimeDeparture || b.scheduledDeparture);
      return timeA - timeB;
    });

    // Statistiken ausgeben
    const withRealtime = uniqueDepartures.filter(d => d.realtime).length;
    const withDelays = uniqueDepartures.filter(d => d.delay > 0).length;
    
    console.log(`\n📊 === Ergebnis-Statistiken ===`);
    console.log(`📍 Gesamte Abfahrten: ${uniqueDepartures.length}`);
    console.log(`🔴 Mit Echtzeit: ${withRealtime}`);
    console.log(`⏰ Mit Verspätungen: ${withDelays}`);
    
    // Zeige erste paar Abfahrten
    console.log(`\n🚌 === Nächste Abfahrten ===`);
    uniqueDepartures.slice(0, 8).forEach((dep, i) => {
      const time = dep.realtimeDeparture || dep.scheduledDeparture;
      const delayStr = dep.delay > 0 ? ` (+${dep.delay}min)` : dep.realtime ? ' (pünktlich)' : '';
      console.log(`${i+1}. ${dep.routeShortName} → ${dep.tripHeadsign} | ${time}${delayStr} | ${dep.vehicleMode}`);
    });

    res.json(uniqueDepartures.slice(0, 15));

  } catch (error) {
    console.error('❌ Error in /api/haferkamp-hbf:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
});

/**
 * Entfernt Duplikate aus Abfahrten
 */
function removeDuplicateDepartures(departures) {
  const seen = new Set();
  return departures.filter(dep => {
    const key = `${dep.routeShortName}-${dep.tripHeadsign}-${dep.scheduledDeparture}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Parst Zeit für Sortierung
 */
function parseTimeForSort(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  const now = new Date();
  const time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  
  // Falls Zeit in der Vergangenheit liegt, füge 24 Stunden hinzu (nächster Tag)
  if (time < now) {
    time.setDate(time.getDate() + 1);
  }
  
  return time;
}

/**
 * Test-Route für OTP API Verbindung
 */
app.get('/api/test-otp', async (req, res) => {
  try {
    const response = await fetch(`${VBN_OTP_BASE_URL}/index/stops?lat=53.0827&lon=8.8131&radius=200`, {
      headers: {
        'Authorization': `Bearer ${VBN_API_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const stops = await response.json();
    
    res.json({
      success: true,
      message: 'OTP API funktioniert!',
      testLocation: 'Bremen Hauptbahnhof',
      stopsFound: stops.length,
      firstStop: stops[0] || null
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Route für Suche nach Haltestellen
 */
app.get('/api/search-stops/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const stops = await findNearbyStops(HAFERKAMP_COORDS.lat, HAFERKAMP_COORDS.lon, 1000);
    
    const filteredStops = stops.filter(stop => 
      stop.name && stop.name.toLowerCase().includes(query.toLowerCase())
    );

    res.json(filteredStops);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    apiKey: VBN_API_KEY ? 'Configured' : 'Missing',
    service: 'VBN OpenTripPlanner API'
  });
});

// Static files
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`\n🚀 VBN OTP Info Board Server gestartet`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔑 API Key: ${VBN_API_KEY ? '✅ Konfiguriert' : '❌ FEHLT!'}`);
  console.log(`🌐 Test-URL: http://localhost:${PORT}/api/test-otp`);
  console.log(`🚌 Haferkamp-URL: http://localhost:${PORT}/api/haferkamp-hbf`);
  console.log(`⏰ OTP API mit integrierter Echtzeit-Verspätungserkennung`);
  console.log(`📊 Koordinaten: ${HAFERKAMP_COORDS.lat}, ${HAFERKAMP_COORDS.lon}\n`);
});
