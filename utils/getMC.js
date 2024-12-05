// Replace with your Bitquery API Key
const BITQUERY_API_KEY = 'BQYHUn5v9ibdSwqkNx9o127eEeh0Cv9U';

// Replace with your token's mint address
const MINT_ADDRESS = 'Gaej4DncZLCjExc4GDoRNSBcm1giwDJdd1p8G6MKrUEQ';

// GraphQL query
const query = `
  query GetLatestPrice {
    Solana {
      DEXTradeByTokens(
        limit: { count: 1 }
        orderBy: { descending: Block_Time }
        where: {
          Trade: {
            Currency: { MintAddress: { is: "${MINT_ADDRESS}" } }
            Dex: { ProgramAddress: { is: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" } }
          }
          Transaction: { Result: { Success: true } }
        }
      ) {
        Trade {
          PriceInUSD
        }
      }
    }
  }
`;

async function fetchMarketCap() {
    try {
        // API endpoint
        const url = 'https://graphql.bitquery.io/';

        // Fetch the data
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': BITQUERY_API_KEY, // API Key
            },
            body: JSON.stringify({ query }),
        });

        const data = await response.json();
        console.log('API Response:', data);

        // Extract the latest USD price
        const latestPrice =
            data?.data?.Solana?.DEXTradeByTokens?.[0]?.Trade?.PriceInUSD || 0;

        // Total supply of the token (replace with your token's total supply)
        const totalSupply = 1000000000; // Example: 1 billion tokens

        // Calculate market cap
        const marketCap = totalSupply * latestPrice;

        console.log(`Market Cap: $${marketCap}`);

        // Return the market cap
        return marketCap;
    } catch (error) {
        console.error('Error fetching market cap:', error);
        return null;
    }
}

// Calculate and log market cap
export const getMC = async () => {
    let mc = await fetchMarketCap();
    console.log(mc, ' mc');
    return mc;
};
