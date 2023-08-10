import http from "http";
import express from "express";
import chalk from "chalk";
import BlocknativeSDK from "bnc-sdk";
import WebSocket from "ws";
import dotenv  from "dotenv"

import address from './config/config.js'

dotenv.config()
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function handleTransactionEvent(transaction) {
    const tx = transaction.transaction
    console.log(tx.hash)
}
///////////////////////////////////////////////////////
const invokeConfiguration = (addr) => {
    let _configuration = [
        {
          name: "global",
          id: "global",
          filters: [
            {
              status: "confirmed",
            },
            {
              gasUsed: {
                gt: process.env.GAS_FEE,
              },
            },
          ],
          type: "global",
        },
    ];
    let c = 0;
    let temp = addr.map((i) => {
      return {
        name: `My subscription ${++c}`,
        id: i,
        filters: [],
        type: "account",
      };
    });
    temp = [..._configuration, ...temp];
  
    return temp;
};

async function sdkSetup(sdk, configuration) {
    const parsedConfiguration =
      typeof configuration === "string"
        ? JSON.parse(configuration)
        : configuration;
    const globalConfiguration = parsedConfiguration.find(
      ({ id }) => id === "global"
    );
    const addressConfigurations = parsedConfiguration.filter(
      ({ id }) => id !== "global"
    );
  
    globalConfiguration &&
      (await sdk.configuration({
        scope: "global",
        filters: globalConfiguration.filters,
      }));
  
    addressConfigurations.forEach(({ id, filters, abi }) => {
      const abiObj = abi ? { abi } : {};
      sdk.configuration({ ...abiObj, filters, scope: id, watchAddress: true });
    });
}

const scanMempool = async () => {
    console.info(`[${new Date().toISOString()}] Starting mempool scan`);
  
    let count = 0;
    const buffer = 45;

    let len = address.length;
    let id = 0;
    for (let i = 0; i < len; i = i + buffer) {
        const blocknative = new BlocknativeSDK({
            dappId: process.env.BLOCK_KEY,
            networkId: 1,
            transactionHandlers: [handleTransactionEvent],
            ws: WebSocket,
            name: id,
            onopen: () => {
                console.log(
                    `[${new Date().toISOString()}] Connected to Blocknative with name ${
                    id
                    }`
                );
            },
            onerror: (error) => {
                count++;
                console.error(
                    `[${new Date().toISOString()}] Error on Blocknative with name ${
                    id
                    } | Error:`,
                    error
                );
            },
        });
        id++;
  
        let filter = invokeConfiguration(
          address.slice(i, i + buffer > len ? len : i + buffer)
        );
        await sdkSetup(blocknative, filter);
        await delay(1000);
    }
    console.log(`[${new Date().toISOString()}] Error count: ${count}`);

    console.log(chalk.red(`\n[${new Date().toISOString()}] Service Start ... `));
};

scanMempool();

const app = express();
const httpServer = http.createServer(app);
httpServer.listen(process.env.PORT, console.log(chalk.yellow(`Start Wallet Tracker...`)));