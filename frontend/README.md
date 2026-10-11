# RSSI Rescue Pod — Field Console

Live operational dashboard for the **RSSI-Based Rescue and Research Pod**: sweep map, sensor-fusion verdicts, thermal preview, and exportable session log.

## Stack

- TanStack Start + React Router
- TypeScript
- React 19
- Tailwind CSS 4
- Leaflet (site map)
- Recharts / shadcn/ui components

## Development

Requires [Bun](https://bun.sh) (or Node.js 22+).

```sh
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command          | Description              |
|------------------|--------------------------|
| `bun run dev`    | Start dev server         |
| `bun run build`  | Production build         |
| `bun run preview`| Preview production build |
| `bun run lint`   | ESLint                   |
| `bun run format` | Prettier                 |

## Features

- Simulated drone / pod sweep path over a search site
- RSSI + thermal + flame sensor fusion with ranked detections
- Live map with pod position, detections, and rescuer pathing
- Thermal camera preview and session log export (CSV / JSON)
