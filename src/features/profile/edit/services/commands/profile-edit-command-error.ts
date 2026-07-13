import type { ProfileEditMediaSlot } from '../../model/profile-edit-model';

export class ProfileEditCommandError extends Error {
  readonly associatedMediaSlots: readonly ProfileEditMediaSlot[];
  readonly partiallySaved: boolean;

  constructor(
    message: string,
    options?: {
      associatedMediaSlots?: readonly ProfileEditMediaSlot[];
      cause?: unknown;
      partiallySaved?: boolean;
    },
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'ProfileEditCommandError';
    this.associatedMediaSlots = options?.associatedMediaSlots ?? [];
    this.partiallySaved = options?.partiallySaved ?? false;
  }
}
