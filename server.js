const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware to parse JSON requests
app.use(bodyParser.json()); // Parse incoming JSON requests
app.use(cors()); // Enable CORS for testing

// Webhook endpoint
app.post('/webhook', (req, res) => {
    const data = req.body;

    // Log the data to the console
    if (data) {
        console.log('Webhook received:', JSON.stringify(data, null, 2));
    } else {
        console.log('No data received in the webhook request.');
    }

    // Respond with success
    res.status(200).json({ message: 'Webhook received successfully' });
});

// Default route for testing
app.get('/', (req, res) => {
    res.send('Webhook server is running!');
});

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
