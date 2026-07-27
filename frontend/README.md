# CreatorForge frontend

Vite + React + TypeScript SPA. For the full project overview, environment variables, and how to
run this alongside the backend, see the [root README](../README.md).

## Available scripts

Run from this directory (`frontend/`):

### `npm start`

Runs the Vite dev server at `http://localhost:3000`.

### `npm run build`

Builds the app for production into `build/`.

### `npm run preview`

Serves the production build locally, for a final check before deploying.

## Environment

Requires `frontend/.env` with:

```
VITE_BACKEND_URL=http://localhost:8000
```

Set this to wherever the FastAPI backend (`../backend/`) is running.
