require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const randomUseragent = require('random-useragent');
const axios = require('axios');
const prompt = require('prompt-sync')({ sigint: true });

// --- Konfigurasi Warna & Logger ---
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  wallet: (msg) => console.log(`${colors.yellow}[➤] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
  user: (msg) => console.log(`\n${colors.white}[➤] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log('-------------------------------------------------');
    console.log(' Pharos Testnet Auto Bot - Airdrop Insiders (v3)');
    console.log('-------------------------------------------------');
    console.log(`${colors.reset}\n`);
  },
};

// --- Konfigurasi Jaringan & Token ---
const networkConfig = {
  name: 'Pharos Testnet',
  chainId: 688688,
  rpcUrl: 'https://testnet.dplabs-internal.com',
  currencySymbol: 'PHRS',
};

const tokens = {
  USDC: '0xad902cf99c2de2f1ba5ec4d642fd7e49cae9ee37',
  WPHRS: '0x76aaada469d23216be5f7c596fa25f282ff9b364',
  USDT: '0xed59de2d7ad9c043442e381231ee3646fc3c2939',
  POSITION_MANAGER: '0xF8a1D4FF0f9b9Af7CE58E1fc1833688F3BFd6115',
};

const contractAddress = '0x1a4de519154ae51200b0ad7c90f7fac75547888a'; // Alamat kontrak untuk swap

const tokenDecimals = {
  WPHRS: 18,
  USDC: 6,
  USDT: 6,
};

// --- ABI ---
const contractAbi = [
  {
    inputs: [
      { internalType: 'uint256', name: 'collectionAndSelfcalls', type: 'uint256' },
      { internalType: 'bytes[]', name: 'data', type: 'bytes[]' },
    ],
    name: 'multicall',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) public returns (bool)',
  'function decimals() view returns (uint8)',
  'function deposit() public payable',
  'function withdraw(uint256 wad) public',
];

const positionManagerAbi = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'token0', type: 'address' },
          { internalType: 'address', name: 'token1', type: 'address' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          { internalType: 'int24', name: 'tickLower', type: 'int24' },
          { internalType: 'int24', name: 'tickUpper', type: 'int24' },
          { internalType: 'uint256', name: 'amount0Desired', type: 'uint256' },
          { internalType: 'uint256', name: 'amount1Desired', type: 'uint256' },
          { internalType: 'uint256', name: 'amount0Min', type: 'uint256' },
          { internalType: 'uint256', name: 'amount1Min', type: 'uint256' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'deadline', type: 'uint256' },
        ],
        internalType: 'struct INonfungiblePositionManager.MintParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'mint',
    outputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
      { internalType: 'uint256', name: 'amount0', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
];

// --- Opsi ---
// PENTING: Verifikasi nilai 'fee' ini dengan pool yang ada di Pharos Testnet!
const pairOptions = [
  { id: 1, from: 'WPHRS', to: 'USDC', amount: 0.0001, fee: 3000 }, // Misal 0.3%
  { id: 2, from: 'WPHRS', to: 'USDT', amount: 0.0001, fee: 3000 }, // Misal 0.3%
  { id: 3, from: 'USDC', to: 'WPHRS', amount: 0.0001, fee: 3000 }, // Misal 0.3%
  { id: 4, from: 'USDT', to: 'WPHRS', amount: 0.0001, fee: 3000 }, // Misal 0.3%
  { id: 5, from: 'USDC', to: 'USDT', amount: 0.0001, fee: 500 },  // Misal 0.05% untuk stable/stable
  { id: 6, from: 'USDT', to: 'USDC', amount: 0.0001, fee: 500 },  // Misal 0.05% untuk stable/stable
];

const lpOptions = [
  { id: 1, token0: 'WPHRS', token1: 'USDC', amount0: 0.0001, amount1: 0.0001, fee: 3000 },
  { id: 2, token0: 'WPHRS', token1: 'USDT', amount0: 0.0001, amount1: 0.0001, fee: 3000 },
];

