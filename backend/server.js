const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const https = require('https');
const unzipper = require('unzipper');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// VBN API endpoints
const VBN_GTFS_REALTIME_URL = 'https://gtfsr.vbn.de/gtfsr_connect.json';
const VBN_GTFS_STATIC_URL = 'https://www.connect-info.net/opendata/gtfs/connect-nds-toplevel/wftdkvbsii';

// GTFS Daten Cache
let gtfsData = {
  stops: new Map(),
  stopTimes: [],
  trips: new Map(),
  routes: new Map(),
  lastUpdated: null
};

// Haltestellen-IDs
const STOPS = {
  HAFERKAMP: '000009013912',
  BREMEN_HBF: '000009013925',
  BREMEN_HAUPTBAHNHOF: '000009013925'
};

// GTFS Download und Parse Funktionen
async function downloadAndUpdateGTFS(forceUpdate = false) {
  // Prüfe ob bereits aktuelle Daten vorhanden sind
  if (!forceUpdate && gtfsData.lastUpdated) {
    const hoursSinceUpdate = (Date.now() - gtfsData.lastUpdated.getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate < 1) {
      console.log(`⏰ GTFS data is still fresh (${Math.round(hoursSinceUpdate * 60)} minutes old), skipping download`);
      return;
    }
  }
  
  // Prüfe ob bereits eine persisted Version existiert
  const persistedDataPath = path.join(__dirname, 'gtfs_cache.json');
  if (!forceUpdate && fs.existsSync(persistedDataPath)) {
    try {
      const stats = fs.statSync(persistedDataPath);
      const hoursSinceFile = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceFile < 1) {
        console.log(`📂 Loading GTFS data from cache (${Math.round(hoursSinceFile * 60)} minutes old)...`);
        await loadGTFSFromCache();
        return;
      }
    } catch (error) {
      console.log('❌ Error reading cache file, proceeding with download');
    }
  }
  
  console.log('🔄 Downloading GTFS data...');
  
  try {
    const response = await fetch(VBN_GTFS_STATIC_URL);
    const buffer = await response.buffer();
    
    // Speichere ZIP temporär
    const zipPath = path.join(__dirname, 'temp_gtfs.zip');
    fs.writeFileSync(zipPath, buffer);
    
    // Extrahiere ZIP
    const extractPath = path.join(__dirname, 'gtfs_temp');
    if (fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true });
    }
    fs.mkdirSync(extractPath, { recursive: true });
    
    await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .promise();
    
    // Parse GTFS Dateien
    await parseGTFSFiles(extractPath);
    
    // Cleanup
    fs.unlinkSync(zipPath);
    fs.rmSync(extractPath, { recursive: true });
    
    gtfsData.lastUpdated = new Date();
    
    // Speichere Cache für nächsten Start
    await saveGTFSToCache();
    
    console.log('✅ GTFS data updated successfully');
    
  } catch (error) {
    console.error('❌ Error updating GTFS data:', error);
  }
}

async function saveGTFSToCache() {
  try {
    const cacheData = {
      stops: Array.from(gtfsData.stops.entries()),
      stopTimes: gtfsData.stopTimes,
      trips: Array.from(gtfsData.trips.entries()),
      routes: Array.from(gtfsData.routes.entries()),
      lastUpdated: gtfsData.lastUpdated
    };
    
    const cachePath = path.join(__dirname, 'gtfs_cache.json');
    fs.writeFileSync(cachePath, JSON.stringify(cacheData));
    console.log('💾 GTFS data saved to cache');
  } catch (error) {
    console.error('❌ Error saving GTFS cache:', error);
  }
}

async function loadGTFSFromCache() {
  try {
    const cachePath = path.join(__dirname, 'gtfs_cache.json');
    const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    
    gtfsData.stops = new Map(cacheData.stops);
    gtfsData.stopTimes = cacheData.stopTimes;
    gtfsData.trips = new Map(cacheData.trips);
    gtfsData.routes = new Map(cacheData.routes);
    gtfsData.lastUpdated = new Date(cacheData.lastUpdated);
    
    console.log('✅ GTFS data loaded from cache');
    console.log(`📊 Loaded ${gtfsData.stops.size} stops, ${gtfsData.trips.size} trips, ${gtfsData.stopTimes.length} stop_times`);
  } catch (error) {
    console.error('❌ Error loading GTFS cache:', error);
    throw error;
  }
}

