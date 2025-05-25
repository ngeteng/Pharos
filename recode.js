require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const { reportToTelegram } = require('./telegramReporter.js');
const { HttpsProxyAgent } = require('https-proxy-agent');
const randomUseragent = require('random-useragent');
const axios = require('axios');
const prompt = require('prompt-sync')({ sigint: true });

// =============================================================================
// 🎨 Kustomisasi Tampilan Konsol (Warna & Emoji)
// =============================================================================
const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    bold: '\x1b[1m',
    magenta: '\x1b[35m',
};

const logger = {
    info: (msg) => console.log(`${colors.cyan}ℹ️  [INFO] ${msg}${colors.reset}`),
    wallet: (msg) => console.log(`${colors.magenta}${colors.bold}💼 [WALLET] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}⚠️  [WARN] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ [ERROR] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}🎉 [SUCCESS] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.cyan}⏳ [LOADING] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.white}➡️  [STEP] ${msg}${colors.reset}`),
    api: (msg) => console.log(`${colors.yellow}📡 [API] ${msg}${colors.reset}`),
    tx: (hash) => console.log(`${colors.green}🔗 [EXPLORER] https://testnet.pharosscan.xyz/tx/${hash}${colors.reset}`),
    banner: () => {
        console.log(`${colors.cyan}${colors.bold}`);
        console.log('=================================================');
        console.log('      🤖 Pharos Testnet Auto Bot 🤖');
        console.log('           ✨ Airdrop Insiders ✨');
        console.log(`     Powered by ${colors.magenta}Node.js${colors.cyan} & ${colors.magenta}Ethers.js${colors.cyan}`);
        console.log('=================================================');
        console.log(`${colors.reset}\n`);
    },
    separator: (title = '') => {
        const line = '----------------------------------------';
        if (title) {
            console.log(`\n${colors.yellow}${colors.bold}--- ${title.toUpperCase()} ---${colors.reset}`);
        } else {
            console.log(`${colors.yellow}${line}${colors.reset}`);
        }
    }
};

// =============================================================================
// ⚙️ Konfigurasi & Konstanta
// =============================================================================
const API_BASE_URL = 'https://api.pharosnetwork.xyz';
const INVITE_CODE = process.env.INVITE_CODE;
const TASK_ID_INTERACTION = 103;
const SIGN_MESSAGE_CONTENT = "pharos";

const networkConfig = {
    name: 'Pharos Testnet',
    chainId: 688688,
    rpcUrl: process.env.RPC_URL || 'https://testnet.dplabs-internal.com',
    currencySymbol: 'PHRS',
};

const tokens = {
    USDC: '0xad902cf99c2de2f1ba5ec4d642fd7e49cae9ee37',
    WPHRS: '0x76aaada469d23216be5f7c596fa25f282ff9b364',
    USDT: '0xed59de2d7ad9c043442e381231ee3646fc3c2939',
    POSITION_MANAGER: '0xF8a1D4FF0f9b9Af7CE58E1fc1833688F3BFd6115',
};

const tokenDecimals = { WPHRS: 18, USDC: 6, USDT: 6 };
const multicallContractAddress = '0x1a4de519154ae51200b0ad7c90f7fac75547888a';
const MIN_STABLE_SWAP = 0.00001; // Jumlah minimum stablecoin untuk di-swap kembali

