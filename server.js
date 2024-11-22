require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Use process.env.PORT for the server or default to 8080
const PORT = process.env.PORT || 8080;

// POST route for /webhook
app.post('/webhook', (req, res) => {
    console.log('Helius Data:', JSON.stringify(req.body, null, 2));
    res.status(200).send('Helius webhook received');
});


// POST route for /
app.post('/', (req, res) => {
    console.log('Webhook received at /:', req.body);
    res.status(200).send('Got base webhook');
});

// GET route for /
app.get('/', (req, res) => {
    res.status(200).send('Server is running and ready to accept POST requests.');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
