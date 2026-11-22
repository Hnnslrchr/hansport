// Build-Variante: Claude-Artifact (Strava/athletedata über Claude) oder eigenständige Web-App (Garmin/Withings direkt).
// __WEB__ setzt der Web-Build (build-web.mjs); im Artifact-Build bleibt es undefiniert.
export const WEB = typeof __WEB__ !== 'undefined' && __WEB__ === true;
export const ACT_SRC = WEB ? 'Garmin' : 'Strava';
export const HEALTH_SRC = WEB ? 'Garmin und Withings' : 'Garmin und Withings über athletedata';
