const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// VBN HAFAS API Configuration
const VBN_API_KEY = 'd2471aa95981455d8d0965c14b41efab';
const VBN_HAFAS_BASE_URL = 'https://fahrplaner.vbn.de/restproxy/';

app.use(cors());
app.use(express.json());

// Haferkamp Haltestellen IDs (mit VBN Location API ermittelt)
const HAFERKAMP_STOPS = {
  'A003338': 'Bremen Haferkamp/Predigersteg',
  'A003339': 'Bremen Haferkamp/Predigersteg',
  'A003346': 'Bremen Haferkamp/Richtweg', 
  'A003347': 'Bremen Haferkamp/Richtweg',
  'A003350': 'Bremen Haferkamp/Kornstraße',
  'A003351': 'Bremen Haferkamp/Kornstraße',
  'A003352': 'Bremen Haferkamp/Kornstraße',
  'A003353': 'Bremen Haferkamp/Kornstraße'
};

// Cache für Haltestellen-IDs
let stationIdCache = {};

/**
 * Sucht nach Haltestellen-IDs basierend auf Namen
 */
async function findStationId(stationName) {
  if (stationIdCache[stationName]) {
    return stationIdCache[stationName];
  }

  try {
    const response = await fetch(`${VBN_HAFAS_BASE_URL}location.name`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': 'fahrplaner.vbn.de'
      },
      body: `accessId=${VBN_API_KEY}&input=${encodeURIComponent(stationName)}`
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.text();
    console.log(`Location search for "${stationName}":`, data.substring(0, 500));
    
    // Parse XML response für Haltestellen-IDs
    const locationMatches = data.match(/<Location[^>]*id="([^"]*)"[^>]*name="([^"]*)"/g);
    if (locationMatches && locationMatches.length > 0) {
      const match = locationMatches[0];
      const idMatch = match.match(/id="([^"]*)"/);
      if (idMatch) {
        const stationId = idMatch[1];
        stationIdCache[stationName] = stationId;
        console.log(`Found station ID for "${stationName}": ${stationId}`);
        return stationId;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error finding station ID for "${stationName}":`, error.message);
    return null;
  }
}

/**
 * Holt Abfahrten für eine Haltestelle mit Echtzeit-Daten
 */
async function getDeparturesForStation(stationId) {
  try {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toTimeString().slice(0, 8);

    const response = await fetch(`${VBN_HAFAS_BASE_URL}departureBoard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': 'fahrplaner.vbn.de'
      },
      body: `accessId=${VBN_API_KEY}&id=${stationId}&date=${date}&time=${time}&duration=120`
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlData = await response.text();
    console.log(`Departure board for station ${stationId}:`, xmlData.substring(0, 800));

    return parseDepartureXML(xmlData);
  } catch (error) {
    console.error(`Error getting departures for station ${stationId}:`, error.message);
    return [];
  }
}

/**
 * Parst XML-Antwort der HAFAS API in JSON-Abfahrten
 */
function parseDepartureXML(xmlData) {
  const departures = [];
  
  try {
    // Einfache Regex-basierte XML-Parsing für Abfahrten
    const departurePattern = /<Departure[^>]*name="([^"]*)"[^>]*type="([^"]*)"[^>]*stop="([^"]*)"[^>]*time="([^"]*)"[^>]*date="([^"]*)"[^>]*rtTime="([^"]*)"?[^>]*rtDate="([^"]*)"?[^>]*>/g;
    
    let match;
    while ((match = departurePattern.exec(xmlData)) !== null) {
      const [, lineName, vehicleType, stopName, scheduledTime, scheduledDate, realTime, realDate] = match;
      
      // Berechne Verspätung
      const scheduledDateTime = parseDateTime(scheduledDate, scheduledTime);
      const realDateTime = realTime ? parseDateTime(realDate || scheduledDate, realTime) : scheduledDateTime;
      const delayMinutes = Math.floor((realDateTime - scheduledDateTime) / (1000 * 60));

      departures.push({
        line: lineName,
        destination: extractDestination(xmlData, match.index),
        vehicleType: vehicleType,
        scheduledTime: formatTime(scheduledDateTime),
        realTime: formatTime(realDateTime),
        delay: delayMinutes,
        stopName: stopName
      });
    }

    return departures.slice(0, 10); // Limitiere auf 10 Abfahrten
  } catch (error) {
    console.error('Error parsing departure XML:', error.message);
    return [];
  }
}

/**
 * Extrahiert Ziel aus XML-Kontext
 */
