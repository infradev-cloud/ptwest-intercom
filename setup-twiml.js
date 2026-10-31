import fs from 'fs';
import path from 'path';

// Helper to parse .env file manually without external deps
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();

const accountSid = env.TWILIO_ACCOUNT_SID;
const apiKey = env.TWILIO_API_KEY;
const apiSecret = env.TWILIO_API_SECRET;
const authToken = env.TWILIO_AUTH_TOKEN;
const rawPhoneNumber = env.TWILIO_PHONE_NUMBER || '+16304478507';
const phoneNumber = rawPhoneNumber.replace(/[^+\d]/g, '');
const voice = env.VOICE || 'Polly.Aditi';
const voiceLanguage = env.VOICE_LANGUAGE || 'hi-IN';
const greeting = env.GREETING_MESSAGE || 'Assalam-o-alaikum! Thank you for calling the Hussain family. You may now enter.';
const digits = env.DTMF_DIGITS || 'wwww#';

// Determine credentials
let authUsername = '';
let authPassword = '';

if (apiKey && apiSecret && !apiSecret.includes('your_twilio_api_secret')) {
  authUsername = apiKey;
  authPassword = apiSecret;
} else if (accountSid && authToken && !authToken.includes('your_twilio_auth_token')) {
  authUsername = accountSid;
  authPassword = authToken;
}

if (!authPassword) {
  console.error('❌ Error: Missing credentials in .env!');
  console.error('Please provide either:');
  console.error('  1. TWILIO_API_SECRET for API Key ' + apiKey);
  console.error('  OR');
  console.error('  2. TWILIO_AUTH_TOKEN for Account SID ' + accountSid);
  process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${authUsername}:${authPassword}`).toString('base64');

async function run() {
  try {
    console.log(`1. Creating / updating Twilio Studio Flow with voice: ${voice}...`);
    
    const flowDefinition = {
      description: 'PTWest Intercom Auto-Buzz Flow',
      states: [
        {
          name: 'Trigger',
          type: 'trigger',
          transitions: [
            {
              event: 'incomingCall',
              next: 'say_greeting'
            },
            {
              event: 'incomingMessage'
            },
            {
              event: 'incomingRequest'
            }
          ],
          properties: {
            offset: { x: 0, y: 0 }
          }
        },
        {
          name: 'say_greeting',
          type: 'say-play',
          transitions: [
            {
              event: 'audioComplete',
              next: 'send_buzz_digits'
            }
          ],
          properties: {
            say: greeting,
            voice: voice,
            language: voiceLanguage,
            loop: 1,
            offset: { x: 0, y: 150 }
          }
        },
        {
          name: 'send_buzz_digits',
          type: 'say-play',
          transitions: [
            {
              event: 'audioComplete'
            }
          ],
          properties: {
            digits: digits,
            loop: 1,
            offset: { x: 0, y: 300 }
          }
        }
      ],
      initial_state: 'Trigger',
      flags: {
        allow_concurrent_calls: true
      }
    };

    // Check if flow already exists or create a new one
    const listFlowsRes = await fetch('https://studio.twilio.com/v2/Flows', {
      headers: { 'Authorization': authHeader }
    });
    const listFlowsData = await listFlowsRes.json();
    
    let flowSid = null;
    if (listFlowsData.flows) {
      const existing = listFlowsData.flows.find(f => f.friendly_name === 'PTWest Intercom Auto-Buzz');
      if (existing) {
        flowSid = existing.sid;
        console.log(`Found existing Studio Flow: ${flowSid}, updating...`);
      }
    }

    const flowParams = new URLSearchParams();
    flowParams.append('FriendlyName', 'PTWest Intercom Auto-Buzz');
    flowParams.append('Status', 'published');
    flowParams.append('Definition', JSON.stringify(flowDefinition));

    let flowRes;
    if (flowSid) {
      flowRes = await fetch(`https://studio.twilio.com/v2/Flows/${flowSid}`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: flowParams.toString(),
      });
    } else {
      flowRes = await fetch('https://studio.twilio.com/v2/Flows', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: flowParams.toString(),
      });
    }

    const flowData = await flowRes.json();
    if (!flowRes.ok) {
      throw new Error(`Failed to save Studio Flow: ${flowRes.status} ${JSON.stringify(flowData)}`);
    }

    flowSid = flowData.sid;
    const webhookUrl = flowData.webhook_url;
    console.log(`✅ Twilio Studio Flow published! Flow SID: ${flowSid}`);
    console.log(`   Flow Webhook URL: ${webhookUrl}`);

    console.log(`2. Finding phone number SID for ${phoneNumber}...`);
    const pnRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`,
      {
        headers: {
          'Authorization': authHeader,
        },
      }
    );

    const pnData = await pnRes.json();
    if (!pnRes.ok) {
      throw new Error(`Failed to fetch phone numbers: ${pnRes.status} ${JSON.stringify(pnData)}`);
    }

    const incomingNumbers = pnData.incoming_phone_numbers || [];
    if (incomingNumbers.length === 0) {
      throw new Error(`Phone number ${phoneNumber} not found in Twilio Account ${accountSid}`);
    }

    const phoneSid = incomingNumbers[0].sid;
    console.log(`✅ Found Phone Number SID: ${phoneSid}`);

    console.log(`3. Updating voice webhook on ${phoneNumber} to point to Studio Flow...`);
    const updateParams = new URLSearchParams();
    updateParams.append('VoiceUrl', webhookUrl);
    updateParams.append('VoiceMethod', 'POST');

    const updateRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneSid}.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: updateParams.toString(),
      }
    );

    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      throw new Error(`Failed to update phone number: ${updateRes.status} ${JSON.stringify(updateData)}`);
    }

    console.log('\n🎉 Setup Complete!');
    console.log(`📞 Phone number ${phoneNumber} is now live with:`);
    console.log(`   - Voice: ${voice} (${voiceLanguage})`);
    console.log(`   - Message: "${greeting}"`);
    console.log(`   - Digits: "${digits}"`);
  } catch (err) {
    console.error('❌ Error executing setup:', err.message);
    process.exit(1);
  }
}

run();
