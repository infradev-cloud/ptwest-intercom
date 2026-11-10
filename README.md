# PTWest Intercom - Twilio Auto-Buzzer

Automated building intercom answering and door buzzer service powered by Twilio TwiML Bins.

## Twilio Phone Number

- **Phone Number:** `+1 (630) 447-8507` (`+16304478507`)

---

## Features

- **Automated Voice Greeting**: Speaks a custom message to the caller via Amazon Polly Neural voices.
- **DTMF Buzzer Tones**: Sends tone sequences (e.g. `wwww9`) to buzz open the door.
- **Zero Server Overhead**: Configures serverless Twilio TwiML Bins and updates incoming phone number webhooks automatically.

---

## Configuration

Copy `.env.example` to `.env` and fill in your Twilio credentials:

```bash
cp .env.example .env
```

| Variable | Description | Default / Example |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID (`AC...`) | Required |
| `TWILIO_API_KEY` | Twilio API Key (`SK...`) | Required |
| `TWILIO_API_SECRET` | Twilio API Secret | Required |
| `TWILIO_PHONE_NUMBER` | Intercom Phone Number | `+16304478507` |
| `VOICE` | Twilio / Polly Voice | `Polly.Joanna-Neural` |
| `VOICE_LANGUAGE` | Language code for voice | `en-US` |
| `GREETING_MESSAGE` | Spoken announcement | `"Thank you for calling Waseem and Fouzia Hussain. You may now enter."` |
| `DTMF_DIGITS` | DTMF sequence to press door buzzer | `wwww9` |

---

## Setup & Deployment

Run the setup script to create or update the TwiML Bin and attach it to the phone number:

```bash
npm install
npm run setup
```
