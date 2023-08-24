import Web3 from 'web3';
import ethers from 'ethers';

export const getTokenBalance = async (fromAddress, tokenAddress) => {
    try {
        let web3 = new Web3('https://ethereum.publicnode.com');
        const token = new web3.eth.Contract([
            {"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},
            {"constant":true,"inputs":[{"name":"","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}
        ], tokenAddress)

        let decimal = parseInt(await token.methods.decimals().call());

        let balance = await token.methods.balanceOf(fromAddress).call();
        if(decimal > 9) {
            balance = parseInt(ethers.utils.formatUnits(balance, 9))
            balance = parseFloat(ethers.utils.formatUnits(balance, decimal - 9))
        } else {
            balance = parseFloat(ethers.utils.formatUnits(balance, decimal))
        }

        console.log("Token Balance: ", balance)

        return balance;
    } catch (e) {
        console.log("Error in Get Token Balance: ", e)
    }
}

export const getEtherBalance = async (address) => {
    try {
        let web3 = new Web3('https://ethereum.publicnode.com');
        let balance = await web3.eth.getBalance(address)
        balance = parseFloat(ethers.utils.formatUnits(parseInt(ethers.utils.formatUnits(balance, 9)), 9))

        console.log("ETH balance: ", balance)
        return balance;
    } catch (e) {
        console.log("Error in Get Ether Balance: ", e)
    }
}

export default getTokenBalance;