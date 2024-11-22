const express = require('express');
const bodyParser = require('body-parser');

const app = express();

// Middleware to parse JSON requests
app.use(bodyParser.json());

// POST route for the webhook
app.post('/webhook', (req, res) => {
    console.log('Webhook received:', req.body); // Log the incoming request body
    res.status(200).send('Webhook received successfully');
});

// Default GET route for the root
app.get('/', (req, res) => {
    res.send('Webhook server is running!');
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
