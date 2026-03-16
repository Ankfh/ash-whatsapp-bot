const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// The URL to OpenClaw (can be overridden by environment variable in docker-compose)
const OPENCLAW_URL =
  process.env.OPENCLAW_URL || "http://localhost:3000/api/chat";

// WAHA API key and URL
const WAHA_API_KEY = process.env.WAHA_API_KEY || "123";
const WAHA_URL = process.env.WAHA_URL || "http://waha:3000";
const wahaHeaders = { "X-Api-Key": WAHA_API_KEY };

// WAHA will send POST requests here whenever an event happens (like a new message)
app.post("/waha-webhook", async (req, res) => {
  // Acknowledge receipt immediately so WAHA doesn't timeout
  res.sendStatus(200);

  const event = req.body;

  // We only care about new messages
  if (event.event !== "message") return;

  const payload = event.payload;

  // Ignore messages from ourselves or broadcasts
  if (payload.fromMe || payload.from === "status@broadcast") return;

  const text = payload.body;
  const from = payload.from; // This is the sender's WhatsApp ID (e.g., 1234567890@c.us)
  const session = event.session; // The WAHA session name (usually 'default')

  if (!text) return;

  console.log(`[WAHA] Message from ${from}: ${text}`);

  try {
    console.log(`[OpenClaw] Forwarding to ${OPENCLAW_URL}...`);

    // 1. Send the message text to OpenClaw (OpenAI compatible format)
    const response = await axios.post(
      OPENCLAW_URL,
      {
        model: "openclaw", // OpenClaw typically ignores this but it's required by the spec
        messages: [{ role: "user", content: text }],
      },
      { timeout: 45000 },
    );

    // 2. Extract the OpenClaw reply from the completions response
    const replyText =
      response.data?.choices?.[0]?.message?.content ||
      "Agent replied but format is unknown.";
    console.log(`[OpenClaw] Reply received: ${replyText}`);

    // 3. Send the reply back to the user via WAHA's REST API
    // Assuming WAHA is accessible at http://waha:3000 (its container name)
    await axios.post(`${WAHA_URL}/api/sendText`, {
      session: session,
      chatId: from,
      text: replyText,
    }, { headers: wahaHeaders });

    console.log(`[WAHA] Successfully replied to ${from}`);
  } catch (error) {
    console.error(`[Error] Failed to process message:`, error.message);

    // MOCK RESPONSE FOR LOCAL TESTING
    console.log(
      "Since OpenClaw isn't running, sending a mock response for testing...",
    );
    try {
      await axios.post(`${WAHA_URL}/api/sendText`, {
        session: session,
        chatId: from,
        text: `🤖 (Test Mode) Server is alive! I received your message: "${text}". OpenClaw is currently offline.`,
      }, { headers: wahaHeaders });
    } catch (e) {
      console.error("Failed to send mock response to WAHA:", e.message);
    }
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`WAHA Webhook bridge listening on port ${PORT}`);
  console.log(`Forwarding messages to: ${OPENCLAW_URL}`);
});