// --- ABI ---
const multicallAbi = [{"inputs":[{"internalType":"uint256","name":"collectionAndSelfcalls","type":"uint256"},{"internalType":"bytes[]","name":"data","type":"bytes[]"}],"name":"multicall","outputs":[],"stateMutability":"nonpayable","type":"function"}];
const erc20Abi = ["function balanceOf(address) view returns (uint256)","function allowance(address owner, address spender) view returns (uint256)","function approve(address spender, uint256 amount) public returns (bool)","function decimals() view returns (uint8)","function deposit() public payable","function withdraw(uint256 wad) public"];
const positionManagerAbi = [{"inputs":[{"components":[{"internalType":"address","name":"token0","type":"address"},{"internalType":"address","name":"token1","type":"address"},{"internalType":"uint24","name":"fee","type":"uint24"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint256","name":"amount0Desired","type":"uint256"},{"internalType":"uint256","name":"amount1Desired","type":"uint256"},{"internalType":"uint256","name":"amount0Min","type":"uint256"},{"internalType":"uint256","name":"amount1Min","type":"uint256"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"internalType":"struct INonfungiblePositionManager.MintParams","name":"params","type":"tuple"}],"name":"mint","outputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"uint128","name":"liquidity","type":"uint128"},{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"payable","type":"function"}];

// --- Opsi Transaksi ---
const swapPairOptions = [
    { from: 'WPHRS', to: 'USDC', amount: 0.01 }, { from: 'WPHRS', to: 'USDT', amount: 0.01 },
    { from: 'USDC', to: 'WPHRS', amount: 0.01 }, { from: 'USDT', to: 'WPHRS', amount: 0.001 },
    { from: 'USDC', to: 'USDT', amount: 0.01 }, { from: 'USDT', to: 'USDC', amount: 0.001 },
];
const lpPairOptions = [
    { token0: 'WPHRS', token1: 'USDC', amount0: 0.001, amount1: 0.001, fee: 3000 },
    { token0: 'WPHRS', token1: 'USDT', amount0: 0.001, amount1: 0.001, fee: 3000 },
];
const transferAmountPHRS = 0.000001;
const wrapAmountPHRS = { min: 0.01, max: 0.05 };

// =============================================================================
// 🛠️ Fungsi Utilitas & Pembantu
// =============================================================================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const retryOperation = async (fn, retries = 3, delayMs = 3000, operationName = 'Operation') => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            logger.warn(`⚠️  ${operationName} failed (Attempt ${i + 1}/${retries}): ${error.message.slice(0,100)}...`);
            if (i < retries - 1) {
                logger.loading(`⏳ Retrying in ${delayMs / 1000}s...`);
                await delay(delayMs);
                delayMs *= 1.5;
            } else {
                logger.error(`❌ ${operationName} failed after ${retries} attempts.`);
                throw error;
            }
        }
    }
};

const loadFileLines = (filePath, logPrefix = "File") => {
    try {
        if (!fs.existsSync(filePath)) {
            logger.warn(`📄 ${logPrefix}: File not found at ${filePath}. Returning empty array.`);
            return [];
        }
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').map(line => line.trim()).filter(line => line);
        logger.info(`📄 ${logPrefix}: Loaded ${lines.length} lines from ${filePath}.`);
        return lines;
    } catch (error) {
        logger.error(`❌ ${logPrefix}: Failed to load from ${filePath}: ${error.message}`);
        return [];
    }
};

const getRandomElement = (arr) => arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;

const setupProvider = (proxy = null) => {
    const providerOptions = { chainId: networkConfig.chainId, name: networkConfig.name };
    if (proxy) {
        logger.info(`   🔌 Using proxy: ${proxy.split('@')[1] || proxy}`);
        const agent = new HttpsProxyAgent(proxy);
        return new ethers.JsonRpcProvider(networkConfig.rpcUrl, providerOptions.chainId, {
            fetchOptions: { agent },
            staticNetwork: ethers.Network.from(providerOptions)
        });
    } else {
        logger.info('   DIRECT Using direct mode (no proxy).');
        return new ethers.JsonRpcProvider(networkConfig.rpcUrl, providerOptions.chainId, {
             staticNetwork: ethers.Network.from(providerOptions)
        });
    }
};

const getAxiosConfig = (method, url, jwt = null, proxy = null, data = null) => {
    const headers = {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.8',
        'authorization': `Bearer ${jwt || 'null'}`,
        'sec-ch-ua': '"Chromium";v="136", "Brave";v="136", "Not.A/Brand";v="99"',
        'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-site',
        'sec-gpc': '1', 'Referer': 'https://testnet.pharosnetwork.xyz/',
        'Referrer-Policy': 'strict-origin-when-cross-origin', 'User-Agent': randomUseragent.getRandom(),
    };
    const config = { method, url, headers };
    if (proxy) config.httpsAgent = new HttpsProxyAgent(proxy);
    if (data) config.data = data;
    return config;
};

const getTransactionOptions = async (provider, estimatedGas) => {
    try {
        const feeData = await provider.getFeeData();
        const gasLimit = BigInt(Math.ceil(Number(estimatedGas) * 1.3)); // 30% buffer
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            return { gasLimit, maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas };
        } else if (feeData.gasPrice) {
            return { gasLimit, gasPrice: feeData.gasPrice };
        } else {
            logger.warn("   ⚠️ Could not determine fee data, using default gas price.");
            return { gasLimit, gasPrice: ethers.parseUnits('1.5', 'gwei') };
        }
    } catch (error) {
        logger.error(`   ❌ Error fetching fee data: ${error.message}`);
        return { gasLimit: BigInt(Math.ceil(Number(estimatedGas) * 1.3)), gasPrice: ethers.parseUnits('1.5', 'gwei') };
    }
};

