import { describe, expect, it } from 'vitest';
import { logDir } from './log-dir';

describe('logDir', () => {
  it('uses ~/Library/Logs on macOS', () => {
    expect(logDir('darwin', {}, '/Users/me')).toBe('/Users/me/Library/Logs/github-orca');
  });

  it('uses LOCALAPPDATA on Windows', () => {
    expect(logDir('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me')).toBe(
      'C:\\Users\\me\\AppData\\Local\\github-orca\\logs',
    );
  });

  it('falls back to <home>\\AppData\\Local on Windows', () => {
    expect(logDir('win32', {}, 'C:\\Users\\me')).toBe('C:\\Users\\me\\AppData\\Local\\github-orca\\logs');
  });

  it('uses XDG_STATE_HOME on Linux when absolute', () => {
    expect(logDir('linux', { XDG_STATE_HOME: '/home/me/.state' }, '/home/me')).toBe('/home/me/.state/github-orca');
  });

  it('falls back to ~/.local/state on Linux (unset or relative XDG_STATE_HOME)', () => {
    expect(logDir('linux', {}, '/home/me')).toBe('/home/me/.local/state/github-orca');
    expect(logDir('linux', { XDG_STATE_HOME: 'state' }, '/home/me')).toBe('/home/me/.local/state/github-orca');
  });
});
