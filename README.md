# RSSI Rescue Pod — Full Stack Dashboard

Live search-and-rescue dashboard that receives real-time verdicts from the ESP8266 pod.

## Features

- **Live hardware feed** via WebSocket (ESP8266 pushes JSON)
- **Team** and **Admin** login profiles
- Ranked detection list (HIGH / LOW / VETO)
- Leaflet site map
- Session log with export
- Simulation mode (works without hardware)

## Quick Start

### 1. Backend
```bash
cd backend
npm install
npm start
```
Server runs on http://localhost:4000

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

### Default Logins
| Role  | Username | Password |
|-------|----------|----------|
| Admin | admin    | admin123 |
| Team  | team1    | team123  |
| Team  | team2    | team123  |

## Hardware Connection

The ESP8266 firmware already prints one JSON line per cycle on Serial, for example:

```json
{"temp_c":34.2,"rssi":-62,"heat":true,"phone":true,"object":false,"gas":false,"verdict":"HIGH"}
```

### Option A — Serial Bridge (recommended for demo)
```bash
cd backend
node serial-bridge.js
```
This reads the NodeMCU Serial port and forwards every JSON line to the backend over WebSocket.

### Option B — Wi-Fi push from ESP (advanced)
Point the ESP8266 at the backend HTTP endpoint:
`POST http://<laptop-ip>:4000/api/ingest`

## Project Structure
```
sar_final/
├── backend/          # Express + Socket.io + auth
├── frontend/         # React + Leaflet dashboard
├── firmware/         # Notes + serial bridge helper
└── README.md
```

## Roles

- **Team**: view live map, detections, logs of their own session
- **Admin**: view all teams, manage sessions, export full logs