const waitForTransactionReceipt = async (txResponse, operationName = "Transaction") => {
    logger.loading(`   ⏳ ${operationName} sent (hash: ${txResponse.hash.slice(0,10)}...), waiting for confirmation...`);
    const receipt = await retryOperation(async () => {
        const rec = await txResponse.wait(1);
        if (!rec) throw new Error("Transaction receipt is null.");
        return rec;
    }, 5, 10000, `${operationName} confirmation`);

    if (receipt && receipt.status === 1) {
        logger.success(`   🎉 ${operationName} confirmed!`);
        logger.tx(receipt.hash);
        return receipt;
    } else {
        const errorMsg = `${operationName} failed or reverted. Status: ${receipt ? receipt.status : 'unknown'}.`;
        logger.error(`   ❌ ${errorMsg}`);
        throw new Error(errorMsg);
    }
};

// =============================================================================
// 🌐 Fungsi Interaksi API Pharos
// =============================================================================
const apiLogin = async (wallet, proxy = null) => {
    logger.api('🔑 Attempting API login...');
    const signature = await wallet.signMessage(SIGN_MESSAGE_CONTENT);
    const url = `${API_BASE_URL}/user/login?address=${wallet.address}&signature=${signature}&invite_code=${INVITE_CODE}`;
    try {
        const response = await retryOperation(() => axios(getAxiosConfig('post', url, null, proxy)), 3, 2000, "API Login");
        if (response.data.code === 0 && response.data.data.jwt) {
            logger.success('   ✅ API Login successful!');
            return response.data.data.jwt;
        } else {
            logger.error(`   ❌ API Login failed: ${response.data.msg || 'Unknown error'}`);
            return null;
        }
    } catch (error) { return null; }
};

const apiDailyCheckIn = async (walletAddress, jwt, proxy) => {
    if (!jwt) { logger.warn("   ⚠️ Skipping daily check-in: No JWT."); return; }
    logger.api('📅 Performing daily check-in...');
    const url = `${API_BASE_URL}/sign/in?address=${walletAddress}`;
    try {
        const response = await axios(getAxiosConfig('post', url, jwt, proxy));
        if (response.data.code === 0) logger.success('   ☀️ Daily check-in successful!');
        else if (response.data.msg && response.data.msg.toLowerCase().includes("already sign in")) logger.info('   👍 Already checked in today.');
        else logger.warn(`   ⚠️ Check-in attempt: ${response.data.msg || 'Unknown status'}`);
    } catch (error) { logger.error(`   ❌ Check-in API request failed: ${error.message}`); }
};

