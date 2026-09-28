import { describe, expect, it, vi } from 'vitest';
import type { Deps } from './handler';
import { processMessage } from './main';

vi.mock('./log', () => ({ log: vi.fn() }));

describe('processMessage', () => {
  it('returns invalid_request without touching any CLI', async () => {
    const deps = { gh: { prView: vi.fn() } } as unknown as Deps;
    expect(await processMessage({ action: 'nope' }, deps)).toMatchObject({ ok: false, code: 'invalid_request' });
    expect(deps.gh.prView).not.toHaveBeenCalled();
  });
});
