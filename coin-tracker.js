import http from "http";
import express from "express";
import chalk from "chalk";
import BlocknativeSDK from "bnc-sdk";
import WebSocket from "ws";
import dotenv  from "dotenv"
import { Client, Collection, GatewayIntentBits, Events } from "discord.js";
import fs from "fs";

import address from './config/config.js'
import notify from './utils/notify.js'
import save from './utils/save.js'
var mint_address = JSON.parse(fs.readFileSync("./config/mint-address.json", "utf-8"));

dotenv.config()
const delay = (ms) => new Promise((res) => setTimeout(res, ms));


////////////////////// Discord ///////////////////////////////

const client = new Client({ intents: [GatewayIntentBits.Guilds] }); // discord.js handler
client.login(process.env.DISCORD_BOT_TOKEN);

client.on("ready", () => {
  console.log("Bot Ready!");
  notify(client, process.env.MINT_CHANNEL_ID, "ERC20 Tracker Started...")
});

async function handleTransactionEvent(transaction) {
  const tx = transaction.transaction
  console.log(tx)

  if(!address.includes(tx.from.toLowerCase())) {
    console.log("Filter: Not in Address list")
    return;
  }

  notify(client, process.env.MINT_CHANNEL_ID, tx.hash)

  const toAddress = tx.to.toLowerCase()
  if(mint_address[toAddress] == undefined) mint_address[toAddress] = []
  mint_address[toAddress].push(toAddress)
  const len = mint_address[toAddress].length
  if(len == 3 || len == 5 || len == 7) {
    const msg = `${len} wallets interacted [${toAddress}]`
    notify(client, process.env.MINT_CHANNEL_ID, msg)
  }

  save("mint-address", mint_address)
}

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
      name: "ID" + id,
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
          "ID" + id
          } | Error:`,
          error
        );
      },
    });
    id++;

    let filter = invokeConfiguration(
      address.slice(i, i + buffer > len ? len : i + buffer)
    );
    // console.log(filter)
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