const apiClaimFaucet = async (walletAddress, jwt, proxy) => {
    if (!jwt) { logger.warn("   ⚠️ Skipping faucet claim: No JWT."); return false; }
    logger.api('💧 Attempting to claim faucet...');
    const statusUrl = `${API_BASE_URL}/faucet/status?address=${walletAddress}`;
    const claimUrl = `${API_BASE_URL}/faucet/daily?address=${walletAddress}`;
    try {
        const statusResponse = await axios(getAxiosConfig('get', statusUrl, jwt, proxy));
        if (statusResponse.data.code !== 0 || !statusResponse.data.data) {
            logger.warn(`   ⚠️ Faucet status check failed: ${statusResponse.data.msg || 'Unknown error'}`);
            return false;
        }
        if (!statusResponse.data.data.is_able_to_faucet) {
            const nextAvailableDate = new Date(statusResponse.data.data.avaliable_timestamp * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
            logger.info(`   💧 Faucet not available yet. Next claim: ${nextAvailableDate}`);
            return false;
        }
        logger.loading('   ⏳ Faucet is available, attempting to claim...');
        const claimResponse = await axios(getAxiosConfig('post', claimUrl, jwt, proxy));
        if (claimResponse.data.code === 0) {
            logger.success('   💰 Faucet claimed successfully!');
            return true;
        } else {
            logger.error(`   ❌ Faucet claim failed: ${claimResponse.data.msg || 'Unknown error'}`);
            return false;
        }
    } catch (error) { logger.error(`   ❌ Faucet claim process API request failed: ${error.message}`); return false; }
};

const apiVerifyTask = async (walletAddress, jwt, txHash, proxy) => {
    if (!jwt) { logger.warn("   ⚠️ Skipping task verification: No JWT."); return false; }
    logger.api(`   🔍 Verifying task for TX: ${txHash.slice(0, 10)}...`);
    const url = `${API_BASE_URL}/task/verify?address=${walletAddress}&task_id=${TASK_ID_INTERACTION}&tx_hash=${txHash}`;
    try {
        const response = await retryOperation(() => axios(getAxiosConfig('post', url, jwt, proxy)), 3, 3000, `Task Verification ${txHash.slice(0, 10)}`);
        if (response.data.code === 0 && response.data.data.verified) {
            logger.success(`   ✔️ Task verified successfully for ${txHash.slice(0, 10)}...`);
            return true;
        } else {
            logger.warn(`   ⚠️ Task verification for ${txHash.slice(0,10)} failed or pending: ${response.data.msg || 'Unknown error'}`);
            return false;
        }
    } catch (error) { return false; }
};

const apiGetUserInfo = async (walletAddress, jwt, proxy) => {
    // 1. Periksa JWT seperti sebelumnya
    if (!jwt) { logger.warn("  ⚠️ Skipping user info fetch: No JWT."); return; }

    // 2. Log alamat wallet yang diterima (untuk debugging)
    logger.info(`  🔍 Debug: Wallet address received for API call: ${walletAddress}`);

    // 3. Log API seperti sebelumnya, tambahkan cek jika walletAddress ada
    logger.api(`📊 Fetching user info for ${walletAddress ? walletAddress.slice(0, 6) : 'UNDEFINED_WALLET'}...`);

    // 4. Bangun URL
    const url = `${API_BASE_URL}/user/profile?address=${walletAddress}`;

    // 5. Log URL yang akan digunakan (untuk debugging)
    logger.info(`  🔍 Debug: Requesting URL: ${url}`);

    try {
        // 6. Tambahkan pemeriksaan eksplisit untuk walletAddress
        if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.startsWith('0x')) {
            throw new Error(`Invalid or undefined wallet address: ${walletAddress}`);
        }

        // 7. Lakukan panggilan API
        const response = await axios(getAxiosConfig('get', url, jwt, proxy));

        // 8. Proses respons seperti sebelumnya
        if (response.data && response.data.code === 0 && response.data.data && response.data.data.user_info) {
            const userInfo = response.data.data.user_info;
            logger.info(`  🧑 User ID: ${userInfo.ID || 'N/A'}`);
            logger.info(`  ⭐ Task Points: ${userInfo.TaskPoints !== undefined ? userInfo.TaskPoints : 'N/A'}`);
            logger.info(`  🌟 Total Points: ${userInfo.TotalPoints !== undefined ? userInfo.TotalPoints : 'N/A'}`);

            // 9. Panggil pelaporan Telegram (pastikan sudah diimpor)
            await reportToTelegram(logger, walletAddress, userInfo);

        } else {
            logger.error(`  ❌ Failed to fetch user info: ${response.data.msg || 'Unknown error or invalid structure'}`);
        }
    } catch (error) {
        // 10. Log error yang lebih informatif, sertakan URL
        logger.error(`  ❌ User info API request failed for URL [${url}]: ${error.message}`);
    }
};

// =============================================================================
// ⛓️ Fungsi Interaksi Blockchain (Ethers.js)
// =============================================================================

