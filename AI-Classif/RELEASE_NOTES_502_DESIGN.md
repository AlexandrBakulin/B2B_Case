# Release notes — API startup fix and visual refresh

## Root cause of the 502

The API container exited during FastAPI startup because `backend/app/main.py` referenced `logger` in the lifespan hook without defining it. This caused `NameError: name 'logger' is not defined`; Nginx then returned 502 because its upstream API process was not available.

## Fix

Added `logger = logging.getLogger("app.main")` directly after logging configuration and before the lifespan function. Added a regression test verifying that the logger declaration exists before the lifespan hook.

## Visual refresh

Retained the black / white / red palette and Times New Roman. Refined navigation, status badge, hero panel, workspace, input area, method note, classification results, catalog, legal document section and footer. Added responsive breakpoints and reduced-motion handling.

## Verification

- Python compilation: passed.
- Backend unit tests: 13 passed.
- TypeScript/TSX syntax transpilation: 11 files, zero diagnostics.
- Docker/YAML runtime build: not run in this environment. The user's previously provided log confirms the frontend image built successfully; after applying this patch, verify the API container reaches `healthy`.
