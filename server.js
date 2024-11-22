require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;

// Utility function to parse and track swaps
const trackSwap = (data) => {
    const transactions = data.map((tx) => {
        const solOutflow = tx.accountData.find(
            (account) => account.nativeBalanceChange < 0
        );

        const tokenInflow = tx.tokenTransfers.find(
            (transfer) => transfer.tokenAmount > 0
        );

        if (solOutflow && tokenInflow) {
            return {
                solSwapped: solOutflow.nativeBalanceChange / 1e9, // Convert lamports to SOL
                tokenReceived: {
                    mint: tokenInflow.mint,
                    amount: tokenInflow.tokenAmount,
                },
                timestamp: new Date(tx.timestamp * 1000), // Convert Unix timestamp to readable date
            };
        }
        return null;
    });

    return transactions.filter(Boolean); // Remove nulls
};

// POST route for /webhook
app.post('/webhook', (req, res) => {
    console.log("DATA START!!!!!");
    const heliusData = req.body;

    // Track and log each swap
    const swaps = trackSwap(heliusData);
    swaps.forEach((swap) => {
        console.log(`New Swap Detected:`);
        console.log(`SOL Swapped: ${swap.solSwapped} SOL`);
        console.log(`Token Received: ${swap.tokenReceived.amount} (${swap.tokenReceived.mint})`);
        console.log(`Timestamp: ${swap.timestamp}`);
    });

    res.status(200).send('Helius webhook received');
    console.log("DATA END!!!!");
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
