import type { ReactElement } from 'react';

export interface ContactModalProps {
  /** Whether the modal is open. */
  open?: boolean;
  /** Called when the modal is dismissed (backdrop, close button, cancel, or after submit). */
  onClose?: () => void;
}

/** Centered enquiry modal — name/email/service/message form with a success state. */
export function ContactModal(props: ContactModalProps): ReactElement | null;
