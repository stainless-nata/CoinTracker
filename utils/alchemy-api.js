import axios from 'axios'

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
export const getTokenAddress = async (hash, addr) => {
    try {
        console.info(`[${new Date().toISOString()}] Get Token Info`);
        await delay(2000)

        let options = {
            method: "POST",
            url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
            headers: {
              accept: "application/json",
              "content-type": "application/json",
            },
            data: {
                "id": 1,
                "jsonrpc": "2.0",
                "method": "alchemy_getAssetTransfers",
                "params": [
                    {
                        "fromBlock": "0x0",
                        "toBlock": "latest",
                        "category": [
                        "erc20"
                        ],
                        "withMetadata": false,
                        "excludeZeroValue": true,
                        "maxCount": "0x1",
                        "order": "desc",
                        "fromAddress": addr,
                    }
                ]
            }
        }
        let res = (await axios.request(options)).data.result.transfers;
        console.log(res)
        for (const key in res)
            if (res[key].hash == hash) 
                return {token: res[key].rawContract.address, type: "SELL", value: res[key].value};

        options = {
            method: "POST",
            url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
            headers: {
            accept: "application/json",
            "content-type": "application/json",
            },
            data: {
                "id": 1,
                "jsonrpc": "2.0",
                "method": "alchemy_getAssetTransfers",
                "params": [
                    {
                        "fromBlock": "0x0",
                        "toBlock": "latest",
                        "category": [
                        "erc20"
                        ],
                        "withMetadata": false,
                        "excludeZeroValue": true,
                        "maxCount": "0x1",
                        "order": "desc",
                        "toAddress": addr,
                    }
                ]
            }
        }

        res = (await axios.request(options)).data.result.transfers;
        console.log(res)
        for (const key in res)
            if (res[key].hash == hash) 
                return {token: res[key].rawContract.address, type: "BUY", value: res[key].value};
        
        return null;
    } catch (e) {
        console.error(`[${new Date().toISOString()}] Error in getTokenInfo: `, e);
    }
}