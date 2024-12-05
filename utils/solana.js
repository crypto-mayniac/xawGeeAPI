// util/solana.js
import fetch from 'node-fetch';
import { config } from './config.js';
import { state } from './state.js';
import axios from 'axios';

export const fetchSolPrice = async () => {
    try {
        const response = await axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
        );
        return response.data.solana.usd;
    } catch (error) {
        console.error('Error fetching SOL price:', error);
        return 0;
    }
};

export const findHolders = async () => {
    const { API_URL, TOKEN_MINT_ADDRESS } = config;
    const now = Date.now();
    if (state.cachedHoldersCount && now - state.lastFetchTime < 10 * 60 * 1000) {
        return state.cachedHoldersCount;
    }

    const allOwners = new Set();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'helius-test',
                method: 'getProgramAccounts',
                params: [
                    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
                    {
                        filters: [
                            { dataSize: 165 },
                            { memcmp: { offset: 0, bytes: TOKEN_MINT_ADDRESS } },
                        ],
                        encoding: 'jsonParsed',
                    },
                ],
            }),
        });

        const data = await response.json();
        if (!data.result) return null;

        data.result.forEach((account) => {
            const parsedData = account.account.data.parsed;
            if (parsedData.info.tokenAmount.uiAmount > 0) {
                allOwners.add(parsedData.info.owner);
            }
        });

        state.cachedHoldersCount = allOwners.size;
        state.lastFetchTime = now;

        return state.cachedHoldersCount;
    } catch (error) {
        console.error('Error fetching token holders:', error);
        return null;
    }
};
