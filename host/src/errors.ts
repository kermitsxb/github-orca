import type { ErrorCode } from '../../shared/types';

export class HostError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HostError';
  }
}