const checkBalanceAndApprove = async (wallet, tokenSymbol, amount, spender) => {
    const tokenAddress = tokens[tokenSymbol];
    const tokenDecs = tokenDecimals[tokenSymbol];
    logger.step(`   ⚖️ Checking balance & approval for ${amount} ${tokenSymbol}...`);
    try {
        const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
        const balance = await tokenContract.balanceOf(wallet.address);
        const requiredAmount = ethers.parseUnits(amount.toString(), tokenDecs);

        if (balance < requiredAmount) {
            logger.warn(`   ⚠️ Insufficient ${tokenSymbol} balance: ${ethers.formatUnits(balance, tokenDecs)} (need ${amount})`);
            return false;
        }
        logger.info(`   💰 ${tokenSymbol} balance: ${ethers.formatUnits(balance, tokenDecs)}`);

        const allowance = await tokenContract.allowance(wallet.address, spender);
        if (allowance < requiredAmount) {
            logger.step(`   🔒 Approving ${tokenSymbol} for spender ${spender.slice(0,6)}...`);
            const estimatedGas = await tokenContract.approve.estimateGas(spender, ethers.MaxUint256);
            const txOptions = await getTransactionOptions(wallet.provider, estimatedGas);
            const approveTx = await tokenContract.approve(spender, ethers.MaxUint256, txOptions);
            await waitForTransactionReceipt(approveTx, `Approval ${tokenSymbol}`);
        } else {
             logger.info(`   👍 ${tokenSymbol} already approved for ${spender.slice(0,6)}.`);
        }
        return true;
    } catch (error) {
        logger.error(`   ❌ Balance/approval check for ${tokenSymbol} failed: ${error.message}`);
        return false;
    }
};

// Fungsi baru untuk approve saldo penuh (menggunakan BigInt)
const checkBalanceAndApproveFull = async (wallet, tokenSymbol, balanceToApprove, spender) => {
    const tokenAddress = tokens[tokenSymbol];
    logger.step(`   ⚖️ Checking full balance & approval for ${tokenSymbol}...`);
    try {
        const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
        const allowance = await tokenContract.allowance(wallet.address, spender);

        if (allowance < balanceToApprove) {
            logger.step(`   🔒 Approving full ${tokenSymbol} balance for spender ${spender.slice(0,6)}...`);
            const estimatedGas = await tokenContract.approve.estimateGas(spender, ethers.MaxUint256);
            const txOptions = await getTransactionOptions(wallet.provider, estimatedGas);
            const approveTx = await tokenContract.approve(spender, ethers.MaxUint256, txOptions);
            await waitForTransactionReceipt(approveTx, `Full Approval ${tokenSymbol}`);
        } else {
             logger.info(`   👍 Full ${tokenSymbol} balance already approved for ${spender.slice(0,6)}.`);
        }
        return true;
    } catch (error) {
        logger.error(`   ❌ Full Balance/approval check for ${tokenSymbol} failed: ${error.message}`);
        return false;
    }
}


const executeTransaction = async (fnName, contractInteraction, operationDescription, wallet, jwt, proxy) => {
    try {
        const txResponse = await contractInteraction();
        const receipt = await waitForTransactionReceipt(txResponse, operationDescription);
        if (receipt && jwt) {
            await apiVerifyTask(wallet.address, jwt, receipt.hash, proxy);
        }
        return receipt;
    } catch (error) {
        logger.error(`   ❌ ${operationDescription} execution failed: ${error.message}`);
        // Log more details if needed, but keep it concise for now
        return null;
    }
};

const actionTransferPHRS = async (wallet, index, jwt, proxy) => {
    const operation = `PHRS Transfer #${index + 1}`;
    logger.step(`💸 Preparing ${operation}...`);
    try {
        const toAddress = ethers.Wallet.createRandom().address;
        const amountParsed = ethers.parseEther(transferAmountPHRS.toString());
        const balance = await wallet.provider.getBalance(wallet.address);

        if (balance < amountParsed) {
            logger.warn(`   ⚠️ Skipping ${operation}: Insufficient PHRS.`);
            return;
        }
        logger.info(`      Sending ${transferAmountPHRS} PHRS to ${toAddress.slice(0,6)}...`);

        const estimatedGas = BigInt(21000);
        const txOptions = await getTransactionOptions(wallet.provider, estimatedGas);

        await executeTransaction(operation, () => wallet.sendTransaction({ to: toAddress, value: amountParsed, ...txOptions }), operation, wallet, jwt, proxy);
    } catch (error) { logger.error(`   ❌ Error in ${operation}: ${error.message}`); }
};

