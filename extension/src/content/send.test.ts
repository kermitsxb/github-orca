import { describe, expect, it, vi } from 'vitest';
import { mapNativeError } from '../native-errors';
import { createCloneSender, createSender } from './send';

const pr = { owner: 'a', repo: 'b', prNumber: 3 };

describe('createSender', () => {
  it('sends a run-action message through the live runtime', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const send = createSender(() => ({ id: 'ext', sendMessage }), pr);
    await expect(send('review', undefined)).resolves.toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'run-action', action: 'review', owner: 'a', repo: 'b', prNumber: 3, customPrompt: undefined });
  });

  it('rejects with "context invalidated" once the extension was reloaded (runtime gone)', async () => {
    const send = createSender(() => undefined, pr);
    const err = await send('review', undefined).catch((e: Error) => e);
    expect(mapNativeError((err as Error).message).ok).toBe(false);
    expect(mapNativeError((err as Error).message)).toMatchObject({ message: 'Extension rechargée : recharge la page' });
  });

  it('treats a runtime without id as invalidated too', async () => {
    const sendMessage = vi.fn();
    const send = createSender(() => ({ id: undefined, sendMessage }), pr);
    await expect(send('review', undefined)).rejects.toThrow(/context invalidated/i);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('mapNativeError', () => {
  it('maps the orphaned-script TypeError to the reload hint', () => {
    expect(mapNativeError("Cannot read properties of undefined (reading 'sendMessage')")).toMatchObject({
      message: 'Extension rechargée : recharge la page',
    });
  });
});

describe('createCloneSender', () => {
  it('sends a clone-repo message through the live runtime', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const send = createCloneSender(() => ({ id: 'ext', sendMessage }), { owner: 'a', repo: 'b' });
    await expect(send()).resolves.toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'clone-repo', owner: 'a', repo: 'b' });
  });

  it('rejects once the extension was reloaded', async () => {
    await expect(createCloneSender(() => undefined, { owner: 'a', repo: 'b' })()).rejects.toThrow(/context invalidated/i);
  });
});
