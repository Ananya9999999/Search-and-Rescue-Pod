# Firmware & Hardware Bridge

## Current ESP8266 firmware

Your working firmware already prints one JSON line per cycle on Serial, for example:

```json
{"temp_c":34.1,"rssi":-58,"heat":true,"phone":true,"object":false,"gas":false,"verdict":"HIGH"}
```

The dashboard understands these fields:
- `temp_c` / `object_temp_c`
- `rssi` / `rssi_dbm`
- `heat` / `heat_seen`
- `phone` / `signal_seen`
- `object`
- `gas` / `flame_sensor`
- `verdict` (HIGH | LOW | VETO | NONE)

## Connecting the pod to the dashboard

### Method 1 — Serial Bridge (easiest for demo)

1. Close Arduino Serial Monitor.
2. Start the backend: `cd backend && npm start`
3. In another terminal:
   ```bash
   cd backend
   node serial-bridge.js COM3
   ```
   (Replace COM3 with your actual port.)

4. Open the frontend. Live detections will appear.

### Method 2 — Manual test (no hardware)

```bash
curl -X POST http://localhost:4000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"temp_c":35.2,"rssi":-61,"heat":true,"phone":true,"gas":false,"verdict":"HIGH","team":"Alpha"}'
```

### Method 3 — ESP8266 Wi-Fi push (optional later)

You can extend the firmware to POST the same JSON to:
`http://<your-laptop-ip>:4000/api/ingest`
using the ESP8266HTTPClient library.

## Pin map currently used

| Component          | Pin  |
|--------------------|------|
| MLX90614 SDA/SCL   | D2 / D1 |
| IR Object Sensor   | D6   |
| MQ2                | D7   |
| Green LED          | D5   |
| Yellow LED         | D0   |
| Red LED + Buzzer   | D8   |
