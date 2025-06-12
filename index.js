const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

// Get Slack Signing Secret from environment variables
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const app = express();

function isValidSlackRequest(req) {
	const signature = req.headers["x-slack-signature"];
	const requestTimestamp = req.headers["x-slack-request-timestamp"];
	const body = req.rawBody;

	if (!signature || !requestTimestamp || !body) return false;

	if (Math.abs(Date.now() / 1000 - requestTimestamp) > 60 * 5) {
		console.log("Request timestamp is too old");
		return false;
	}

	const sigBaseString = `v0:${requestTimestamp}:${body}`;
	const hmac = crypto.createHmac("sha256", slackSigningSecret);
	const computedSignature = `v0=${hmac.update(sigBaseString).digest("hex")}`;

	const valid = crypto.timingSafeEqual(
		Buffer.from(signature, 'utf8'),
		Buffer.from(computedSignature, 'utf8')
	);

	if (!valid) {
		console.log("Invalid Slack request");
		console.log("Expected:", computedSignature);
		console.log("Received:", signature);
	}
	return valid;
}

// Capture raw body as a string
app.use(bodyParser.raw({
	type: '*/*', // Capture all content types (important for Slack)
	verify: (req, res, buf) => {
		req.rawBody = buf.toString('utf8');
	}
}));

app.post("/slack/events", (req, res) => {
	// Handle URL verification
	if (req.body.type === "url_verification") {
		// Echo back the challenge to Slack
		return res.json({ challenge: req.body.challenge });
	}
});

app.post("/slack/command", async (req, res) => {
	// Validate the Slack request
	if (!isValidSlackRequest(req)) {
		console.log("Invalid Slack request");
		return res.status(400).send("Invalid request");
	}

	const parsedBody = qs.parse(req.rawBody);
	const { text, user_name, response_url } = parsedBody;
	
	if (!text) {
		return res.send("Please provide text to rephrase, like `/rephrase I no understand`");
	}

	try {
		// Call OpenAI to rephrase
		const response = await axios.post("https://api.openai.com/v1/chat/completions", {
			model: "gpt-3.5-turbo",
			messages: [
				{
					role: "system",
					content: "You are a helpful assistant. Translate non-English input into fluent English. If input is already English, rewrite it to be grammatically correct and natural."
				},
				{
					role: "user",
					content: text
				}
			]
		}, {
			headers: {
				"Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
				"Content-Type": "application/json"
			}
		});

		const rephrased = response.data.choices[0].message.content.trim();

		// Respond to Slack
		await axios.post(response_url, {
			response_type: "ephemeral",
			text: `💡 *Rephrased:*\n\`\`\`\n${rephrased}\n\`\`\``
		});

		res.status(200).end(); // Ack the slash command quickly
	} catch (error) {
		console.error("OpenAI error:", error);
		res.send("Something went wrong while rephrasing.");
	}
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Slack rephraser listening on port ${PORT}`));