function extractDestination(xmlData, startIndex) {
  const contextStart = Math.max(0, startIndex - 200);
  const contextEnd = Math.min(xmlData.length, startIndex + 500);
  const context = xmlData.slice(contextStart, contextEnd);
  
  const directionMatch = context.match(/direction="([^"]*)"/);
  return directionMatch ? directionMatch[1] : 'Unbekannt';
}

/**
 * Parst Datum und Zeit aus HAFAS Format
 */
function parseDateTime(date, time) {
  const year = date.substring(0, 4);
  const month = date.substring(4, 6);
  const day = date.substring(6, 8);
  
  const hours = time.substring(0, 2);
  const minutes = time.substring(3, 5);
  const seconds = time.substring(6, 8) || '00';
  
  return new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`);
}

/**
 * Formatiert Zeit für Anzeige
 */
function formatTime(date) {
  return date.toLocaleTimeString('de-DE', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

/**
 * API Route für Haferkamp Abfahrten
 */
app.get('/api/haferkamp-hbf', async (req, res) => {
  try {
    console.log('\n=== Neue Abfahrten-Anfrage für Haferkamp ===');
    
    let allDepartures = [];

    // Durchsuche alle bekannten Haferkamp Haltestellen
    for (const [stationId, stationName] of Object.entries(HAFERKAMP_STOPS)) {
      console.log(`\nHole Abfahrten für ${stationName} (ID: ${stationId})`);
      
      const departures = await getDeparturesForStation(stationId);
      
      departures.forEach(dep => {
        dep.stopName = stationName; // Setze korrekten Haltestellennamen
      });
      
      allDepartures.push(...departures);
    }

    // Falls keine Haltestellen-IDs funktionieren, suche dynamisch
    if (allDepartures.length === 0) {
      console.log('\nKeine Abfahrten über vordefinierte IDs gefunden. Suche dynamisch nach Haferkamp...');
      
      const searchTerms = ['Bremen Haferkamp', 'Haferkamp', 'Bremen Haferkamp/Predigersteg'];
      
      for (const searchTerm of searchTerms) {
        const stationId = await findStationId(searchTerm);
        if (stationId) {
          const departures = await getDeparturesForStation(stationId);
          allDepartures.push(...departures);
          
          if (departures.length > 0) break; // Stoppe bei ersten erfolgreichen Ergebnissen
        }
      }
    }

    // Entferne Duplikate und sortiere nach Zeit
    const uniqueDepartures = removeDuplicateDepartures(allDepartures);
    uniqueDepartures.sort((a, b) => {
      const timeA = parseTimeForSort(a.realTime || a.scheduledTime);
      const timeB = parseTimeForSort(b.realTime || b.scheduledTime);
      return timeA - timeB;
    });

    console.log(`\n=== Gefunden: ${uniqueDepartures.length} Abfahrten ===`);
    uniqueDepartures.slice(0, 5).forEach(dep => {
      console.log(`${dep.line} → ${dep.destination} | ${dep.realTime}${dep.delay > 0 ? ` (+${dep.delay}min)` : ''}`);
    });

    res.json(uniqueDepartures.slice(0, 10));

  } catch (error) {
    console.error('Error in /api/haferkamp-hbf:', error);
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
    const key = `${dep.line}-${dep.destination}-${dep.scheduledTime}`;
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
  
  // Falls Zeit in der Vergangenheit liegt, add 24 Stunden (nächster Tag)
  if (time < now) {
    time.setDate(time.getDate() + 1);
  }
  
  return time;
}

/**
 * Test-Route für API-Verbindung
 */
app.get('/api/test', async (req, res) => {
  try {
    const testStationId = await findStationId('Bremen Hauptbahnhof');
    if (testStationId) {
      const departures = await getDeparturesForStation(testStationId);
      res.json({
        success: true,
        stationId: testStationId,
        departureCount: departures.length,
        departures: departures.slice(0, 3)
      });
    } else {
      res.json({ success: false, message: 'Station nicht gefunden' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    apiKey: VBN_API_KEY ? 'Configured' : 'Missing'
  });
});

// Static files
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`\n🚀 VBN HAFAS Info Board Server gestartet`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔑 API Key: ${VBN_API_KEY ? 'Konfiguriert' : 'FEHLT!'}`);
  console.log(`🌐 Test-URL: http://localhost:${PORT}/api/test`);
  console.log(`🚌 Haferkamp-URL: http://localhost:${PORT}/api/haferkamp-hbf`);
  console.log(`⏰ Automatische Echtzeit-Abfragen mit integrierter Verspätungserkennung\n`);
});