// --- Fungsi Helper ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function tryWithRetry(action, actionName = 'Action', retries = 3, delayMs = 5000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await action();
        } catch (error) {
            const errorMessage = error.message.toLowerCase();
            const errorCode = error.error?.code || error.code;
            const isRpcError = errorMessage.includes('-32008') || errorCode === 'SERVER_ERROR' || errorCode === -32008 || errorMessage.includes('unable to complete the request') || errorMessage.includes('timeout') || errorMessage.includes('server response 500');

            if (isRpcError && i < retries - 1) { // Hanya retry jika bukan percobaan terakhir
                logger.warn(`[Retry ${i + 1}/${retries}] ${actionName} failed with RPC/Server/Timeout error. Retrying in ${delayMs / 1000}s...`);
                await sleep(delayMs);
            } else {
                if (isRpcError) { // Jika error RPC pada percobaan terakhir
                    logger.error(`${actionName} failed after ${retries} retries with RPC/Server/Timeout error: ${error.message}`);
                } else { // Jika error non-RPC
                    logger.error(`${actionName} failed with non-retriable error: ${error.message}`);
                }
                throw error;
            }
        }
    }
    // Baris ini seharusnya tidak tercapai jika logic di atas benar, tapi sebagai fallback:
    logger.error(`${actionName} ultimately failed after ${retries} retries.`);
    throw new Error(`${actionName} ultimately failed after ${retries} retries.`);
}


async function getTxOptions(provider, estimatedGas) {
    try {
        const feeData = await provider.getFeeData();
        const options = {
            gasLimit: Math.ceil(Number(estimatedGas) * 1.5),
        };
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            options.maxFeePerGas = feeData.maxFeePerGas;
            options.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        } else if (feeData.gasPrice) {
            options.gasPrice = feeData.gasPrice;
        }
        return options;
    } catch (error) {
        logger.warn(`Failed to get fee data, using default gas limit multiplier: ${error.message}`);
        return {
            gasLimit: Math.ceil(Number(estimatedGas) * 1.5),
        };
    }
}

const loadProxies = () => {
  try {
    const proxies = fs.readFileSync('proxies.txt', 'utf8').split('\n').map(line => line.trim()).filter(line => line);
    if (proxies.length > 0) logger.info(`Loaded ${proxies.length} proxies.`);
    else logger.warn('proxies.txt is empty or not found. Running in direct mode.');
    return proxies;
  } catch (error) {
    logger.warn('No proxies.txt found or failed to load, switching to direct mode.');
    return [];
  }
};

const getRandomProxy = (proxies) => proxies[Math.floor(Math.random() * proxies.length)];

const setupProvider = (proxy = null) => {
  if (proxy) {
    logger.info(`Using proxy: ${proxy}`);
    const agent = new HttpsProxyAgent(proxy);
    return new ethers.JsonRpcProvider(networkConfig.rpcUrl, undefined, { // chainId/name otomatis dari RPC
      batchMaxCount: 1, // Non-batching bisa lebih stabil dengan beberapa RPC
      staticNetwork: ethers.Network.from(networkConfig.chainId), // Eksplisit set network
      // fetchOptions: { agent }, // Ini mungkin tidak berfungsi untuk RPC di semua versi ethers
    });
  } else {
    logger.info('Using direct mode (no proxy)');
    return new ethers.JsonRpcProvider(networkConfig.rpcUrl, undefined, {
      batchMaxCount: 1,
      staticNetwork: ethers.Network.from(networkConfig.chainId),
    });
  }
};

