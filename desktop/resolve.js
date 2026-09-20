const path = require('node:path');

// Ported from docker-nginx.conf. That file is the production behaviour, so it
// is the specification here: anything it serves as a file, we serve as a file,
// and everything else falls through to index.html for the SPA router.
const FILES = new Set(['/config.json', '/manifest.json', '/sw.js', '/pdf.worker.min.js']);
const DIRECTORIES = ['/public/', '/assets/'];

const FALLBACK = 'index.html';

/**
 * Map a request pathname onto a path relative to dist/.
 *
 * The allowlist doubles as the traversal guard: a normalised path that climbs
 * out of an allowlisted directory no longer matches the allowlist, so it falls
 * through to the SPA fallback instead of reaching the filesystem.
 */
function resolveRequestPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Malformed percent-encoding. Not worth an error page; it is not a file.
    return FALLBACK;
  }

  // NUL truncates paths in some syscalls, and a backslash is a separator on
  // Windows but not to path.posix, so neither may reach path.join.
  if (decoded.includes('\0') || decoded.includes('\\')) return FALLBACK;

  const normalized = path.posix.normalize(decoded);

  if (FILES.has(normalized)) return normalized.slice(1);
  if (DIRECTORIES.some((dir) => normalized.startsWith(dir))) return normalized.slice(1);

  return FALLBACK;
}

module.exports = { resolveRequestPath };