const actionWrapPHRS = async (wallet, index, jwt, proxy) => {
    const operation = `Wrap PHRS #${index + 1}`;
    logger.step(`🔄 Preparing ${operation}...`);
    try {
        const amountToWrap = wrapAmountPHRS.min + Math.random() * (wrapAmountPHRS.max - wrapAmountPHRS.min);
        const amountWei = ethers.parseEther(amountToWrap.toFixed(6).toString());
        const balance = await wallet.provider.getBalance(wallet.address);

        if (balance < amountWei) {
            logger.warn(`   ⚠️ Skipping ${operation}: Insufficient PHRS.`);
            return;
        }
        logger.info(`      Wrapping ${amountToWrap.toFixed(6)} PHRS to WPHRS...`);

        const wphrsContract = new ethers.Contract(tokens.WPHRS, erc20Abi, wallet);
        const estimatedGas = await wphrsContract.deposit.estimateGas({ value: amountWei });
        const txOptions = await getTransactionOptions(wallet.provider, estimatedGas);

        await executeTransaction(operation, () => wphrsContract.deposit({ value: amountWei, ...txOptions }), operation, wallet, jwt, proxy);
    } catch (error) { logger.error(`   ❌ Error in ${operation}: ${error.message}`); }
};

const actionPerformSwap = async (wallet, index, jwt, proxy) => {
    const operation = `Swap #${index + 1}`;
    logger.step(`🔀 Preparing ${operation}...`);
    try {
        const pair = getRandomElement(swapPairOptions);
        if (!pair) { logger.warn("   ⚠️ No swap pairs configured."); return; }

        logger.info(`      Swapping ${pair.amount} ${pair.from} -> ${pair.to}`);

        if (!await checkBalanceAndApprove(wallet, pair.from, pair.amount, multicallContractAddress)) return;

        const multicall = new ethers.Contract(multicallContractAddress, multicallAbi, wallet);
        const scaledAmount = ethers.parseUnits(pair.amount.toString(), tokenDecimals[pair.from]);
        const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'address', 'uint256', 'address', 'uint256', 'uint256', 'uint256'],
            [tokens[pair.from], tokens[pair.to], 500, wallet.address, scaledAmount, 0, 0]
        );
        const multicallPayload = [ethers.concat(['0x04e45aaf', encodedData])];
        const deadline = Math.floor(Date.now() / 1000) + 300;

        const estimatedGas = await multicall.multicall.estimateGas(deadline, multicallPayload);
        const txOptions = await getTransactionOptions(wallet.provider, estimatedGas);

        await executeTransaction(operation, () => multicall.multicall(deadline, multicallPayload, txOptions), operation, wallet, jwt, proxy);
    } catch (error) { logger.error(`   ❌ Error in ${operation}: ${error.message}`); }
};