const checkBalanceAndApproval = async (wallet, tokenAddress, amount, decimals, spender) => {
    const tokenSymbol = Object.keys(tokens).find(key => tokens[key].toLowerCase() === tokenAddress.toLowerCase()) || 'Token';
    try {
        const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
        const balance = await tokenContract.balanceOf(wallet.address);
        const required = ethers.parseUnits(amount.toString(), decimals);

        if (balance < required) {
            logger.warn(`Skipping approval for ${tokenSymbol}: Insufficient balance (${ethers.formatUnits(balance, decimals)} < ${amount}).`);
            return false;
        }

        const allowance = await tokenContract.allowance(wallet.address, spender);
        if (allowance < required) {
            logger.step(`Approving ${amount} ${tokenSymbol} for spender ${spender.substring(0,6)}...`);
            const action = async () => {
                const estimatedGas = await tokenContract.approve.estimateGas(spender, ethers.MaxUint256);
                const txOptions = await getTxOptions(wallet.provider, estimatedGas);
                const approveTx = await tokenContract.approve(spender, ethers.MaxUint256, txOptions);
                const receipt = await approveTx.wait();
                if (receipt.status === 0) {
                    throw new Error(`Approval transaction for ${tokenSymbol} failed on-chain. Hash: ${receipt.hash}`);
                }
            };
            await tryWithRetry(action, `Approve ${tokenSymbol}`);
            logger.success(`${tokenSymbol} approval completed.`);
        }
        return true;
    } catch (error) {
        logger.error(`Balance/approval check for ${tokenSymbol} failed: ${error.message}`);
        return false;
    }
};

const getUserInfo = async (wallet, proxy = null, jwt) => {
  try {
    logger.user(`Fetching user info for wallet: ${wallet.address.substring(0,10)}...`);
    const profileUrl = `https://api.pharosnetwork.xyz/user/profile?address=${wallet.address}`;
    const headers = { /* ... headers sama ... */ };
    const axiosConfig = { method: 'get', url: profileUrl, headers, httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null, timeout: 20000 };
    const action = async () => { logger.loading('Fetching user profile...'); return await axios(axiosConfig); };
    const response = await tryWithRetry(action, 'Fetch User Info');
    const data = response.data;
    if (data.code !== 0 || !data.data.user_info) {
      logger.error(`Failed to fetch user info: ${data.msg || 'Unknown API error'} (Code: ${data.code})`);
      return;
    }
    const userInfo = data.data.user_info;
    logger.info(`User ID: ${userInfo.ID}, Task Points: ${userInfo.TaskPoints}, Total Points: ${userInfo.TotalPoints}`);
  } catch (error) {
    logger.error(`Failed to fetch user info (outer): ${error.message}`);
  }
};

const verifyTask = async (wallet, proxy, jwt, txHash) => {
    if (!jwt) {
        logger.warn(`Skipping task verification for ${txHash.substring(0,10)}... - No JWT token.`);
        return false;
    }
  try {
    logger.step(`Verifying task ID 103 for tx: ${txHash.substring(0,10)}...`);
    const verifyUrl = `https://api.pharosnetwork.xyz/task/verify?address=${wallet.address}&task_id=103&tx_hash=${txHash}`;
    const headers = { /* ... headers sama, pastikan jwt ada di auth ... */ authorization: `Bearer ${jwt}`, /* ... sisanya ... */ };
    const axiosConfig = { method: 'post', url: verifyUrl, headers, httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null, timeout: 20000 };
    const action = async () => { logger.loading('Sending task verification request...'); return await axios(axiosConfig); };
    const response = await tryWithRetry(action, `Verify Task ${txHash.substring(0,10)}`);
    const data = response.data;
    if (data.code === 0 && data.data.verified) {
      logger.success(`Task ID 103 verified successfully for ${txHash.substring(0,10)}...`);
      return true;
    } else {
      logger.warn(`Task verification failed for ${txHash.substring(0,10)}... API Msg: ${data.msg || 'Unknown API error'} (Code: ${data.code}, Verified: ${data.data?.verified})`);
      return false;
    }
  } catch (error) {
    logger.error(`Task verification for ${txHash.substring(0,10)}... failed (outer): ${error.message}`);
    return false;
  }
};

