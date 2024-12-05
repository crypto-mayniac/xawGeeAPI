import dotenv from 'dotenv';

dotenv.config();

export const config = {
    HELIUS_API_KEY: process.env.HELIUS_API_KEY,
    HELIUS_AUTH_HEADER: process.env.HELIUS_AUTH_HEADER,
    TOKEN_MINT_ADDRESS: process.env.TOKEN_MINT_ADDRESS,
    API_URL: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
};
