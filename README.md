# RSSI Rescue Pod — Command Dashboard

## What's new

- **Admin can assign response teams** to any HIGH detection
- **Admin can correct location** by clicking on the map
- Clear explanation of location source (`approximate` vs `gps` vs `admin`)
- Much improved UI: stats bar, filters, detail panel, assignment workflow
- Live WebSocket updates from the ESP8266 via USB serial bridge

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
