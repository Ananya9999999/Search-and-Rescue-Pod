# RSSI Rescue Pod — Command Dashboard

## What's new in this version

- **Redesigned frontend**: light operations theme, floating panels over a full-bleed map, split into components under `frontend/src/components`. Works on phones.
- **Optimised team routing** (see below)
- Fonts and map styles are bundled locally, so the UI doesn't depend on Google Fonts or unpkg being reachable in the field. Map *tiles* still need internet.

## How routing works

When command sends a team to a HIGH detection:

1. The backend asks OSRM for up to 3 road routes and keeps the **one with the lowest travel time** (shorter distance breaks ties).
2. In the dispatch panel, **every team is ranked by arrival time**, including the time a busy team needs to finish its current jobs first. The fastest is pre-selected and tagged *Fastest*.
3. If one team is given several detections, they're **queued in order**, and each route starts where the previous job ends. Moving a detection on the map re-plans the whole chain.
4. Teams move **along the planned road path** at a constant speed, and only the part of the route still ahead is drawn. The ETA counts down as they go.
5. If OSRM can't be reached, it falls back to a straight-line estimate and the UI says so.

Set `SIM_SPEED_MPS` to change how fast simulated teams move (default 25 m/s):

```bash
SIM_SPEED_MPS=5 npm start
```

New endpoint: `GET /api/detections/:id/options` (admin) returns the ranked teams with ETA and distance.
`PATCH /api/detections/:id/assign` also accepts `{ "team": "auto" }` to pick the fastest.

## Why location looked wrong

The ESP8266 has **no GPS**.  
When a detection arrives without coordinates, the backend places it near a default site origin (Delhi coordinates) with a small random offset and marks it as `approximate`.

**Admin workflow:**
1. Select a HIGH detection
2. Click **Pick on map**
3. Click the real place on the map
4. Location source becomes `admin`

Later you can add a GPS module or send the rescuer's phone location.

## Run

### Terminal 1 — Backend
```bash
cd backend
npm install
npm start
```

### Terminal 2 — Frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

### Terminal 3 — Hardware (USB)
```bash
cd backend
node serial-bridge.js COM3
```
(Close Arduino Serial Monitor first. Use your real COM port.)

## Logins

| Role  | Username | Password  |
|-------|----------|-----------|
| Admin | admin    | admin123  |
| Team  | team1    | team123   |
| Team  | team2    | team123   |
| Team  | team3    | team123   |

- **Admin**: see all detections, assign teams, set locations, clear log
- **Team**: see detections reported by them or assigned to them
