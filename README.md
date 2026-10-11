# RSSI Rescue Pod — Command Dashboard

A real-time search-and-rescue dashboard for a sensor pod that detects people trapped under rubble. The pod (ESP8266) reads **body heat, phone signal strength (RSSI) and gas**. The dashboard shows each detection on a live map, lets command send the **fastest team by the quickest road route**, and tracks the team until it arrives.

## Features

- **Live detections** streamed over WebSockets from the pod (USB serial bridge, HTTP, or the built-in simulator)
- **Confidence tiers**: High, Low, Gas hazard (veto), No signal
- **Optimised dispatch**: every team is ranked by arrival time, and the quickest road route is chosen automatically
- **Job queueing**: a busy team can be given more detections, which are visited in order
- **Live tracking**: teams move along the planned road, the ETA counts down, and arrival is announced
- **Location correction**: command can set the true position on the map (the pod has no GPS)
- **Team chat** between command and teams
- **Role-based views**: command sees everything, teams see their own detections
- **Responsive UI** that works on desktop and phone

## How routing works

When command sends a team to a HIGH detection:

1. The backend asks [OSRM](https://project-osrm.org/) for up to **3 road routes** and keeps the one with the **lowest travel time** (shorter distance breaks near-ties).
2. The dispatch panel **ranks all teams by arrival time**, including the time a busy team needs to finish its current jobs. The fastest team is pre-selected and tagged *Fastest*.
3. If a team receives several detections, they are **queued in order**, and each route starts where the previous job ends. Moving a detection on the map re-plans the whole chain.
4. Teams travel **along the planned path** at constant speed. Only the road still ahead is drawn, and the ETA updates every second.
5. If OSRM is unreachable, the system falls back to a **straight-line estimate** and the UI says so.

## Project structure

```
backend/
  server.js            Express + Socket.IO API, routing, team movement
  serial-bridge.js     Reads pod JSON from USB serial, posts to /api/ingest
  simulate-hardware.js Sends random realistic detections (no hardware needed)
firmware/
  README.md            Pod JSON format, pin map, connection methods
frontend/
  src/App.jsx          Dashboard shell and live state
  src/components/      Login, MapView, DetectionList, DetailPanel, ChatPanel
  src/lib/format.js    Colours, labels, formatting helpers
  src/styles.css       Design tokens and all styling
```

## Requirements

- Node.js 18 or newer
- Internet access for map tiles and for road routing (OSRM). Without it, routing falls back to straight lines.

## Getting started

### 1. Backend
```bash
cd backend
npm install
npm start
```
Runs on http://localhost:4000.

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173.

### 3. Detections (pick one)

**Simulator, no hardware:**
```bash
cd backend
node simulate-hardware.js
```

**Real pod over USB** (close the Arduino Serial Monitor first, use your real port):
```bash
cd backend
node serial-bridge.js COM3          # Windows
node serial-bridge.js /dev/ttyUSB0  # Linux
```

**Manual test:**
```bash
curl -X POST http://localhost:4000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"temp_c":35.2,"rssi":-61,"heat":true,"phone":true,"gas":false,"verdict":"HIGH","team":"Alpha"}'
```

## Using the dashboard

1. Sign in as **admin** (see accounts below).
2. Pick a HIGH detection from the list or the map.
3. If its location says *approximate*, click **Set position on map** and click the real spot.
4. In **Send a team**, review the ranking and click **Send**. The route appears on the map with a live ETA.
5. When the team arrives, the detection is marked reached and the team's next queued job begins.

Team accounts see only the detections they reported or were assigned.

## Accounts (demo)

| Role  | Username | Password | Name           | Team    |
|-------|----------|----------|----------------|---------|
| Admin | admin    | admin123 | Command Center | HQ      |
| Team  | team1    | team123  | Ananya Singla  | Alpha   |
| Team  | team2    | team123  | A Lisa         | Bravo   |
| Team  | team3    | team123  | Rahul Mehta    | Charlie |

> These are hard-coded for demos. Before any real deployment, replace them and move the JWT secret in `server.js` into an environment variable.

## Why locations are approximate

The ESP8266 has **no GPS**. A detection that arrives without coordinates is placed near the site origin (Delhi coordinates by default) with a small random offset and marked `approximate`. Command corrects it on the map and it becomes `admin`. Later you can add a GPS module (source becomes `gps`) or send a phone location. **Route accuracy depends on the detection's location**, so set the real position before sending a team.

## Pod data format

One JSON line per cycle:
```json
{"temp_c":34.1,"rssi":-58,"heat":true,"phone":true,"object":false,"gas":false,"verdict":"HIGH"}
```
Accepted fields: `temp_c` / `object_temp_c`, `rssi` / `rssi_dbm`, `heat` / `heat_seen`, `phone` / `signal_seen`, `object`, `gas` / `flame_sensor`, `verdict` (`HIGH`, `LOW`, `VETO`, `NONE`), and optional `lat`, `lng`, `team`. See `firmware/README.md` for the pin map.

## API

All routes except login and ingest need `Authorization: Bearer <token>`.

| Method | Route | Access | Purpose |
|--------|-------|--------|---------|
| POST | `/api/login` | public | Sign in, returns token |
| POST | `/api/ingest` | public | Pod posts a detection |
| GET | `/api/detections` | user | List detections (filtered by role) |
| GET | `/api/detections/:id/options` | admin | Teams ranked by arrival time |
| PATCH | `/api/detections/:id/assign` | admin | Send a team: `{ "team": "Alpha" \| "auto" \| null, "notes": "" }` |
| PATCH | `/api/detections/:id/location` | admin | Set position: `{ "lat": 0, "lng": 0 }` |
| POST | `/api/detections/clear` | admin | Clear the log |
| GET / POST | `/api/messages` | user | Team chat |
| GET | `/api/teams`, `/api/site`, `/api/status` | user | Teams, site origin, pod status |
| PUT | `/api/site` | admin | Move the site origin |

Live events over Socket.IO: `detection`, `detection:updated`, `teams:positions`, `status`, `message`, `site:updated`, `detections:cleared`.

## Configuration

| Setting | Where | Default |
|---------|-------|---------|
| Backend port | `PORT` in `backend/server.js` | 4000 |
| Simulated team speed | `SIM_SPEED_MPS` env var | 25 m/s |
| API address | `API` in `frontend/src/lib/format.js` | http://localhost:4000 |
| Site origin | `siteOrigin` in `backend/server.js` | Delhi |

```bash
SIM_SPEED_MPS=5 npm start   # slower, easier to watch
```

## Troubleshooting

- **`Failed to resolve import "@fontsource..."`**: run `npm install` in `frontend` (and restart `npm run dev`).
- **Map shows "API KEY REQUIRED" or blank tiles**: use the OpenStreetMap tile URL in `MapView.jsx` (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`).
- **"Can't reach the server"** on login: the backend isn't running on port 4000.
- **Routes are straight lines**: OSRM is unreachable. Check your internet connection.
- **Serial bridge cannot open the port**: close the Arduino Serial Monitor and check the COM port.

## Limitations

Data is kept in memory and resets when the backend restarts. Team movement is simulated; positions do not come from real GPS devices yet.