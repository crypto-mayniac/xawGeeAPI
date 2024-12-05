import { state } from './state.js'; // For shared state
import { config } from './config.js'; // Centralized configuration

export const validateHeliusHeader = (req, res, next) => {
    const expectedHeader = config.HELIUS_AUTH_HEADER; // Use config
    const receivedHeader = req.headers['authorization'];

    if (receivedHeader !== expectedHeader) {
        console.error('Unauthorized request: Invalid header');
        return res.status(401).send('Unauthorized');
    }

    next();
};

export const calculateSolSpent = (tx, userAccount) => {
    const swapAccounts = getSwapAccounts(tx, userAccount);
    const solTransfers = tx.nativeTransfers.filter(
        (transfer) =>
            transfer.fromUserAccount === userAccount &&
            swapAccounts.includes(transfer.toUserAccount)
    );

    return solTransfers.reduce((sum, transfer) => sum + transfer.amount, 0) / 1e9; // Convert lamports to SOL
};

export const trackSwap = (data) => {
    return data.map((tx) => {
        const userAccount = tx.feePayer;
        const tokenTransferIn = tx.tokenTransfers.find(
            (transfer) => transfer.toUserAccount === userAccount
        );

        if (tokenTransferIn) {
            return {
                type: 'buy',
                solAmount: calculateSolSpent(tx, userAccount),
                tokenAmount: tokenTransferIn.tokenAmount,
                tokenMint: tokenTransferIn.mint,
                timestamp: new Date(tx.timestamp * 1000),
                contractAddress: getSwapProgramId(tx, userAccount),
            };
        }

        return null;
    }).filter(Boolean); // Remove null values
};

export const getSwapAccounts = (tx, userAccount) => {
    const excludedPrograms = new Set([
        '11111111111111111111111111111111', // System Program
        'ComputeBudget111111111111111111111111111111', // Compute Budget Program
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
        'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
        'SysvarRent111111111111111111111111111111111', // Sysvar Rent
    ]);

    const swapInstructions = tx.instructions.filter(
        (instr) =>
            instr.accounts.includes(userAccount) &&
            !excludedPrograms.has(instr.programId)
    );

    const swapAccounts = new Set();
    swapInstructions.forEach((instr) => {
        instr.accounts.forEach((account) => swapAccounts.add(account));
    });

    return Array.from(swapAccounts);
};

export const getSwapProgramId = (tx, userAccount) => {
    const excludedPrograms = new Set([
        '11111111111111111111111111111111', // System Program
        'ComputeBudget111111111111111111111111111111', // Compute Budget Program
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
        'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
        'SysvarRent111111111111111111111111111111111', // Sysvar Rent
    ]);

    const swapInstruction = tx.instructions.find(
        (instr) =>
            instr.accounts.includes(userAccount) &&
            !excludedPrograms.has(instr.programId)
    );

    return swapInstruction?.programId || null;
};
