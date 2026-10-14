import { randomId } from "../domain/crypto.js";
const DEVICE_KEY = "substrata-jobs-device-id";

export function getDeviceIdentity() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getDailyProbeIdentity() {
  const day = new Date().toISOString().slice(0, 10);
  const key = `substrata-jobs-probe-${day}`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = randomId();
    localStorage.setItem(key, id);
  }
  return id;
}