// Menggunakan fee dari pairOptions
const getMulticallData = (pair, amount, walletAddress, fee) => {
  try {
    const decimals = tokenDecimals[pair.from];
    const scaledAmount = ethers.parseUnits(amount.toString(), decimals);
    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint24', 'address', 'uint256', 'uint256', 'uint256'],
      [tokens[pair.from], tokens[pair.to], fee, walletAddress, scaledAmount, 0, 0]
    );
    return [ethers.concat(['0x04e45aaf', data])]; // Selector untuk exactInputSingle
  } catch (error) {
    logger.error(`Failed to generate multicall data for ${pair.from}->${pair.to}: ${error.message}`);
    return [];
  }
};

// --- Fungsi Aksi Utama ---
const performSwap = async (wallet, provider, index, jwt, proxy) => {
    const pair = pairOptions[Math.floor(Math.random() * pairOptions.length)];
    const actionName = `Swap ${index + 1}: ${pair.amount} ${pair.from} -> ${pair.to} (Fee: ${pair.fee/10000}%)`;
    logger.step(`Preparing ${actionName}`);
    try {
        if (!(await checkBalanceAndApproval(wallet, tokens[pair.from], pair.amount, tokenDecimals[pair.from], contractAddress))) {
            return;
        }
        const contract = new ethers.Contract(contractAddress, contractAbi, wallet);
        const multicallDataArray = getMulticallData(pair, pair.amount, wallet.address, pair.fee);
        if (!multicallDataArray || multicallDataArray.length === 0) {
            logger.error(`Invalid multicall data for ${actionName}`);
            return;
        }
        const collectionAndSelfcalls = 0; // Sesuai ABI multicall(uint256, bytes[])

        const action = async () => {
            let estimatedGas;
            try {
                estimatedGas = await contract.multicall.estimateGas(collectionAndSelfcalls, multicallDataArray, { from: wallet.address });
            } catch (gasError) {
                logger.error(`Gas estimation failed for ${actionName}: ${gasError.message}`);
                if (gasError.data) logger.error(`Gas estimation error data: ${gasError.data}`);
                throw gasError;
            }
            const txOptions = await getTxOptions(provider, estimatedGas);
            const tx = await contract.multicall(collectionAndSelfcalls, multicallDataArray, txOptions);
            logger.loading(`${actionName} tx sent (${tx.hash.substring(0,10)}...), waiting for confirmation...`);
            const receipt = await tx.wait();
            if (receipt.status === 0) {
                throw new Error(`${actionName} transaction failed on-chain. Hash: ${receipt.hash}`);
            }
            logger.success(`${actionName} completed: ${receipt.hash.substring(0,10)}...`);
            logger.step(`Explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash}`);
            await verifyTask(wallet, proxy, jwt, receipt.hash);
        };
        await tryWithRetry(action, actionName);
    } catch (error) {
        logger.error(`${actionName} failed (Outer Catch): ${error.message}`);
    }
};

const transferPHRS = async (wallet, provider, index, jwt, proxy) => {
    const amount = 0.000001;
    const randomToWallet = ethers.Wallet.createRandom();
    const toAddress = randomToWallet.address;
    const actionName = `PHRS Transfer ${index + 1}: ${amount} to ${toAddress.substring(0,10)}...`;
    logger.step(`Preparing ${actionName}`);
    try {
        const balance = await provider.getBalance(wallet.address);
        const requiredValue = ethers.parseEther(amount.toString());
        // Perkirakan biaya gas sederhana untuk transfer ETH
        const estimatedGasCost = ethers.parseUnits('0.0005', 'ether'); // Estimasi kasar, bisa disesuaikan

        if (balance < (requiredValue + estimatedGasCost)) {
            logger.warn(`Skipping ${actionName}: Insufficient PHRS balance (${ethers.formatEther(balance)}) for value and estimated gas.`);
            return;
        }
        const action = async () => {
            const txRequest = { to: toAddress, value: requiredValue };
            const estimatedGas = await wallet.estimateGas(txRequest);
            const txOptions = await getTxOptions(provider, estimatedGas);
            const tx = await wallet.sendTransaction({ ...txRequest, ...txOptions });
            logger.loading(`${actionName} tx sent (${tx.hash.substring(0,10)}...), waiting for confirmation...`);
            const receipt = await tx.wait();
            if (receipt.status === 0) {
                throw new Error(`${actionName} transaction failed on-chain. Hash: ${receipt.hash}`);
            }
            logger.success(`${actionName} completed: ${receipt.hash.substring(0,10)}...`);
            logger.step(`Explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash}`);
            await verifyTask(wallet, proxy, jwt, receipt.hash);
        };
        await tryWithRetry(action, actionName);
    } catch (error) {
        logger.error(`${actionName} failed (Outer Catch): ${error.message}`);
    }
};

