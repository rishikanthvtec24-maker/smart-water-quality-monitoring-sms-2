import { SensorType } from '../types';

export interface SmsDispatchResult {
  ok: boolean;
  status?: string;
  error?: string;
}

export async function sendWaterQualitySms(sensorId: SensorType, value: number): Promise<SmsDispatchResult> {
  try {
    const response = await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensorId, value }),
    });
    const result = await response.json() as SmsDispatchResult;
    return response.ok ? result : { ok: false, error: result.error || 'SMS request failed.' };
  } catch {
    return { ok: false, error: 'Could not reach the SMS API. Confirm the app is deployed on Vercel.' };
  }
}
