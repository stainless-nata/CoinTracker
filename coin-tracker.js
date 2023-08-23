import http from "http";
import express from "express";
import chalk from "chalk";
import BlocknativeSDK from "bnc-sdk";
import WebSocket from "ws";
import dotenv  from "dotenv"
import { Client, Collection, GatewayIntentBits, Events } from "discord.js";
import fs from "fs";

import { address, routers, WETH, DAI } from './config/config.js'
import notify from './utils/notify.js'
import save from './utils/save.js'
import { getTokenAddress } from './utils/alchemy-api.js'
import getTokenPrice from './utils/token-price.js'
import { getTokenBalance, getEtherBalance } from './utils/balance.js'

var buy_address = JSON.parse(fs.readFileSync("./config/buy-address.json", "utf-8"));
var sell_address = JSON.parse(fs.readFileSync("./config/sell-address.json", "utf-8"));

dotenv.config()
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

////////////////////// Discord ///////////////////////////////


const client = new Client({ intents: [GatewayIntentBits.Guilds] }); // discord.js handler
client.login(process.env.DISCORD_BOT_TOKEN);

client.on("ready", async () => {
  console.log("Bot Ready!");
  notify(client, process.env.BUY_CHANNEL_ID, "ERC20 Tracker Started...", [])
  notify(client, process.env.SELL_CHANNEL_ID, "ERC20 Tracker Started...", [])
});

async function handleTransactionEvent(transaction) {
  const tx = transaction.transaction
  console.log(tx.hash)

  const fromAddress = tx.from.toLowerCase()
  const toAddress = tx.to.toLowerCase()

  if(!address.includes(fromAddress)) {
    console.log("Filter: Not in Address list")
    return;
  }
  if(!routers.includes(toAddress)) {
    console.log("Filter: Not Swap transaction")
    return;
  }

  let res = await getTokenAddress(tx.hash, fromAddress)
  if(res == null) {
    console.log("Filter: No ERC20 transfers")
    return;
  }
  if(res.value == null) res.value = 0
  console.log(res)
  console.log(tx)

  const tokenAddress = res.token;
  let len;
  let totalAmount = 0, totalEther = 0, totalToken = 0;
  let tokenBalance = await getTokenBalance(fromAddress, tokenAddress);
  let etherBalance = await getEtherBalance(fromAddress);
  
  if(res.type == "BUY") {
    if(buy_address[tokenAddress] == undefined) buy_address[tokenAddress] = {}

    if(buy_address[tokenAddress][fromAddress] == undefined) {
      buy_address[tokenAddress][fromAddress] = {
        amount: res.value
      }
      len = Object.keys(buy_address[tokenAddress]).length
    }
    else {
      buy_address[tokenAddress][fromAddress].amount += res.value
      len = 0
    }
    buy_address[tokenAddress][fromAddress].ether = etherBalance;
    buy_address[tokenAddress][fromAddress].token = tokenBalance;
    for(const key in buy_address[tokenAddress]) {
      totalAmount = totalAmount + buy_address[tokenAddress][key].amount 
      totalEther = totalEther + buy_address[tokenAddress][key].ether 
      totalToken = totalToken + buy_address[tokenAddress][key].token
    }

    save("buy-address", buy_address);
  } else {
    if(sell_address[tokenAddress] == undefined) sell_address[tokenAddress] = {}
    
    if(sell_address[tokenAddress][fromAddress] == undefined) {
      sell_address[tokenAddress][fromAddress] = {
        amount: res.value
      }
      len = Object.keys(sell_address[tokenAddress]).length
    }
    else {
      sell_address[tokenAddress][fromAddress].amount += res.value
      len = 0
    }
    sell_address[tokenAddress][fromAddress].ether = etherBalance;
    sell_address[tokenAddress][fromAddress].token = tokenBalance;
    for(const key in sell_address[tokenAddress]) {
      totalAmount = totalAmount + sell_address[tokenAddress][key].amount 
      totalEther = totalEther + sell_address[tokenAddress][key].ether 
      totalToken = totalToken + sell_address[tokenAddress][key].token
    }

    save("sell-address", sell_address);
  }

  let alertType = "None";
  if (len == 2) alertType = "<@&1025482820598112369>";
  if (len == 5) alertType = "<@&1025482935081644116>";
  if (len == 10) alertType = "<@&1025482908141637702>";
  if (len == 25) alertType = "<@&1025482870174793738>";
  if(alertType !== "None") {
    let ethPrice = await getTokenPrice(tokenAddress, WETH);
    let usdPrice = ethPrice * (await getTokenPrice(WETH, DAI));

    let params = [];
    params.push({
      name: `Sale Amount`,
      value: `${totalAmount.toFixed(2)} Tokens\n${(totalAmount * usdPrice).toFixed(2)} USD\n${(totalAmount * ethPrice).toFixed(2)} ETH`,
      inline: true,
    })
    params.push({
      name: `ETH Balance`,
      value: `${totalEther.toFixed(2)} ETH`,
      inline: true,
    })
    params.push({
      name: `Token Balance`,
      value: `${totalToken.toFixed(2)} Tokens\n${(totalToken * usdPrice).toFixed(2)} USD\n${(totalToken * ethPrice).toFixed(2)} ETH`,
      inline: true,
    })
    console.log(params)
    const msg = `${alertType}: ${len} wallets ${res.type == "BUY" ? "bought" : "sold"} [${tokenAddress}]`
    notify(client, res.type == "BUY" ? process.env.BUY_CHANNEL_ID : process.env.SELL_CHANNEL_ID, msg, params)
  }
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
httpServer.listen(process.env.PORT, console.log(chalk.yellow(`Start Coin Tracker...`)));