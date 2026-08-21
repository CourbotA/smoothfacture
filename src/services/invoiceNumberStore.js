// invoiceNumberStore.js

const STORAGE_KEY = 'smoothfacture.lastInvoiceNumber';
const DEFAULT_LAST_INVOICE_NUMBER = 0;

let memoryLastInvoiceNumber = DEFAULT_LAST_INVOICE_NUMBER;

export function getLastInvoiceNumber() {
  return readLastInvoiceNumber();
}

export function peekNextInvoiceNumber() {
  return readLastInvoiceNumber() + 1;
}

export function reserveInvoiceNumbers(count = 1) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (!safeCount) {
    return [];
  }

  const last = readLastInvoiceNumber();
  const numbers = Array.from({ length: safeCount }, (_, index) => last + index + 1);
  writeLastInvoiceNumber(last + safeCount);
  return numbers;
}

export function setLastInvoiceNumber(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return readLastInvoiceNumber();
  }

  writeLastInvoiceNumber(parsed);
  return parsed;
}

function readLastInvoiceNumber() {
  const fromStorage = readFromStorage();
  if (Number.isInteger(fromStorage) && fromStorage >= 0) {
    memoryLastInvoiceNumber = fromStorage;
    return fromStorage;
  }

  return memoryLastInvoiceNumber;
}

function writeLastInvoiceNumber(value) {
  memoryLastInvoiceNumber = value;
  writeToStorage(value);
}

function readFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) {
      return null;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeToStorage(value) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore storage write failures (private mode/quota restrictions).
  }
}