const wrapPHRS = async (wallet, provider, index, jwt, proxy) => {
    const minAmount = 0.001; const maxAmount = 0.005;
    const amount = parseFloat((minAmount + Math.random() * (maxAmount - minAmount)).toFixed(6));
    const amountWei = ethers.parseEther(amount.toString());
    const actionName = `Wrap PHRS ${index + 1}: ${amount} PHRS to WPHRS`;
    logger.step(`Preparing ${actionName}`);
    try {
        const balance = await provider.getBalance(wallet.address);
        const estimatedGasCost = ethers.parseUnits('0.001', 'ether'); // Estimasi kasar
        if (balance < (amountWei + estimatedGasCost)) {
            logger.warn(`Skipping ${actionName}: Insufficient PHRS balance (${ethers.formatEther(balance)}) for wrap and gas.`);
            return;
        }
        const wphrsContract = new ethers.Contract(tokens.WPHRS, erc20Abi, wallet);
        const action = async () => {
            const estimatedGas = await wphrsContract.deposit.estimateGas({ value: amountWei });
            const txOptions = await getTxOptions(provider, estimatedGas);
            const tx = await wphrsContract.deposit({ value: amountWei, ...txOptions });
            logger.loading(`${actionName} tx sent (${tx.hash.substring(0,10)}...), waiting for confirmation...`);
            const receipt = await tx.wait();
            if (receipt.status === 0) {
                throw new Error(`${actionName} transaction failed on-chain. Hash: ${receipt.hash}`);
            }
            logger.success(`${actionName} completed: ${receipt.hash.substring(0,10)}...`);
            logger.step(`Explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash}`);
            await verifyTask(wallet, proxy, jwt, receipt.hash);
        };
        await tryWithRetry(action, actionName);
    } catch (error) {
        logger.error(`${actionName} failed (Outer Catch): ${error.message}`);
    }
};

