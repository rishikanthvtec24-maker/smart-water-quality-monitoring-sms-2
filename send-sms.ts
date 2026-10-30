// Vercel serverless function. Twilio credentials must be set in Vercel's
// Environment Variables; never expose them through VITE_* variables.
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const sensorRules: Record<string, { name: string; unit: string; min: number; max: number }> = {
    ph: { name: 'pH Level', unit: 'pH', min: 6.5, max: 8.5 },
    turbidity: { name: 'Turbidity', unit: 'NTU', min: 0, max: 5 },
    tds: { name: 'Total Dissolved Solids (TDS)', unit: 'ppm', min: 50, max: 500 },
    temperature: { name: 'Temperature', unit: '°C', min: 15, max: 25 },
  };

  const { sensorId, value } = req.body ?? {};
  if (typeof sensorId !== 'string' || !sensorRules[sensorId] ||
      typeof value !== 'number' || !Number.isFinite(value)) {
    return res.status(400).json({ ok: false, error: 'A valid sensorId and numeric value are required.' });
  }

  const rule = sensorRules[sensorId];
  if (value >= rule.min && value <= rule.max) {
    return res.status(400).json({ ok: false, error: 'Reading is within the configured safe range; no SMS sent.' });
  }

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, SMS_TO_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !SMS_TO_NUMBER) {
    return res.status(503).json({
      ok: false,
      error: 'SMS is not configured. Add the four Twilio environment variables in Vercel, then redeploy.',
    });
  }

  const message = [
    'SMART WATER QUALITY ALERT',
    `Sensor: ${rule.name}`,
    `Detected value: ${value} ${rule.unit}`,
    `Configured safe range: ${rule.min}–${rule.max} ${rule.unit}`,
    'Reading is outside the configured range. Please inspect the water source. This alert does not confirm contamination.',
  ].join('\\n');

  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const form = new URLSearchParams({
      To: SMS_TO_NUMBER,
      From: TWILIO_FROM_NUMBER,
      Body: message,
    });
    const providerResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );
    const result = await providerResponse.json() as { sid?: string; status?: string; code?: number; message?: string };
    if (!providerResponse.ok) {
      console.error('SMS provider rejected request:', result.code, result.message);
      return res.status(502).json({
        ok: false,
        error: 'SMS provider rejected the request. Check account permissions, sender number, and destination.',
      });
    }
    return res.status(200).json({ ok: true, status: result.status ?? 'accepted', messageId: result.sid });
  } catch (error) {
    console.error('Could not contact SMS provider:', error);
    return res.status(500).json({ ok: false, error: 'Unable to contact the SMS provider.' });
  }
}
