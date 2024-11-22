require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;

// Utility function to parse and track swaps
const trackSwap = (data) => {
    return data.reduce((accumulator, tx) => {
        const userAccount = tx.feePayer;
        const timestamp = new Date(tx.timestamp * 1000);

        // Find token transfers involving the user
        const tokenTransferIn = tx.tokenTransfers.find(
            (transfer) => transfer.toUserAccount === userAccount
        );
        const tokenTransferOut = tx.tokenTransfers.find(
            (transfer) => transfer.fromUserAccount === userAccount
        );

        // Initialize variables for the swap
        let type, solAmount, tokenAmount, tokenMint, contractAddress;

        if (tokenTransferIn) {
            // User bought tokens with SOL
            type = 'buy';
            tokenAmount = tokenTransferIn.tokenAmount;
            tokenMint = tokenTransferIn.mint;

            // Calculate SOL Spent
            solAmount = calculateSolSpent(tx.nativeTransfers, userAccount);

            // Find the contract address (program ID) used for the swap
            contractAddress = getSwapProgramId(tx, userAccount);
        } else if (tokenTransferOut) {
            // User sold tokens for SOL
            type = 'sell';
            tokenAmount = tokenTransferOut.tokenAmount;
            tokenMint = tokenTransferOut.mint;

            // Calculate SOL Received
            solAmount = calculateSolReceived(tx.nativeTransfers, userAccount);

            // Find the contract address (program ID) used for the swap
            contractAddress = getSwapProgramId(tx, userAccount);
        } else {
            // Not a buy or sell transaction; skip it
            return accumulator;
        }

        accumulator.push({
            type,
            solAmount,
            tokenAmount,
            tokenMint,
            timestamp,
            contractAddress,
        });

        return accumulator;
    }, []);
};

// Helper function to calculate SOL Spent
const calculateSolSpent = (nativeTransfers, userAccount) => {
    const solSpent = nativeTransfers
        .filter(
            (transfer) =>
                transfer.fromUserAccount === userAccount &&
                transfer.toUserAccount !== 'SystemAccount' // Exclude fee payments
        )
        .reduce((sum, transfer) => sum + transfer.amount, 0);

    return solSpent / 1e9; // Convert lamports to SOL
};

// Helper function to calculate SOL Received
const calculateSolReceived = (nativeTransfers, userAccount) => {
    const solReceived = nativeTransfers
        .filter((transfer) => transfer.toUserAccount === userAccount)
        .reduce((sum, transfer) => sum + transfer.amount, 0);

    return solReceived / 1e9; // Convert lamports to SOL
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
    const swapInstruction = tx.instructions.find((instr) =>
        instr.accounts.includes(userAccount) &&
        !excludedPrograms.includes(instr.programId)
    );

    return swapInstruction ? swapInstruction.programId : null;
};

// POST route for /webhook
app.post('/webhook', (req, res) => {
    const heliusData = req.body;

    // Track and log each swap
    const swaps = trackSwap(heliusData);

    if (swaps.length > 0) {
        console.log("DATA START!!!!!");
        swaps.forEach((swap) => {
            console.log(`New ${swap.type.toUpperCase()} Detected:`);
            if (swap.type === 'buy') {
                console.log(`SOL Spent: ${swap.solAmount} SOL`);
                console.log(`Token Bought: ${swap.tokenAmount} (${swap.tokenMint})`);
            } else if (swap.type === 'sell') {
                console.log(`SOL Received: ${swap.solAmount} SOL`);
                console.log(`Token Sold: ${swap.tokenAmount} (${swap.tokenMint})`);
            }
            console.log(`Contract Address: ${swap.contractAddress}`);
            console.log(`Timestamp: ${swap.timestamp}`);
        });
        console.log("DATA END!!!!");
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
    res.status(200).send('Server is running and ready to accept POST requests.');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
