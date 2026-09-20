import { describe, expect, it } from 'vitest';
import { resolveRequestPath } from './resolve.js';

describe('resolveRequestPath', () => {
  it('serves the allowlisted root files', () => {
    expect(resolveRequestPath('/config.json')).toBe('config.json');
    expect(resolveRequestPath('/manifest.json')).toBe('manifest.json');
    expect(resolveRequestPath('/sw.js')).toBe('sw.js');
    expect(resolveRequestPath('/pdf.worker.min.js')).toBe('pdf.worker.min.js');
  });

  it('serves the allowlisted directories', () => {
    expect(resolveRequestPath('/assets/index-abc123.js')).toBe('assets/index-abc123.js');
    expect(resolveRequestPath('/public/locales/en/translation.json')).toBe(
      'public/locales/en/translation.json'
    );
  });

  it('serves the vendored element-call bundle', () => {
    // CallEmbed points an iframe here; if this falls through to index.html,
    // calls break with no obvious error.
    expect(resolveRequestPath('/public/element-call/index.html')).toBe(
      'public/element-call/index.html'
    );
  });

  it('falls back to index.html for app routes', () => {
    expect(resolveRequestPath('/')).toBe('index.html');
    expect(resolveRequestPath('/home')).toBe('index.html');
    expect(resolveRequestPath('/room/!abc:loaf.moe')).toBe('index.html');
  });

  it('refuses to escape dist via traversal', () => {
    expect(resolveRequestPath('/assets/../../../etc/passwd')).toBe('index.html');
    expect(resolveRequestPath('/public/../../etc/passwd')).toBe('index.html');
    expect(resolveRequestPath('/../package.json')).toBe('index.html');
  });

  it('refuses to escape dist via percent-encoded traversal', () => {
    expect(resolveRequestPath('/public/%2e%2e/%2e%2e/etc/passwd')).toBe('index.html');
    expect(resolveRequestPath('/assets/..%2f..%2fetc/passwd')).toBe('index.html');
  });

  it('rejects backslashes, which Windows would treat as separators', () => {
    expect(resolveRequestPath('/assets/..\\..\\package.json')).toBe('index.html');
  });

  it('survives malformed input', () => {
    expect(resolveRequestPath('/assets/%ZZ')).toBe('index.html');
    expect(resolveRequestPath('/assets/\0foo')).toBe('index.html');
  });
});