const claimFaucet = async (wallet, proxy = null) => {
    const actionName = `Faucet Claim for ${wallet.address.substring(0,10)}...`;
    logger.step(`Attempting ${actionName}`);
    try {
        const message = "pharos";
        const signature = await wallet.signMessage(message);
        const loginUrl = `https://api.pharosnetwork.xyz/user/login?address=${wallet.address}&signature=${signature}&invite_code=S6NGMzXSCDBxhnwo`;
        const headers = { accept: "application/json, text/plain, */*", authorization: "Bearer null", /* ... sisanya sama ... */ };
        const axiosConfigLogin = { method: 'post', url: loginUrl, headers, httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null, timeout: 30000 };
        
        let loginData;
        try {
            logger.loading('Sending login request for faucet...');
            const loginResponse = await axios(axiosConfigLogin);
            loginData = loginResponse.data;
        } catch (axiosError) {
            logger.error(`Login for faucet failed: ${axiosError.message} ${axiosError.response ? JSON.stringify(axiosError.response.data):''}`);
            return false;
        }

        if (loginData.code !== 0 || !loginData.data.jwt) {
            logger.error(`Login for faucet API error: ${loginData.msg || 'Unknown error'} (Code: ${loginData.code})`);
            return false;
        }
        const jwt = loginData.data.jwt;
        logger.success(`Login for faucet successful.`);

        const statusUrl = `https://api.pharosnetwork.xyz/faucet/status?address=${wallet.address}`;
        const statusHeaders = { ...headers, authorization: `Bearer ${jwt}` };
        const axiosConfigStatus = { method: 'get', url: statusUrl, headers: statusHeaders, httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null, timeout: 30000 };
        
        let statusData;
        try {
            logger.loading('Checking faucet status...');
            const statusResponse = await axios(axiosConfigStatus);
            statusData = statusResponse.data;
        } catch (axiosError) {
            logger.error(`Faucet status check failed: ${axiosError.message} ${axiosError.response ? JSON.stringify(axiosError.response.data):''}`);
            return false;
        }

        if (statusData.code !== 0 || !statusData.data) {
            logger.error(`Faucet status API error: ${statusData.msg || 'Unknown error'} (Code: ${statusData.code})`);
            return false;
        }
        if (!statusData.data.is_able_to_faucet) {
            const ts = statusData.data.avaliable_timestamp;
            const nextTime = ts ? new Date(ts * 1000).toLocaleTimeString('id-ID') : 'N/A';
            logger.warn(`Faucet not available. Next claim at: ${nextTime}`);
            return false;
        }

        const claimAction = async () => {
            const claimUrl = `https://api.pharosnetwork.xyz/faucet/daily?address=${wallet.address}`;
            const axiosConfigClaim = { method: 'post', url: claimUrl, headers: statusHeaders, httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null, timeout: 30000 };
            logger.loading('Claiming faucet...');
            const claimResponse = await axios(axiosConfigClaim);
            const claimData = claimResponse.data;
            if (claimData.code === 0) {
                logger.success(`Faucet claimed successfully!`);
                return true;
            } else {
                throw new Error(`Faucet claim API error: ${claimData.msg || 'Unknown error'} (Code: ${claimData.code})`);
            }
        };
        return await tryWithRetry(claimAction, actionName, 2, 3000); // Retry claim 2x
    } catch (error) {
        logger.error(`${actionName} failed (Outer Catch): ${error.message}`);
        return false;
    }
};

const performCheckIn = async (wallet, proxy = null) => {
    const actionName = `Daily CheckIn for ${wallet.address.substring(0,10)}...`;
    logger.step(`Attempting ${actionName}`);
    try {
        const checkInInnerAction = async () => { // Renamed to avoid conflict
            const message = "pharos";
            const signature = await wallet.signMessage(message);
            const loginUrl = `https://api.pharosnetwork.xyz/user/login?address=${wallet.address}&signature=${signature}&invite_code=S6NGMzXSCDBxhnwo`;
            const headers = { accept: "application/json, text/plain, */*", authorization: "Bearer null", /* ... sisanya sama ... */};
            const axiosConfigLogin = { method: 'post', url: loginUrl, headers, httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null, timeout: 30000 };
            
            let loginData;
            try {
                logger.loading('Sending login request for check-in...');
                const loginResponse = await axios(axiosConfigLogin);
                loginData = loginResponse.data;
            } catch (axiosError) {
                throw new Error(`Login for check-in failed: ${axiosError.message} ${axiosError.response ? JSON.stringify(axiosError.response.data):''}`);
            }

            if (loginData.code !== 0 || !loginData.data.jwt) {
                throw new Error(`Login for check-in API error: ${loginData.msg || 'Unknown error'} (Code: ${loginData.code})`);
            }
            const jwt = loginData.data.jwt;
            logger.success(`Login for check-in successful.`);

            const checkInUrl = `https://api.pharosnetwork.xyz/sign/in?address=${wallet.address}`;
            const checkInHeaders = { ...headers, authorization: `Bearer ${jwt}` };
            const axiosConfigCheckIn = { method: 'post', url: checkInUrl, headers: checkInHeaders, httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null, timeout: 30000 };
            
            let checkInData;
            try {
                logger.loading('Sending check-in request...');
                const checkInResponse = await axios(axiosConfigCheckIn);
                checkInData = checkInResponse.data;
            } catch (axiosError) {
                 throw new Error(`Check-in request failed: ${axiosError.message} ${axiosError.response ? JSON.stringify(axiosError.response.data):''}`);
            }
            
            if (checkInData.code === 0) {
                logger.success(`Check-in successful!`);
            } else if (checkInData.code === 20002) { // "You have signed in today"
                logger.warn(`Already checked in today.`);
            } else {
                 throw new Error(`Check-in API error: ${checkInData.msg || 'Unknown error'} (Code: ${checkInData.code})`);
            }
            return jwt; // Return JWT whether new check-in or already checked-in
        };
        return await tryWithRetry(checkInInnerAction, actionName, 2, 3000); // Retry check-in process 2x
    } catch (error) {
        logger.error(`${actionName} failed (Outer Catch): ${error.message}`);
        return null;
    }
};

