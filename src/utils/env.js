// True only when the app is running on the developer's machine (localhost).
// Used to keep local-only tools (e.g. the Audio Review cockpit, which depends on
// a local helper server + SMB audio files) out of the deployed Vercel app.
export const isLocalHost =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
