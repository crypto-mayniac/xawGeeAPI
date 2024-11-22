require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Example: Use process.env.PORT for the server
const PORT = process.env.PORT || 8080;

app.post('/webhook', (req, res) => {
    console.log('Webhook received:', req.body);
    res.status(200).send('Webhook received successfully');
});

app.post('/', (req, res) => {
    console.log('Webhook received:', req.body);
    res.status(200).send('Got base webhook');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