const actionAddLiquidity = async (wallet, index, jwt, proxy) => {
    const operation = `Add Liquidity #${index + 1}`;
    logger.step(`💧 Preparing ${operation}...`);
    try {
        const pair = getRandomElement(lpPairOptions);
        if (!pair) { logger.warn("   ⚠️ No LP pairs configured."); return; }

        logger.info(`      Adding LP for ${pair.token0}/${pair.token1} (${pair.amount0} / ${pair.amount1})`);

        if (!await checkBalanceAndApprove(wallet, pair.token0, pair.amount0, tokens.POSITION_MANAGER)) return;
        if (!await checkBalanceAndApprove(wallet, pair.token1, pair.amount1, tokens.POSITION_MANAGER)) return;

        const positionManager = new ethers.Contract(tokens.POSITION_MANAGER, positionManagerAbi, wallet);
        const mintParams = {
            token0: tokens[pair.token0], token1: tokens[pair.token1],
            fee: pair.fee, tickLower: -887220, tickUpper: 887220,
            amount0Desired: ethers.parseUnits(pair.amount0.toString(), tokenDecimals[pair.token0]),
            amount1Desired: ethers.parseUnits(pair.amount1.toString(), tokenDecimals[pair.token1]),
            amount0Min: 0, amount1Min: 0,
            recipient: wallet.address, deadline: Math.floor(Date.now() / 1000) + 600,
        };

        const estimatedGas = await positionManager.mint.estimateGas(mintParams);
        const txOptions = await getTransactionOptions(wallet.provider, estimatedGas);

        await executeTransaction(operation, () => positionManager.mint(mintParams, txOptions), operation, wallet, jwt, proxy);
    } catch (error) { logger.error(`   ❌ Error in ${operation}: ${error.message}`); }
};

// =============================================================================
// 💰 Fungsi Baru: Swap Kembali ke WPHRS
// =============================================================================
const actionSwapBackToWPHRS = async (wallet, jwt, proxy) => {
    logger.step(`💰 Preparing Swap Back to WPHRS...`);

    const stablecoins = ['USDT', 'USDC'];

    for (const stable of stablecoins) {
        try {
            const tokenAddress = tokens[stable];
            const tokenDecs = tokenDecimals[stable];
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
            const balance = await tokenContract.balanceOf(wallet.address);
            const minSwapAmount = ethers.parseUnits(MIN_STABLE_SWAP.toString(), tokenDecs);

            if (balance > minSwapAmount) {
                const balanceFormatted = ethers.formatUnits(balance, tokenDecs);
                const operation = `Swap ${balanceFormatted} ${stable} -> WPHRS`;
                logger.info(`      Found ${balanceFormatted} ${stable}. Attempting to swap back...`);

                // Approve full balance
                if (!await checkBalanceAndApproveFull(wallet, stable, balance, multicallContractAddress)) {
                    logger.warn(`      ⚠️ Skipping swap back for ${stable} due to approval failure.`);
                    continue; // Lanjut ke stablecoin berikutnya
                }

                const multicall = new ethers.Contract(multicallContractAddress, multicallAbi, wallet);
                const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'address', 'uint256', 'address', 'uint256', 'uint256', 'uint256'],
                    [tokenAddress, tokens.WPHRS, 500, wallet.address, balance, 0, 0] // Swap full balance
                );
                const multicallPayload = [ethers.concat(['0x04e45aaf', encodedData])];
                const deadline = Math.floor(Date.now() / 1000) + 300;

                const estimatedGas = await multicall.multicall.estimateGas(deadline, multicallPayload);
                const txOptions = await getTransactionOptions(wallet.provider, estimatedGas);

                await executeTransaction(operation, () => multicall.multicall(deadline, multicallPayload, txOptions), operation, wallet, jwt, proxy);
                await delay(5000); // Jeda kecil antar swap back jika ada 2
            } else {
                 logger.info(`      ${stable} balance is too low, skipping swap back.`);
            }
        } catch (error) {
            logger.error(`   ❌ Error during swap back for ${stable}: ${error.message}`);
        }
    }
};


// =============================================================================
// 🎬 Fungsi Utama & Alur Eksekusi
// =============================================================================

const getUserConfig = () => {
    const getNumericEnv = (key, defaultValue, promptMsg) => {
        let value = process.env[key];
        if (!value) {
            value = prompt(`❓ ${promptMsg} (default: ${defaultValue}): `);
        }
        const num = parseInt(value, 10);
        return isNaN(num) || num < 0 ? defaultValue : num;
    };

    return {
        delayBetweenCyclesMinutes: getNumericEnv('DELAY_MINUTES', 60, 'Enter delay between cycles in minutes'),
        numTransfers: getNumericEnv('NUM_TRANSFERS', 2, 'Number of PHRS transfers per wallet'),
        numWraps: getNumericEnv('NUM_WRAPS', 1, 'Number of PHRS wraps per wallet'),
        numSwaps: getNumericEnv('NUM_SWAPS', 2, 'Number of token swaps per wallet'),
        numLPs: getNumericEnv('NUM_LPS', 1, 'Number of liquidity adds per wallet'),
        delayBetweenActionsMs: getNumericEnv('ACTION_DELAY_MS', 15000, 'Delay between actions in milliseconds (e.g., 15000 for 15s)'),
        delayBetweenWalletsMs: getNumericEnv('WALLET_DELAY_MS', 30000, 'Delay between wallets in milliseconds (e.g., 30000 for 30s)'),
    };
};

