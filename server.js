require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;

// Utility function to parse and track swaps
const trackSwap = (data) => {
    const transactions = data.map((tx) => {
        const userAccount = tx.feePayer;

        // Find the user's SOL balance change
        const userAccountData = tx.accountData.find(
            (account) => account.account === userAccount
        );
        const solBalanceChange = userAccountData ? userAccountData.nativeBalanceChange : 0;

        // Find token transfers involving the user
        const tokenTransferIn = tx.tokenTransfers.find(
            (transfer) => transfer.toUserAccount === userAccount
        );
        const tokenTransferOut = tx.tokenTransfers.find(
            (transfer) => transfer.fromUserAccount === userAccount
        );

        if (solBalanceChange < 0 && tokenTransferIn) {
            // User bought tokens with SOL
            return {
                type: 'buy',
                solAmount: solBalanceChange / 1e9, // Negative value indicates spending SOL
                tokenAmount: tokenTransferIn.tokenAmount,
                tokenMint: tokenTransferIn.mint,
                timestamp: new Date(tx.timestamp * 1000),
            };
        } else if (solBalanceChange > 0 && tokenTransferOut) {
            // User sold tokens for SOL
            return {
                type: 'sell',
                solAmount: solBalanceChange / 1e9, // Positive value indicates receiving SOL
                tokenAmount: tokenTransferOut.tokenAmount,
                tokenMint: tokenTransferOut.mint,
                timestamp: new Date(tx.timestamp * 1000),
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
        console.log(`New ${swap.type.toUpperCase()} Detected:`);
        if (swap.type === 'buy') {
            console.log(`SOL Spent: ${-swap.solAmount} SOL`); // Negative to show positive amount spent
            console.log(`Token Bought: ${swap.tokenAmount} (${swap.tokenMint})`);
        } else if (swap.type === 'sell') {
            console.log(`SOL Received: ${swap.solAmount} SOL`);
            console.log(`Token Sold: ${swap.tokenAmount} (${swap.tokenMint})`);
        }
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
