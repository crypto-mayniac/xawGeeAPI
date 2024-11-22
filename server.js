require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios'); // For fetching SOL price

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;

// Global variable to store SOL price in USD
let solPriceUSD = 0;

// Function to fetch the current SOL price in USD
const fetchSolPrice = async () => {
    try {
        const response = await axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
        );
        solPriceUSD = response.data.solana.usd;
        console.log(`Updated SOL price: $${solPriceUSD} USD`);
    } catch (error) {
        console.error('Error fetching SOL price:', error);
    }
};

// Fetch SOL price every minute
fetchSolPrice();
setInterval(fetchSolPrice, 60 * 1000);

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

        // Only process buys
        if (solBalanceChange < 0 && tokenTransferIn) {
            // User bought tokens with SOL
            const type = 'buy';
            const solAmount = -solBalanceChange / 1e9; // Convert to positive SOL amount spent
            const tokenAmount = tokenTransferIn.tokenAmount;
            const tokenMint = tokenTransferIn.mint;
            const timestamp = new Date(tx.timestamp * 1000);

            // Find the contract address (program ID) used for the swap
            const contractAddress = getSwapProgramId(tx, userAccount);

            return {
                type,
                solAmount,
                tokenAmount,
                tokenMint,
                timestamp,
                contractAddress,
            };
        }

        // Return null for non-buy transactions
        return null;
    });

    return transactions.filter(Boolean); // Remove nulls
};

// Helper function to get the swap program ID (contract address)
const getSwapProgramId = (tx, userAccount) => {
    // Exclude common programs
    const excludedPrograms = [
        '11111111111111111111111111111111', // System Program
        'ComputeBudget111111111111111111111111111111', // Compute Budget Program
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
        'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
        'SysvarRent111111111111111111111111111111111', // Sysvar Rent
    ];

    // Find the instruction where the user is involved and that is not an excluded program
    const swapInstruction = tx.instructions.find(
        (instr) =>
            instr.accounts.includes(userAccount) &&
            !excludedPrograms.includes(instr.programId)
    );

    return swapInstruction ? swapInstruction.programId : null;
};

// POST route for /webhook
app.post('/webhook', async (req, res) => {
    const heliusData = req.body;

    // Track and log each swap
    const swaps = trackSwap(heliusData);

    if (swaps.length > 0) {
        console.log('DATA START!!!!!');
        swaps.forEach((swap) => {
            console.log(`New ${swap.type.toUpperCase()} Detected:`);

            // Round up SOL amount to 3 decimal places
            const solAmountRounded = Math.ceil(swap.solAmount * 1000) / 1000;

            // Calculate USD equivalent
            const usdValue = (solAmountRounded * solPriceUSD).toFixed(2);

            console.log(
                `SOL Spent: ${solAmountRounded} SOL (~$${usdValue} USD)`
            );
            console.log(
                `Token Bought: ${swap.tokenAmount} (${swap.tokenMint})`
            );
            console.log(`Contract Address: ${swap.contractAddress}`);
            console.log(`Timestamp: ${swap.timestamp}`);
        });
        console.log('DATA END!!!!');
    }

    res.status(200).send('Helius webhook received');
});

// POST route for /
app.post('/', (req, res) => {
    console.log('Webhook received at /:', req.body);
    res.status(200).send('Got base webhook');
});

// GET route for /
app.get('/', (req, res) => {
    res
        .status(200)
        .send('Server is running and ready to accept POST requests.');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