const addLiquidity = async (wallet, provider, index, jwt, proxy) => {
    const pair = lpOptions[Math.floor(Math.random() * lpOptions.length)];
    const actionName = `Add LP ${index + 1}: ${pair.amount0} ${pair.token0} / ${pair.amount1} ${pair.token1} (Fee: ${pair.fee/10000}%)`;
    logger.step(`Preparing ${actionName}`);
    try {
        if (!(await checkBalanceAndApproval(wallet, tokens[pair.token0], pair.amount0, tokenDecimals[pair.token0], tokens.POSITION_MANAGER))) return;
        if (!(await checkBalanceAndApproval(wallet, tokens[pair.token1], pair.amount1, tokenDecimals[pair.token1], tokens.POSITION_MANAGER))) return;

        const amount0Wei = ethers.parseUnits(pair.amount0.toString(), tokenDecimals[pair.token0]);
        const amount1Wei = ethers.parseUnits(pair.amount1.toString(), tokenDecimals[pair.token1]);
        const positionManager = new ethers.Contract(tokens.POSITION_MANAGER, positionManagerAbi, wallet);
        const deadline = Math.floor(Date.now() / 1000) + 600;
        const tickLower = -60000; const tickUpper = 60000; // Wide range for testnet

        const mintParams = {
            token0: tokens[pair.token0], token1: tokens[pair.token1], fee: pair.fee,
            tickLower, tickUpper, amount0Desired: amount0Wei, amount1Desired: amount1Wei,
            amount0Min: 0, amount1Min: 0, recipient: wallet.address, deadline,
        };
        const action = async () => {
            const estimatedGas = await positionManager.mint.estimateGas(mintParams, { from: wallet.address });
            const txOptions = await getTxOptions(provider, estimatedGas);
            const tx = await positionManager.mint(mintParams, txOptions);
            logger.loading(`${actionName} tx sent (${tx.hash.substring(0,10)}...), waiting for confirmation...`);
            const receipt = await tx.wait();
            if (receipt.status === 0) {
                throw new Error(`${actionName} transaction failed on-chain. Hash: ${receipt.hash}`);
            }
            logger.success(`${actionName} completed: ${receipt.hash.substring(0,10)}...`);
            logger.step(`Explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash}`);
            await verifyTask(wallet, proxy, jwt, receipt.hash);
        };
        await tryWithRetry(action, actionName);
    } catch (error) {
        logger.error(`${actionName} failed (Outer Catch): ${error.message}`);
         if (error.data) logger.error(`Error data: ${error.data}`); // Log additional error data if present
    }
};

const getUserDelay = () => { /* ... sama ... */ };
const countdown = async (minutes) => { /* ... sama ... */ };

