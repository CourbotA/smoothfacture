// Compatibility facade for older callers. New UI code should consume the
// interpretation envelope so it can distinguish facts from review metadata.
import { interpretInvoiceInput } from './invoiceInterpreter.js';

export { interpretInvoiceInput } from './invoiceInterpreter.js';

export function parseEmail(emailText) {
  return parseEmails(emailText)[0] || null;
}

export function parseEmails(emailText) {
  return interpretInvoiceInput(emailText).map(result => ({
    ...result.invoice,
    interpretation: result.interpretation
  }));
}