const processSingleWallet = async (privateKey, proxy, config) => {
    let provider;
    try {
        provider = setupProvider(proxy);
    } catch (e) {
        logger.error(`❌ Failed to setup provider: ${e.message}. Skipping wallet.`);
        return;
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    logger.wallet(`Processing Wallet: ${wallet.address}`);

    let jwt = null;
    try {
        logger.separator("API INTERACTIONS");
        jwt = await apiLogin(wallet, proxy);
        if (jwt) {
            await apiGetUserInfo(wallet.address, jwt, proxy);
            await apiClaimFaucet(wallet.address, jwt, proxy);
            await apiDailyCheckIn(wallet.address, jwt, proxy);
        } else {
            logger.error(`   ❌ Login failed. API features will be limited.`);
        }

        logger.separator("BLOCKCHAIN ACTIONS");
        for (let i = 0; i < config.numTransfers; i++) { await actionTransferPHRS(wallet, i, jwt, proxy); await delay(config.delayBetweenActionsMs); }
        for (let i = 0; i < config.numWraps; i++) { await actionWrapPHRS(wallet, i, jwt, proxy); await delay(config.delayBetweenActionsMs); }
        for (let i = 0; i < config.numSwaps; i++) { await actionPerformSwap(wallet, i, jwt, proxy); await delay(config.delayBetweenActionsMs); }
        for (let i = 0; i < config.numLPs; i++) { await actionAddLiquidity(wallet, i, jwt, proxy); await delay(config.delayBetweenActionsMs); }

        logger.separator("SWAP BACK TO WPHRS");
        await actionSwapBackToWPHRS(wallet, jwt, proxy); // Panggil fungsi baru di sini

        logger.success(`✅ All actions completed for ${wallet.address}`);

    } catch (error) {
        logger.error(`🚨 An critical error occurred while processing ${wallet.address}: ${error.message}`);
        console.error(error);
    } finally {
        if (provider && typeof provider.destroy === 'function') {
            provider.destroy();
        }
    }
};

const main = async () => {
    logger.banner();
    const config = getUserConfig();

    logger.info(`⚙️ Configuration:`);
    console.log(`   - Transfers: ${config.numTransfers}, Wraps: ${config.numWraps}, Swaps: ${config.numSwaps}, LPs: ${config.numLPs}`);
    console.log(`   - Action Delay: ${config.delayBetweenActionsMs / 1000}s, Wallet Delay: ${config.delayBetweenWalletsMs / 1000}s`);
    logger.separator();

    const privateKeys = loadFileLines('privateKeys.txt', 'Private Keys');
    const proxies = loadFileLines('proxies.txt', 'Proxies');

    if (!privateKeys.length) { logger.error('❌ No private keys found. Exiting.'); return; }

    let proxyIndex = 0;

    logger.info('🚀 Starting single cycle execution...');
    for (const [index, pk] of privateKeys.entries()) {
        logger.separator(`### WALLET ${index + 1}/${privateKeys.length} ###`);
        const currentProxy = proxies.length > 0 ? proxies[proxyIndex % proxies.length] : null;
        if (proxies.length > 0) proxyIndex++;

        await processSingleWallet(pk, currentProxy, config);

        if (index < privateKeys.length - 1) {
            logger.info(`⏳ Waiting ${config.delayBetweenWalletsMs / 1000}s before next wallet...`);
            await delay(config.delayBetweenWalletsMs);
        }
    }
    logger.success('🏁 All wallets processed!');
    logger.info('✅ Script finished. Exiting.');

    process.exit(0);
};

main().catch(error => {
    logger.error(`💥 Main bot function crashed: ${error.message}`);
    console.error(error);
    process.exit(1);
});
