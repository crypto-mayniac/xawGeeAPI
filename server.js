require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios'); // For fetching SOL price
const http = require('http');   // Required for setting up the server with Socket.IO
const { Server } = require('socket.io');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO server
const io = new Server(server, {
    cors: {
        origin: '*',  // Adjust this to your website's domain in production
        methods: ['GET', 'POST']
    }
});

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

// Set to keep track of processed transaction signatures
const processedTransactionIds = new Set();

// Helper function to catch errors in async route handlers
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Utility function to parse and track swaps
const trackSwap = (data) => {
    const transactions = data.map((tx) => {
        // Check if the transaction has already been processed
        if (processedTransactionIds.has(tx.signature)) {
            return null;
        }
        // Mark the transaction as processed
        processedTransactionIds.add(tx.signature);

        // Ensure tokenTransfers exist
        if (!tx.tokenTransfers || tx.tokenTransfers.length === 0) {
            return null;
        }

        // Identify token transfers where the user is the recipient
        const tokenTransferIn = tx.tokenTransfers.find(
            (transfer) => transfer.toUserAccount !== tx.feePayer && transfer.type === 'transfer'
        );

        if (tokenTransferIn) {
            const userAccount = tokenTransferIn.toUserAccount;
            const type = 'buy';
            const tokenAmountRaw = tokenTransferIn.tokenAmount;
            const tokenMint = tokenTransferIn.mint;
            const timestamp = new Date(tx.timestamp); // Assuming timestamp is in milliseconds

            // Adjust token amount based on decimals
            const tokenDecimals = tokenTransferIn.decimals || 0;
            const tokenAmount = tokenAmountRaw / Math.pow(10, tokenDecimals);

            // Calculate SOL Spent excluding fees
            const solAmount = calculateSolSpent(tx, userAccount);

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

        // Return null if no valid token transfer found
        return null;
    });

    return transactions.filter(Boolean); // Remove nulls
};

// Helper function to calculate SOL Spent excluding fees
const calculateSolSpent = (tx, userAccount) => {
    // Get all accounts involved in the swap instructions
    const swapAccounts = getSwapAccounts(tx, userAccount);

    if (swapAccounts.length === 0) return 0;

    // Identify SOL transfers from user to swap-related accounts
    const solTransfers = tx.nativeTransfers.filter(
        (transfer) =>
            transfer.fromUserAccount === userAccount &&
            swapAccounts.includes(transfer.toUserAccount)
    );

    // Sum up the SOL amounts
    const solSpentLamports = solTransfers.reduce(
        (sum, transfer) => sum + transfer.amount,
        0
    );

    // Convert lamports to SOL
    const solSpent = solSpentLamports / 1e9;

    return solSpent;
};

// Helper function to get all accounts involved in swap instructions
const getSwapAccounts = (tx, userAccount) => {
    // Exclude common programs
    const excludedPrograms = new Set([
        '11111111111111111111111111111111', // System Program
        'ComputeBudget111111111111111111111111111111', // Compute Budget Program
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
        'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
        'SysvarRent111111111111111111111111111111111', // Sysvar Rent
    ]);

    // Find swap instructions where the user is involved and not an excluded program
    const swapInstructions = tx.instructions.filter(
        (instr) =>
            instr.accounts.includes(userAccount) &&
            !excludedPrograms.has(instr.programId)
    );

    // Collect all accounts involved in swap instructions
    const swapAccounts = new Set();
    swapInstructions.forEach((instr) => {
        instr.accounts.forEach((account) => {
            swapAccounts.add(account);
        });
    });

    return Array.from(swapAccounts);
};

// Helper function to get the swap program ID (contract address)
const getSwapProgramId = (tx, userAccount) => {
    // Exclude common programs
    const excludedPrograms = new Set([
        '11111111111111111111111111111111', // System Program
        'ComputeBudget111111111111111111111111111111', // Compute Budget Program
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
        'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
        'SysvarRent111111111111111111111111111111111', // Sysvar Rent
    ]);

    // Find the instruction where the user is involved and that is not an excluded program
    const swapInstruction = tx.instructions.find(
        (instr) =>
            instr.accounts.includes(userAccount) &&
            !excludedPrograms.has(instr.programId)
    );

    return swapInstruction ? swapInstruction.programId : null;
};

// POST route for /webhook
app.post('/webhook', asyncHandler(async (req, res) => {
    const heliusData = req.body;

    // Log the raw data for debugging
    console.log('Received webhook data:', JSON.stringify(heliusData, null, 2));

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

            // Emit a notification if SOL Spent is over 0.100 SOL
            if (swap.solAmount >= 0.100) {
                io.emit('new_buy', {
                    solSpent: solAmountRounded,
                    usdValue,
                    tokenAmount: swap.tokenAmount,
                    tokenMint: swap.tokenMint,
                    contractAddress: swap.contractAddress,
                    timestamp: swap.timestamp,
                });
            }
        });
        console.log('DATA END!!!!');
    }

    res.status(200).send('Helius webhook received');
}));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).send('Internal Server Error');
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('A client connected');
    socket.on('disconnect', () => {
        console.log('A client disconnected');
    });
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

console.log('About to start the server...');
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});
