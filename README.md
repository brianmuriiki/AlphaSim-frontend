# AlphaSim frontend

React + TypeScript frontend for the AlphaSim research IDE. The workspace follows the supplied three-pane design: alpha library, Fast Expression editor/results, and Forge AI. Other routes provide library management, datafield/operator browsing, experiments, account settings, and BRAIN connection management.

## Run locally

Start the backend stack from `backend/` first (`docker compose up --build`), then run:

```sh
cd frontend
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173` and proxies `/api` and `/socket.io` to the backend on port 4000. To build static assets, run `npm run build`; use `npm run preview` to serve that build locally.

The access token stays in memory. The backend refresh cookie is httpOnly and sent through the same-origin Vite proxy. The local BRAIN mock supplies fixture results; those are labelled as mock in the chart.

## Included screens

- `/login`, `/register`, and `/connect`
- `/workspace/:alphaId?` with Monaco completion, lint markers, draft autosave, settings, run results, history, version restore, compare, PnL, and Forge AI
- `/library`, `/experiments`, `/datafields`, and `/settings`

Keyboard shortcuts: `⌘/Ctrl+Enter` runs, `⌘/Ctrl+K` searches alphas, `⌘/Ctrl+/` toggles Forge AI, `⌘/Ctrl+B` toggles the library, and `⌘/Ctrl+S` saves a version.

## Checks

```sh
npm test
npm run build
```
