const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post("/slack/actions", async (req, res) => {
	const payload = JSON.parse(req.body.payload);
	if (payload.type === "message_action" && payload.callback_id === "rephrase_message") {
		const originalText = payload.message.text;

		const response = await axios.post("https://api.openai.com/v1/chat/completions", {
			model: "gpt-3.5-turbo",
			messages: [
				{ role: "system", content: "You are a helpful assistant who rewrites text in grammatically correct and natural English." },
				{ role: "user", content: `Rephrase this: "${originalText}"` }
			]
		}, {
			headers: {
				"Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
				"Content-Type": "application/json"
			}
		});

		const rephrased = response.data.choices[0].message.content.trim();

		// Respond as a thread reply to the original message
		const slackRes = await axios.post("https://slack.com/api/chat.postMessage", {
			channel: payload.channel.id,
			thread_ts: payload.message.ts,
			text: `💡 *Rephrased version:*\n${rephrased}`
		}, {
			headers: {
				Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
				"Content-Type": "application/json"
			}
		});

		res.status(200).send(); // Acknowledge action
	} else {
		res.status(200).send(); // Acknowledge non-handled action
	}
});

app.post("/slack/command", async (req, res) => {
  const { text, user_name, response_url } = req.body;

  if (!text) {
    return res.send("Please provide text to rephrase, like `/rephrase I no understand`");
  }

  try {
    // Call OpenAI to rephrase
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant who rewrites text in grammatically correct and natural English." },
        { role: "user", content: `Rephrase this: "${text}"` }
      ]
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const rephrased = response.data.choices[0].message.content.trim();

    // Respond to Slack
    await axios.post(response_url, {
      response_type: "in_channel", // or "ephemeral" if you want only the user to see
      text: `💡 *Rephrased:* ${rephrased}`
    });

    res.status(200).end(); // Ack the slash command quickly
  } catch (error) {
    console.error("OpenAI error:", error);
    res.send("Something went wrong while rephrasing.");
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Slack rephraser listening on port ${PORT}`));