async function parseGTFSFiles(extractPath) {
  console.log('📖 Parsing GTFS files...');
  
  // Parse stops.txt
  const stopsContent = fs.readFileSync(path.join(extractPath, 'stops.txt'), 'utf-8');
  const stopsLines = stopsContent.split('\n').slice(1); // Skip header
  
  gtfsData.stops.clear();
  stopsLines.forEach(line => {
    if (line.trim()) {
      const parts = parseCSVLine(line);
      if (parts.length >= 3) {
        gtfsData.stops.set(parts[0].replace(/"/g, ''), {
          id: parts[0].replace(/"/g, ''),
          name: parts[2].replace(/"/g, ''),
          lat: parseFloat(parts[4]) || 0,
          lon: parseFloat(parts[5]) || 0
        });
      }
    }
  });
  
  // Parse trips.txt
  const tripsContent = fs.readFileSync(path.join(extractPath, 'trips.txt'), 'utf-8');
  const tripsLines = tripsContent.split('\n').slice(1);
  
  gtfsData.trips.clear();
  tripsLines.forEach(line => {
    if (line.trim()) {
      const parts = parseCSVLine(line);
      if (parts.length >= 4) {
        gtfsData.trips.set(parts[2].replace(/"/g, ''), {
          routeId: parts[0].replace(/"/g, ''),
          serviceId: parts[1].replace(/"/g, ''),
          tripId: parts[2].replace(/"/g, ''),
          headsign: parts[3].replace(/"/g, '')
        });
      }
    }
  });
  
  // Parse routes.txt
  const routesContent = fs.readFileSync(path.join(extractPath, 'routes.txt'), 'utf-8');
  const routesLines = routesContent.split('\n').slice(1);
  
  gtfsData.routes.clear();
  routesLines.forEach(line => {
    if (line.trim()) {
      const parts = parseCSVLine(line);
      if (parts.length >= 3) {
        gtfsData.routes.set(parts[0].replace(/"/g, ''), {
          routeId: parts[0].replace(/"/g, ''),
          shortName: parts[2].replace(/"/g, ''),
          longName: parts[3] ? parts[3].replace(/"/g, '') : ''
        });
      }
    }
  });
  
  // Parse stop_times.txt (nur relevante Verbindungen)
  console.log('📖 Parsing stop_times.txt (this may take a while)...');
  const stopTimesContent = fs.readFileSync(path.join(extractPath, 'stop_times.txt'), 'utf-8');
  const stopTimesLines = stopTimesContent.split('\n').slice(1);
  
  gtfsData.stopTimes = [];
  const relevantTrips = new Set();
  
  // Erst alle Trips finden die Haferkamp bedienen
  stopTimesLines.forEach(line => {
    if (line.includes(STOPS.HAFERKAMP)) {
      const parts = line.split(',');
      if (parts.length >= 7) {
        relevantTrips.add(parts[0]);
      }
    }
  });
  
  // Dann alle stop_times für diese Trips sammeln
  stopTimesLines.forEach(line => {
    if (line.trim()) {
      const parts = line.split(',');
      if (parts.length >= 7 && relevantTrips.has(parts[0])) {
        gtfsData.stopTimes.push({
          tripId: parts[0],
          stopId: parts[1],
          stopSequence: parseInt(parts[2]) || 0,
          arrivalTime: parts[6],
          departureTime: parts[7]
        });
      }
    }
  });
  
  console.log(`📊 Parsed ${gtfsData.stops.size} stops, ${gtfsData.trips.size} trips, ${gtfsData.stopTimes.length} stop_times`);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

// Neue API Route mit GTFS + Realtime Daten
app.get('/api/haferkamp-hbf', async (req, res) => {
  try {
    // Prüfe ob GTFS Daten verfügbar sind
    if (!gtfsData.lastUpdated) {
      return res.json({
        success: false,
        message: 'GTFS data not loaded yet',
        trips: getFallbackTrips()
      });
    }

    console.log('🚌 Getting next departures from Haferkamp to Bremen Hbf...');
    
    // Hole aktuelle Zeit
    const now = new Date();
    const currentTime = formatTimeToGTFS(now);
    
    // Finde nächste Abfahrten aus GTFS Daten
    const nextTrips = getNextDeparturesFromGTFS(currentTime, 10);
    
    // Hole Realtime-Verspätungen
    const realtimeData = await getRealtimeDelays();
    
    // Kombiniere GTFS + Realtime über Zeit-basiertes Matching
    const enhancedTrips = nextTrips.map(trip => {
      // Versuche Delay über Trip-ID zu finden
      let delay = realtimeData.tripDelays.get(trip.tripId) || 0;
      
      // Falls keine direkte Trip-ID gefunden, versuche Zeit-basiertes Matching
      if (delay === 0) {
        delay = findDelayByTimeAndLine(trip, realtimeData) || 0;
      }
      
      console.log(`🔗 Trip ${trip.tripId} (Line ${trip.line} at ${trip.departureTime}): ${delay > 0 ? `${delay}min delay` : 'no delay data'}`);
      return {
        ...trip,
        delay: delay,
        actualDepartureTime: addMinutesToTime(trip.departureTime, delay),
        isReal: true
        
      };
    });

    console.log(`✅ Found ${enhancedTrips.length} next departures, ${enhancedTrips.filter(t => t.delay > 0).length} with delays`);
    
    res.json({
      success: true,
      lastUpdated: gtfsData.lastUpdated,
      routes: enhancedTrips.slice(0, 3), // Frontend erwartet 'routes' nicht 'trips'
      isReal: true,
      source: 'VBN GTFS + Realtime API'
    });
    
  } catch (error) {
    console.error('❌ Error fetching departures:', error);
    res.json({
      success: false,
      message: error.message,
      trips: getFallbackTrips()
    });
  }
});

function getNextDeparturesFromGTFS(currentTime, maxResults = 10) {
  const departures = [];
  
  console.log(`🕐 Looking for departures after: ${currentTime}`);
  
  // Durchsuche alle stop_times für Haferkamp
  gtfsData.stopTimes.forEach(stopTime => {
    // Bereinige Zeitstring (entferne \r und \n)
    const cleanDepartureTime = stopTime.departureTime.replace(/[\r\n]/g, '');
    const cleanArrivalTime = stopTime.arrivalTime.replace(/[\r\n]/g, '');
    
    // Prüfe ob es eine Abfahrt von Haferkamp ist UND in der Zukunft liegt
    if (stopTime.stopId === STOPS.HAFERKAMP && isTimeAfter(cleanDepartureTime, currentTime)) {
      
      // Prüfe ob dieser Trip auch den Hbf anfährt
      const hbfStop = gtfsData.stopTimes.find(st => 
        st.tripId === stopTime.tripId && 
        (st.stopId === STOPS.BREMEN_HBF || st.stopId === STOPS.BREMEN_HAUPTBAHNHOF) &&
        st.stopSequence > stopTime.stopSequence
      );
      
      if (hbfStop) {
        const trip = gtfsData.trips.get(stopTime.tripId);
        const route = trip ? gtfsData.routes.get(trip.routeId) : null;
        const cleanHbfArrivalTime = hbfStop.arrivalTime.replace(/[\r\n]/g, '');
        
        departures.push({
          tripId: stopTime.tripId,
          line: route ? route.shortName : 'Unknown',
          destination: trip ? trip.headsign : 'Bremen Hbf',
          origin: 'Bremen Haferkamp',
          departureTime: cleanDepartureTime,
          arrivalTime: cleanHbfArrivalTime,
          delay: 0 // Wird später mit Realtime-Daten ergänzt
        });
      }
    }
  });
  
  // Sortiere nach Abfahrtszeit
  departures.sort((a, b) => compareGTFSTimes(a.departureTime, b.departureTime));
  
  // Entferne Duplikate (gleiche Linie + Zeit + Ziel)
  const uniqueDepartures = [];
  const seen = new Set();
  
  for (const dep of departures) {
    const key = `${dep.line}-${dep.departureTime}-${dep.destination}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueDepartures.push(dep);
    }
  }
  
  // Bevorzuge verschiedene Linien - sortiere so dass verschiedene Linien zuerst kommen
  const diverseResults = [];
  const usedLines = new Set();
  
  // Erst: Eine Abfahrt pro Linie
  for (const dep of uniqueDepartures) {
    if (!usedLines.has(dep.line)) {
      usedLines.add(dep.line);
      diverseResults.push(dep);
    }
  }
  
  // Dann: Fülle mit restlichen Abfahrten auf
  for (const dep of uniqueDepartures) {
    if (diverseResults.length >= maxResults) break;
    if (!diverseResults.includes(dep)) {
      diverseResults.push(dep);
    }
  }
  
  console.log(`📊 Found ${departures.length} total, ${uniqueDepartures.length} unique, showing ${Math.min(diverseResults.length, maxResults)} diverse departures`);
  diverseResults.slice(0, maxResults).forEach(dep => {
    console.log(`  🚌 Line ${dep.line} at ${dep.departureTime} to ${dep.destination}`);
  });
  
  return diverseResults.slice(0, maxResults);
}

async function getRealtimeDelays() {
  const delays = new Map();
  const timeBasedDelays = []; // Für Zeit-basiertes Matching
  
  try {
    const response = await fetch(VBN_GTFS_REALTIME_URL);
    if (!response.ok) return { tripDelays: delays, timeDelays: timeBasedDelays };
    
    const data = await response.json();
    
    console.log(`🔄 Processing ${data.entity ? data.entity.length : 0} realtime entities...`);
    
    let haferkampTripsFound = 0;
    let delaysFound = 0;
    
    if (data.entity && Array.isArray(data.entity)) {
      data.entity.forEach(entity => {
        if (entity.tripUpdate && entity.tripUpdate.trip) {
          const tripId = entity.tripUpdate.trip.tripId;
          const routeId = entity.tripUpdate.trip.routeId;
          
          // Suche nach Haferkamp in diesem Trip
          if (entity.tripUpdate.stopTimeUpdate) {
            const haferkampUpdate = entity.tripUpdate.stopTimeUpdate.find(
              stu => stu.stopId === STOPS.HAFERKAMP
            );
            
            if (haferkampUpdate) {
              haferkampTripsFound++;
              
              if (haferkampUpdate.departure && haferkampUpdate.departure.delay) {
                const delayMinutes = Math.round(haferkampUpdate.departure.delay / 60);
                delays.set(tripId, delayMinutes);
                delaysFound++;
                
                // Auch für Zeit-basiertes Matching speichern
                timeBasedDelays.push({
                  tripId: tripId,
                  routeId: routeId,
                  delay: delayMinutes,
                  stopId: haferkampUpdate.stopId
                });
                
                console.log(`⏰ Delay found for trip ${tripId} (route ${routeId}): ${delayMinutes} minutes`);
              }
            }
          }
        }
      });
    }
    
    console.log(`📊 Realtime summary: ${haferkampTripsFound} Haferkamp trips, ${delaysFound} with delays`);
    
  } catch (error) {
    console.error('❌ Error fetching realtime delays:', error);
  }
  
  return { tripDelays: delays, timeDelays: timeBasedDelays };
}

function findDelayByTimeAndLine(gtfsTrip, realtimeData) {
  // Verwende die timeBasedDelays für approximatives Matching
  if (!realtimeData.timeDelays) return 0;
  
  // Einfache Strategie: Nimm den ersten Delay der gleichen Linie
  const route = gtfsData.routes.get(gtfsTrip.routeId);
  const lineNumber = route ? route.shortName : gtfsTrip.line;
  
  for (const realtimeTrip of realtimeData.timeDelays) {
    const realtimeRoute = gtfsData.routes.get(realtimeTrip.routeId);
    const realtimeLineNumber = realtimeRoute ? realtimeRoute.shortName : 'unknown';
    
    if (realtimeLineNumber === lineNumber && realtimeTrip.delay > 0) {
      console.log(`🎯 Matched line ${lineNumber}: using ${realtimeTrip.delay}min delay from trip ${realtimeTrip.tripId}`);
      return realtimeTrip.delay;
    }
  }
  
  return 0;
}

function formatTimeToGTFS(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function addMinutesToTime(timeString, minutes) {
  if (!minutes) return timeString;
  
  const [hours, mins, secs] = timeString.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  
  return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function isTimeAfter(timeA, timeB) {
  // Konvertiere beide Zeiten zu Minuten seit Mitternacht
  const minutesA = timeToMinutes(timeA);
  const minutesB = timeToMinutes(timeB);
  return minutesA > minutesB;
}

function timeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

function compareGTFSTimes(timeA, timeB) {
  const minutesA = timeToMinutes(timeA);
  const minutesB = timeToMinutes(timeB);
  return minutesA - minutesB;
}

function getFallbackTrips() {
  return [
    {
      line: '6',
      destination: 'Bremen Hbf',
      origin: 'Bremen Haferkamp',
      departureTime: '15:45:00',
      delay: 0,
      isReal: false
    },
    {
      line: '6', 
      destination: 'Bremen Hbf',
      origin: 'Bremen Haferkamp', 
      departureTime: '16:00:00',
      delay: 2,
      isReal: false
    },
    {
      line: '6',
      destination: 'Bremen Hbf',
      origin: 'Bremen Haferkamp',
      departureTime: '16:15:00', 
      delay: 0,
      isReal: false
    }
  ];
}

// Stündlicher GTFS Update
setInterval(downloadAndUpdateGTFS, 60 * 60 * 1000); // Jede Stunde

// Initialer GTFS Download beim Start
downloadAndUpdateGTFS();

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    gtfsLastUpdated: gtfsData.lastUpdated,
    gtfsStops: gtfsData.stops.size,
    gtfsTrips: gtfsData.trips.size,
    gtfsStopTimes: gtfsData.stopTimes.length
  });
});

// Force GTFS update endpoint
app.post('/api/update-gtfs', async (req, res) => {
  try {
    console.log('🔄 Manual GTFS update requested...');
    await downloadAndUpdateGTFS(true); // Force update
    res.json({
      success: true,
      message: 'GTFS data updated successfully',
      lastUpdated: gtfsData.lastUpdated
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Error updating GTFS data: ' + error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 VBN Info Board Backend running on http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/api/status`);
  console.log(`🚌 Haferkamp-Hbf: http://localhost:${PORT}/api/haferkamp-hbf`);
});
