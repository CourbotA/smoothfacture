import AsyncStorage from '@react-native-async-storage/async-storage';
import { cloneDefaultCompanyProfile } from '../../../src/config/defaultCompany.js';

const STORAGE_KEY = 'smoothfacture.companyProfile.v1';

export async function loadCompanyProfile() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultCompanyProfile();
    return mergeCompanyProfile(cloneDefaultCompanyProfile(), JSON.parse(raw));
  } catch {
    return cloneDefaultCompanyProfile();
  }
}

export async function saveCompanyProfile(profile) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

function mergeCompanyProfile(base, stored) {
  return {
    ...base,
    ...stored,
    address: { ...base.address, ...(stored?.address || {}) },
    contact: { ...base.contact, ...(stored?.contact || {}) },
    tax: { ...base.tax, ...(stored?.tax || {}) },
    payment: { ...base.payment, ...(stored?.payment || {}) }
  };
}
