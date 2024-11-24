import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import cors from 'cors';
import axios from 'axios'; // For fetching SOL price
import http from 'http';   // Required for setting up the server with Socket.IO
import { Server } from 'socket.io';

dotenv.config();

const app = express();

const allowedOrigins = ['https://nuggieinu.top', 'http://localhost:3000'];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            // Origin is allowed
            return callback(null, true);
        } else {
            // Origin is not allowed
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
    },
    methods: ['GET'],
}));


app.use(bodyParser.json());

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const mintAddress = process.env.TOKEN_MINT_ADDRESS;

let cachedHoldersCount = null;
let lastFetchTime = 0;

const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO server
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            // Allow requests with no origin
            if (!origin) return callback(null, true);

            if (allowedOrigins.indexOf(origin) !== -1) {
                return callback(null, true);
            } else {
                return callback(new Error('Not allowed by CORS'), false);
            }
        },
        methods: ['GET', 'POST'],
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

const validateHeliusHeader = (req, res, next) => {
    console.log('Expected Header:', process.env.HELIUS_AUTH_HEADER); // Debugging line

    const expectedHeader = process.env.HELIUS_AUTH_HEADER;
    const receivedHeader = req.headers['authorization']; // Match the header name

    if (receivedHeader !== expectedHeader) {
        console.error('Unauthorized request. Invalid Authentication Header.');
        return res.status(401).send('Unauthorized');
    }

    next(); // Proceed to the actual webhook logic if the header is valid
};

// Utility function to parse and track swaps
const trackSwap = (data) => {
    const transactions = data.map((tx) => {
        const userAccount = tx.feePayer;

        // Find token transfers involving the user (only buys)
        const tokenTransferIn = tx.tokenTransfers.find(
            (transfer) => transfer.toUserAccount === userAccount
        );

        if (tokenTransferIn) {
            // User bought tokens with SOL
            const type = 'buy';
            const tokenAmount = tokenTransferIn.tokenAmount;
            const tokenMint = tokenTransferIn.mint;
            const timestamp = new Date(tx.timestamp * 1000);

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

        // Return null for non-buy transactions
        return null;
    });

    return transactions.filter(Boolean); // Remove nulls
};

const findHolders = async () => {

    console.log('api key provided is ', HELIUS_API_KEY);
    console.log('api url made is ', url);
    const now = Date.now();
    if (cachedHoldersCount && now - lastFetchTime < 10 * 60 * 1000) {
        // Return cached result if less than 10 minutes old
        return cachedHoldersCount;
    }

    const allOwners = new Set();

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "helius-test",
                method: "getProgramAccounts",
                params: [
                    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Token Program ID
                    {
                        filters: [
                            {
                                dataSize: 165, // Size of SPL Token account
                            },
                            {
                                memcmp: {
                                    offset: 0, // Mint address starts at offset 0
                                    bytes: mintAddress,
                                },
                            },
                        ],
                        encoding: "jsonParsed",
                    },
                ],
            }),
        });

        const data = await response.json();

        if (!data.result) {
            console.error("Failed to fetch accounts:", data.error || "Unknown error");
            return null;
        }

        data.result.forEach((account) => {
            const parsedData = account.account.data.parsed;
            if (parsedData.info.tokenAmount.uiAmount > 0) {
                allOwners.add(parsedData.info.owner);
            }
        });

        cachedHoldersCount = allOwners.size;
        lastFetchTime = now;

        console.log(`Total unique holders: ${cachedHoldersCount}`);
    } catch (error) {
        console.error("Error fetching token holders:", error);
        return null;
    }

    return cachedHoldersCount;
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
app.post('/webhook', validateHeliusHeader, async (req, res) => {
    const heliusData = req.body;

    // Process the received webhook data
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
            if (swap.solAmount >= 0.1) {
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
});


// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('A client connected');
    socket.on('disconnect', () => {
        console.log('A client disconnected');
    });
});

app.get('/api/holders', async (req, res) => {
    const holdersCount = await findHolders();
    if (holdersCount !== null) {
        res.json({ holdersCount });
    } else {
        res.status(500).json({ error: 'Failed to fetch holders count' });
    }
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
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