// --- Fungsi Main ---
const main = async () => {
    logger.banner();
    const delayMinutes = getUserDelay();
    logger.info(`Delay between cycles set to ${delayMinutes} minutes.`);

    const proxies = loadProxies();
    const privateKeys = [process.env.PRIVATE_KEY_1, process.env.PRIVATE_KEY_2].filter(pk => pk && pk.trim() !== '');
    if (!privateKeys.length) {
        logger.error('No private keys found in .env. Please set PRIVATE_KEY_1, etc.');
        return;
    }
    logger.info(`Loaded ${privateKeys.length} private key(s).`);

    const numTransfers = parseInt(process.env.NUM_TRANSFERS) || 2;
    const numWraps = parseInt(process.env.NUM_WRAPS) || 2;
    const numSwaps = parseInt(process.env.NUM_SWAPS) || 2;
    const numLPs = parseInt(process.env.NUM_LPS) || 1;
    logger.info(`Actions/wallet: T=${numTransfers}, W=${numWraps}, S=${numSwaps}, LP=${numLPs}`);

    const delayActionsMin = parseInt(process.env.DELAY_ACTIONS_MIN_MS) || 10000; // 10s
    const delayActionsMax = parseInt(process.env.DELAY_ACTIONS_MAX_MS) || 20000; // 20s
    const delayWallets = parseInt(process.env.DELAY_WALLETS_MS) || 30000; // 30s

    while (true) {
        for (let pkIdx = 0; pkIdx < privateKeys.length; pkIdx++) {
            const privateKey = privateKeys[pkIdx];
            const currentProxy = proxies.length ? getRandomProxy(proxies) : null;
            const provider = setupProvider(currentProxy);
            const wallet = new ethers.Wallet(privateKey, provider);
            logger.wallet(`[Wallet ${pkIdx + 1}/${privateKeys.length}] Using: ${wallet.address.substring(0,10)}...`);

            try {
                await claimFaucet(wallet, currentProxy);
                await sleep(Math.random() * (delayActionsMax - delayActionsMin) + delayActionsMin);

                const jwt = await performCheckIn(wallet, currentProxy);
                await sleep(Math.random() * (delayActionsMax - delayActionsMin) + delayActionsMin);

                if (jwt) {
                    await getUserInfo(wallet, currentProxy, jwt);
                    await sleep(Math.random() * (delayActionsMax - delayActionsMin) + delayActionsMin);
                } else {
                    logger.warn('Skipping further actions requiring JWT for this wallet.');
                }

                if (numTransfers > 0 && jwt) { // JWT might be needed for verifyTask
                    console.log(`\n${colors.cyan}--- TRANSFERS ---${colors.reset}`);
                    for (let i = 0; i < numTransfers; i++) await transferPHRS(wallet, provider, i, jwt, currentProxy), await sleep(Math.random() * (delayActionsMax - delayActionsMin) + delayActionsMin);
                }
                if (numWraps > 0 && jwt) {
                    console.log(`\n${colors.cyan}--- WRAP PHRS ---${colors.reset}`);
                    for (let i = 0; i < numWraps; i++) await wrapPHRS(wallet, provider, i, jwt, currentProxy), await sleep(Math.random() * (delayActionsMax - delayActionsMin) + delayActionsMin);
                }
                if (numSwaps > 0 && jwt) {
                    console.log(`\n${colors.cyan}--- SWAPS ---${colors.reset}`);
                    for (let i = 0; i < numSwaps; i++) await performSwap(wallet, provider, i, jwt, currentProxy), await sleep(Math.random() * (delayActionsMax - delayActionsMin) + delayActionsMin);
                }
                if (numLPs > 0 && jwt) {
                    console.log(`\n${colors.cyan}--- ADD LIQUIDITY ---${colors.reset}`);
                    for (let i = 0; i < numLPs; i++) await addLiquidity(wallet, provider, i, jwt, currentProxy), await sleep(Math.random() * (delayActionsMax - delayActionsMin) + delayActionsMin);
                }
                logger.success(`All actions for wallet ${wallet.address.substring(0,10)}... completed.`);
            } catch (walletError) {
                logger.error(`Critical error for wallet ${wallet.address.substring(0,10)}...: ${walletError.message}. Moving to next.`);
            }
            if (pkIdx < privateKeys.length - 1) {
                logger.info(`Waiting ${delayWallets / 1000}s before next wallet...`);
                await sleep(delayWallets);
            }
        }
        logger.success('All wallets processed for this cycle!');
        await countdown(delayMinutes);
    }
};

main().catch(error => {
    logger.error(`Bot failed critically in main loop: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});
