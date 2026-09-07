import { useEffect } from 'react';
import { requireOptionalNativeModule } from 'expo-modules-core';

const nativeSpeechRecognition = requireOptionalNativeModule('ExpoSpeechRecognition');

const unavailablePermissions = {
  status: 'undetermined',
  granted: false,
  canAskAgain: false,
  expires: 'never',
  unavailable: true
};

export const ExpoSpeechRecognitionModule = nativeSpeechRecognition || {
  requestPermissionsAsync: async () => unavailablePermissions,
  getPermissionsAsync: async () => unavailablePermissions,
  start: () => {},
  stop: () => {},
  abort: () => {},
  addListener: () => ({ remove: () => {} })
};

export function useSpeechRecognitionEvent(eventName, listener) {
  useEffect(() => {
    if (!nativeSpeechRecognition?.addListener || typeof listener !== 'function') return undefined;
    const subscription = nativeSpeechRecognition.addListener(eventName, listener);
    return () => subscription?.remove?.();
  }, [eventName, listener]);
}

export function isSpeechRecognitionAvailable() {
  return Boolean(nativeSpeechRecognition);
}
