export const PUBLIC_DATA_CACHE_TAG = "public-database-data";

// Mutations invalidate the tag immediately. This TTL is a safety net for
// changes made outside the application, for example through the Neon console.
export const PUBLIC_DATA_CACHE_TTL_SECONDS = 24 * 60 * 60;
