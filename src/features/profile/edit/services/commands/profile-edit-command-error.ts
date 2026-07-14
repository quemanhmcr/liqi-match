import type { ProfileEditMediaSlot } from '../../model/profile-edit-model';

export class ProfileEditCommandError extends Error {
  readonly associatedMediaSlots: readonly ProfileEditMediaSlot[];
  readonly code?: string;
  readonly partiallySaved: boolean;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: ErrorOptions & {
      associatedMediaSlots?: readonly ProfileEditMediaSlot[];
      code?: string;
      partiallySaved?: boolean;
      retryable?: boolean;
    } = {},
  ) {
    super(message, options);
    this.name = 'ProfileEditCommandError';
    this.associatedMediaSlots = options.associatedMediaSlots ?? [];
    this.code = options.code;
    this.partiallySaved = options.partiallySaved ?? false;
    this.retryable = options.retryable ?? true;
  }
}
