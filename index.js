require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const randomUseragent = require('random-useragent');
const axios = require('axios');
const prompt = require('prompt-sync')({ sigint: true });

// --- Konfigurasi Warna & Logger (Tidak Berubah) ---
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
    console.log(' Pharos Testnet Auto Bot - Airdrop Insiders (Fixed)');
    console.log('-------------------------------------------------');
    console.log(`${colors.reset}\n`);
  },
};

// --- Konfigurasi Jaringan & Token (Tidak Berubah) ---
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

const poolAddresses = {
  USDC_WPHRS: '0x0373a059321219745aee4fad8a942cf088be3d0e',
  USDT_WPHRS: '0x70118b6eec45329e0534d849bc3e588bb6752527',
};

const contractAddress = '0x1a4de519154ae51200b0ad7c90f7fac75547888a'; // Alamat kontrak untuk swap

const tokenDecimals = {
  WPHRS: 18,
  USDC: 6,
  USDT: 6,
};

// --- ABI (Disalin Kembali) ---
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
  'function deposit() public payable', // Untuk WPHRS
  'function withdraw(uint256 wad) public', // Untuk WPHRS
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

// --- Opsi (Disalin Kembali) ---
const pairOptions = [
  { id: 1, from: 'WPHRS', to: 'USDC', amount: 0.0001 },
  { id: 2, from: 'WPHRS', to: 'USDT', amount: 0.0001 },
  { id: 3, from: 'USDC', to: 'WPHRS', amount: 0.0001 },
  { id: 4, from: 'USDT', to: 'WPHRS', amount: 0.0001 },
  { id: 5, from: 'USDC', to: 'USDT', amount: 0.0001 },
  { id: 6, from: 'USDT', to: 'USDC', amount: 0.0001 },
];

const lpOptions = [
  { id: 1, token0: 'WPHRS', token1: 'USDC', amount0: 0.0001, amount1: 0.0001, fee: 3000 },
  { id: 2, token0: 'WPHRS', token1: 'USDT', amount0: 0.0001, amount1: 0.0001, fee: 3000 },
];

// --- Fungsi Helper (Sedikit Modifikasi & Penambahan) ---

// Fungsi Jeda
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fungsi Retry Sederhana
async function tryWithRetry(action, actionName = 'Action', retries = 3, delayMs = 5000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await action(); // Coba jalankan aksi
        } catch (error) {
            const errorMessage = error.message.toLowerCase();
            const errorCode = error.error?.code || error.code;

            // Periksa jika error terkait RPC (-32008) atau server (500) atau timeout
            if (errorMessage.includes('-32008') ||
                errorCode === 'SERVER_ERROR' ||
                errorCode === -32008 ||
                errorMessage.includes('unable to complete the request') ||
                errorMessage.includes('timeout') ||
                errorMessage.includes('server response 500')) {

                logger.warn(`[Retry ${i + 1}/${retries}] ${actionName} failed with RPC/Server/Timeout error. Retrying in ${delayMs / 1000}s...`);
                await sleep(delayMs);
            } else {
                logger.error(`${actionName} failed with non-retriable error: ${error.message}`);
                throw error; // Jika error lain, lempar lagi & jangan retry
            }
        }
    }
    logger.error(`${actionName} failed after ${retries} retries.`);
    throw new Error(`${actionName} failed after ${retries} retries.`);
}

// Fungsi untuk mendapatkan Opsi Transaksi (Gas, dll)
async function getTxOptions(provider, estimatedGas) {
    try {
        const feeData = await provider.getFeeData();
        const options = {
            gasLimit: Math.ceil(Number(estimatedGas) * 1.5), // Naikkan pengali sedikit
        };

        // Gunakan EIP-1559 jika tersedia, jika tidak, biarkan Ethers handle (biasanya pakai gasPrice)
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            options.maxFeePerGas = feeData.maxFeePerGas;
            options.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        } else if (feeData.gasPrice) {
            options.gasPrice = feeData.gasPrice;
        }
        // Jika tidak ada data fee EIP-1559 atau gasPrice, Ethers akan mencoba default provider
        return options;
    } catch (error) {
        logger.warn(`Failed to get fee data, using default gas limit: ${error.message}`);
        // Fallback jika getFeeData gagal
        return {
            gasLimit: Math.ceil(Number(estimatedGas) * 1.5),
        };
    }
}


const loadProxies = () => {
  try {
    const proxies = fs.readFileSync('proxies.txt', 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line);
    return proxies;
  } catch (error) {
    logger.warn('No proxies.txt found or failed to load, switching to direct mode');
    return [];
  }
};

const getRandomProxy = (proxies) => {
  return proxies[Math.floor(Math.random() * proxies.length)];
};

const setupProvider = (proxy = null) => {
  if (proxy) {
    logger.info(`Using proxy: ${proxy}`);
    const agent = new HttpsProxyAgent(proxy);
    // CATATAN: Ethers v6 mungkin memerlukan penanganan proxy yang berbeda
    // Ini mungkin tidak berfungsi 100% untuk RPC, tapi akan berfungsi untuk Axios
    // Kita coba teruskan agent ke JsonRpcProvider via 'fetchOptions' meskipun tidak standar
    return new ethers.JsonRpcProvider(networkConfig.rpcUrl, {
      chainId: networkConfig.chainId,
      name: networkConfig.name,
    }, {
      fetchOptions: { agent }, // Ini mungkin tidak didukung sepenuhnya oleh semua versi Ethers untuk RPC
      headers: { 'User-Agent': randomUseragent.getRandom() },
    });
  } else {
    logger.info('Using direct mode (no proxy)');
    return new ethers.JsonRpcProvider(networkConfig.rpcUrl, {
      chainId: networkConfig.chainId,
      name: networkConfig.name,
    });
  }
};

const checkBalanceAndApproval = async (wallet, tokenAddress, amount, decimals, spender) => {
    try {
        const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
        const balance = await tokenContract.balanceOf(wallet.address);
        const required = ethers.parseUnits(amount.toString(), decimals);
        const tokenSymbol = Object.keys(tokens).find(key => tokens[key].toLowerCase() === tokenAddress.toLowerCase()) || 'Token';

        if (balance < required) {
            logger.warn(
                `Skipping: Insufficient ${tokenSymbol} balance: ${ethers.formatUnits(balance, decimals)} < ${amount}`
            );
            return false;
        }

        const allowance = await tokenContract.allowance(wallet.address, spender);
        if (allowance < required) {
            logger.step(`Approving ${amount} ${tokenSymbol} for ${spender}...`);
            
            const action = async () => {
                const estimatedGas = await tokenContract.approve.estimateGas(spender, ethers.MaxUint256);
                const txOptions = await getTxOptions(wallet.provider, estimatedGas);
                const approveTx = await tokenContract.approve(spender, ethers.MaxUint256, txOptions);
                await approveTx.wait();
            };

            await tryWithRetry(action, `Approve ${tokenSymbol}`);
            logger.success('Approval completed');
        }
        return true;
    } catch (error) {
        logger.error(`Balance/approval check for ${Object.keys(tokens).find(key => tokens[key].toLowerCase() === tokenAddress.toLowerCase()) || 'Token'} failed: ${error.message}`);
        return false;
    }
};

const getUserInfo = async (wallet, proxy = null, jwt) => {
  try {
    logger.user(`Fetching user info for wallet: ${wallet.address}`);
    const profileUrl = `https://api.pharosnetwork.xyz/user/profile?address=${wallet.address}`;
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.8",
      authorization: `Bearer ${jwt}`,
      "sec-ch-ua": '"Chromium";v="136", "Brave";v="136", "Not.A/Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "sec-gpc": "1",
      Referer: "https://testnet.pharosnetwork.xyz/",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "User-Agent": randomUseragent.getRandom(),
    };

    const axiosConfig = {
      method: 'get',
      url: profileUrl,
      headers,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null,
      timeout: 15000, // Tambahkan timeout untuk axios
    };

    const action = async () => {
        logger.loading('Fetching user profile...');
        return await axios(axiosConfig);
    };

    const response = await tryWithRetry(action, 'Fetch User Info');
    const data = response.data;

    if (data.code !== 0 || !data.data.user_info) {
      logger.error(`Failed to fetch user info: ${data.msg || 'Unknown error'}`);
      return;
    }

    const userInfo = data.data.user_info;
    logger.info(`User ID: ${userInfo.ID}`);
    logger.info(`Task Points: ${userInfo.TaskPoints}`);
    logger.info(`Total Points: ${userInfo.TotalPoints}`);
  } catch (error) {
    logger.error(`Failed to fetch user info: ${error.message}`);
  }
};

const verifyTask = async (wallet, proxy, jwt, txHash) => {
    if (!jwt) {
        logger.warn(`Skipping task verification for ${txHash} - No JWT token.`);
        return false;
    }
  try {
    logger.step(`Verifying task ID 103 for transaction: ${txHash}`);
    const verifyUrl = `https://api.pharosnetwork.xyz/task/verify?address=${wallet.address}&task_id=103&tx_hash=${txHash}`;
    
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.8",
      authorization: `Bearer ${jwt}`,
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="136", "Brave";v="136", "Not.A/Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "sec-gpc": "1",
      Referer: "https://testnet.pharosnetwork.xyz/",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "User-Agent": randomUseragent.getRandom(),
    };

    const axiosConfig = {
      method: 'post',
      url: verifyUrl,
      headers,
      httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null,
      timeout: 15000, // Tambahkan timeout untuk axios
    };

    const action = async () => {
        logger.loading('Sending task verification request...');
        return await axios(axiosConfig);
    };

    const response = await tryWithRetry(action, `Verify Task ${txHash}`);
    const data = response.data;

    if (data.code === 0 && data.data.verified) {
      logger.success(`Task ID 103 verified successfully for ${txHash}`);
      return true;
    } else {
      logger.warn(`Task verification failed: ${data.msg || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    logger.error(`Task verification failed for ${txHash}: ${error.message}`);
    return false;
  }
};

const getMulticallData = (pair, amount, walletAddress) => {
  try {
    const decimals = tokenDecimals[pair.from];
    const scaledAmount = ethers.parseUnits(amount.toString(), decimals);

    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint24', 'address', 'uint256', 'uint256', 'uint256'],
      [
        tokens[pair.from],
        tokens[pair.to],
        500, // Fee 500 -> 0.05%? Pastikan ini benar untuk pair tersebut
        walletAddress, // recipient
        scaledAmount, // amountIn
        0, // amountOutMinimum (0 = bahaya, tapi umum di testnet/bot)
        0, // sqrtPriceLimitX96 (0 = tidak ada limit harga)
      ]
    );

    // Selector 0x04e45aaf biasanya 'exactInputSingle' pada Uniswap V3 style router
    return [ethers.concat(['0x04e45aaf', data])];
  } catch (error) {
    logger.error(`Failed to generate multicall data: ${error.message}`);
    return [];
  }
};

// --- Fungsi Aksi Utama (Dimodifikasi) ---

const performSwap = async (wallet, provider, index, jwt, proxy) => {
    try {
        const pair = pairOptions[Math.floor(Math.random() * pairOptions.length)];
        const amount = pair.amount;
        const actionName = `Swap ${index + 1}: ${pair.from} -> ${pair.to}`;
        logger.step(`Preparing ${actionName} (${amount} ${pair.from})`);

        const decimals = tokenDecimals[pair.from];
        // Tidak perlu membuat instance tokenContract di sini jika hanya untuk cek saldo dan approval
        // checkBalanceAndApproval sudah melakukannya

        if (!(await checkBalanceAndApproval(wallet, tokens[pair.from], amount, decimals, contractAddress))) {
            return; // checkBalanceAndApproval sudah mencatat error jika gagal
        }

        const contract = new ethers.Contract(contractAddress, contractAbi, wallet);
        const multicallDataArray = getMulticallData(pair, amount, wallet.address); // Nama variabel diubah agar jelas array

        if (!multicallDataArray || multicallDataArray.length === 0 || multicallDataArray.some(data => !data || data === '0x')) {
            logger.error(`Invalid or empty multicall data for ${pair.from} -> ${pair.to}`);
            return;
        }

        // !!!!!!!!! PERINGATAN !!!!!!!!!
        // Panggilan multicall ini SANGAT MUNGKIN SALAH atau tidak sesuai dengan tujuan.
        // ABI 'multicall' Anda meminta (uint256 collectionAndSelfcalls, bytes[] data).
        // 'collectionAndSelfcalls' biasanya untuk agregasi atau self-calls, mungkin 0 jika hanya satu call.
        // 'data' adalah array dari calldata. 'getMulticallData' Anda mengembalikan array dengan 1 item.
        // PASTIKAN 'contractAddress' adalah router yang benar dan mendukung ABI 'multicall' ini
        // untuk melakukan swap dengan data 'exactInputSingle'.
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        const collectionAndSelfcalls = 0; // Tebakan, mungkin perlu disesuaikan atau fungsi lain yang dipanggil

        const action = async () => {
            let estimatedGas;
            try {
                // Pastikan parameter sesuai dengan ABI: (uint256, bytes[])
                estimatedGas = await contract.multicall.estimateGas(collectionAndSelfcalls, multicallDataArray, {
                    from: wallet.address,
                });
            } catch (error) {
                logger.error(`Gas estimation failed for ${actionName}: ${error.message}`);
                throw error; // Lempar error agar retry menangkap
            }

            const txOptions = await getTxOptions(provider, estimatedGas);
            const tx = await contract.multicall(collectionAndSelfcalls, multicallDataArray, txOptions);

            logger.loading(`Swap transaction ${index + 1} sent, waiting for confirmation...`);
            const receipt = await tx.wait();
            if (!receipt || receipt.status === 0) {
                 logger.error(`Swap ${index + 1} transaction failed on-chain. Hash: ${receipt ? receipt.hash : 'N/A'}`);
                 throw new Error(`Swap transaction failed on-chain. Status: ${receipt ? receipt.status : 'unknown'}`);
            }
            logger.success(`Swap ${index + 1} completed: ${receipt.hash}`);
            logger.step(`Explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash}`);

            await verifyTask(wallet, proxy, jwt, receipt.hash);
        };

        await tryWithRetry(action, actionName);

    } catch (error) {
        logger.error(`Swap ${index + 1} failed (Outer Catch): ${error.message}`);
    }
};

const transferPHRS = async (wallet, provider, index, jwt, proxy) => {
    try {
        const amount = 0.000001; // Jumlah kecil untuk transfer
        const randomWallet = ethers.Wallet.createRandom();
        const toAddress = randomWallet.address;
        const actionName = `PHRS Transfer ${index + 1}`;
        logger.step(`Preparing ${actionName}: ${amount} PHRS to ${toAddress}`);

        const balance = await provider.getBalance(wallet.address);
        const required = ethers.parseEther(amount.toString());

        if (balance < required + ethers.parseUnits('0.001', 'ether')) { // Cek saldo cukup untuk gas juga
            logger.warn(`Skipping ${actionName}: Insufficient PHRS balance for transfer and gas.`);
            return;
        }

        const action = async () => {
            const txRequest = {
                to: toAddress,
                value: required,
            };
            // Untuk transfer ETH/native, estimateGas bisa dari provider atau wallet
            const estimatedGas = await wallet.estimateGas(txRequest);
            const txOptions = await getTxOptions(provider, estimatedGas);
            const tx = await wallet.sendTransaction({ ...txRequest, ...txOptions });

            logger.loading(`Transfer transaction ${index + 1} sent, waiting for confirmation...`);
            const receipt = await tx.wait();
             if (!receipt || receipt.status === 0) {
                 logger.error(`Transfer ${index + 1} transaction failed on-chain. Hash: ${receipt ? receipt.hash : 'N/A'}`);
                 throw new Error(`Transfer transaction failed on-chain. Status: ${receipt ? receipt.status : 'unknown'}`);
            }
            logger.success(`Transfer ${index + 1} completed: ${receipt.hash}`);
            logger.step(`Explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash}`);

            await verifyTask(wallet, proxy, jwt, receipt.hash);
        };

        await tryWithRetry(action, actionName);

    } catch (error) {
        logger.error(`Transfer ${index + 1} failed (Outer Catch): ${error.message}`);
    }
};

const wrapPHRS = async (wallet, provider, index, jwt, proxy) => {
    try {
        const minAmount = 0.001;
        const maxAmount = 0.005;
        const amount = minAmount + Math.random() * (maxAmount - minAmount);
        const amountWei = ethers.parseEther(amount.toFixed(6).toString());
        const actionName = `Wrap PHRS ${index + 1}`;
        logger.step(`Preparing ${actionName}: ${amount.toFixed(6)} PHRS to WPHRS`);

        const balance = await provider.getBalance(wallet.address);
        if (balance < amountWei + ethers.parseUnits('0.001', 'ether')) { // Cek saldo cukup untuk gas juga
            logger.warn(`Skipping ${actionName}: Insufficient PHRS balance for wrap and gas.`);
            return;
        }

        const wphrsContract = new ethers.Contract(tokens.WPHRS, erc20Abi, wallet);

        const action = async () => {
            let estimatedGas;
            try {
                estimatedGas = await wphrsContract.deposit.estimateGas({ value: amountWei });
            } catch (error) {
                logger.error(`Gas estimation failed for ${actionName}: ${error.message}`);
                throw error;
            }

            const txOptions = await getTxOptions(provider, estimatedGas);
            const tx = await wphrsContract.deposit({
                value: amountWei,
                ...txOptions
            });

            logger.loading(`Wrap transaction ${index + 1} sent, waiting for confirmation...`);
            const receipt = await tx.wait();
            if (!receipt || receipt.status === 0) {
                 logger.error(`Wrap ${index + 1} transaction failed on-chain. Hash: ${receipt ? receipt.hash : 'N/A'}`);
                 throw new Error(`Wrap transaction failed on-chain. Status: ${receipt ? receipt.status : 'unknown'}`);
            }
            logger.success(`Wrap ${index + 1} completed: ${receipt.hash}`);
            logger.step(`Explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash}`);

            await verifyTask(wallet, proxy, jwt, receipt.hash);
        };

        await tryWithRetry(action, actionName);

    } catch (error) {
        logger.error(`Wrap ${index + 1} failed (Outer Catch): ${error.message}`);
    }
};

const claimFaucet = async (wallet, proxy = null) => {
    const actionName = `Faucet Claim for ${wallet.address}`;
    try {
        logger.step(`Checking faucet eligibility for wallet: ${wallet.address}`);
        const message = "pharos"; // Pesan yang akan ditandatangani
        const signature = await wallet.signMessage(message);
        logger.step(`Signed message: ${signature.substring(0, 20)}...`);

        const loginUrl = `https://api.pharosnetwork.xyz/user/login?address=${wallet.address}&signature=${signature}&invite_code=S6NGMzXSCDBxhnwo`;
        const headers = {
            accept: "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.8",
            authorization: "Bearer null", // Penting: 'Bearer null' saat login awal
            "sec-ch-ua": '"Chromium";v="136", "Brave";v="136", "Not.A/Brand";v="99"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
            "sec-gpc": "1",
            Referer: "https://testnet.pharosnetwork.xyz/",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "User-Agent": randomUseragent.getRandom(),
        };

        const axiosConfigLogin = {
            method: 'post',
            url: loginUrl,
            headers,
            httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null,
            timeout: 20000, // Tambah timeout
        };
        
        let loginData;
        try {
            logger.loading('Sending login request for faucet...');
            const loginResponse = await axios(axiosConfigLogin);
            loginData = loginResponse.data;
        } catch (axiosError) {
            logger.error(`Login request for faucet failed: ${axiosError.message}`);
            if (axiosError.response) {
                logger.error(`Response data: ${JSON.stringify(axiosError.response.data)}`);
            }
            return false;
        }


        if (loginData.code !== 0 || !loginData.data.jwt) {
            logger.error(`Login failed for faucet: ${loginData.msg || 'Unknown error'}`);
            return false;
        }

        const jwt = loginData.data.jwt;
        logger.success(`Login successful for faucet, JWT: ${jwt.substring(0, 15)}...`);

        const statusUrl = `https://api.pharosnetwork.xyz/faucet/status?address=${wallet.address}`;
        const statusHeaders = { ...headers, authorization: `Bearer ${jwt}` }; // Gunakan JWT di sini

        let statusData;
        try {
            logger.loading('Checking faucet status...');
            const statusResponse = await axios({
                method: 'get',
                url: statusUrl,
                headers: statusHeaders,
                httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null,
                timeout: 20000,
            });
            statusData = statusResponse.data;
        } catch (axiosError) {
            logger.error(`Faucet status check request failed: ${axiosError.message}`);
            if (axiosError.response) {
                logger.error(`Response data: ${JSON.stringify(axiosError.response.data)}`);
            }
            return false;
        }


        if (statusData.code !== 0 || !statusData.data) {
            logger.error(`Faucet status check failed: ${statusData.msg || 'Unknown error'}`);
            return false;
        }

        if (!statusData.data.is_able_to_faucet) {
            const nextAvailableTimestamp = statusData.data.avaliable_timestamp;
            if (nextAvailableTimestamp) {
                const nextAvailable = new Date(nextAvailableTimestamp * 1000).toLocaleString('en-US', { timeZone: 'Asia/Makassar' });
                logger.warn(`Faucet not available until: ${nextAvailable}`);
            } else {
                logger.warn(`Faucet not available. No specific timestamp provided.`);
            }
            return false;
        }

        // Gunakan retry untuk klaim
        const claimAction = async () => {
            const claimUrl = `https://api.pharosnetwork.xyz/faucet/daily?address=${wallet.address}`;
            logger.loading('Claiming faucet...');
            const claimResponse = await axios({
                method: 'post',
                url: claimUrl,
                headers: statusHeaders, // Gunakan statusHeaders yang sudah ada JWT
                httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null,
                timeout: 20000,
            });
            const claimData = claimResponse.data;
            if (claimData.code === 0) {
                logger.success(`Faucet claimed successfully for ${wallet.address}`);
                return true;
            } else {
                logger.error(`Faucet claim attempt failed: ${claimData.msg || 'Unknown error'}`);
                throw new Error(claimData.msg || 'Unknown error'); // Lempar error agar retry menangkap
            }
        };

        return await tryWithRetry(claimAction, actionName, 3, 3000);

    } catch (error) {
        logger.error(`${actionName} failed (Outer Catch): ${error.message}`);
        return false;
    }
};


const performCheckIn = async (wallet, proxy = null) => {
    const actionName = `Daily Check-In for ${wallet.address}`;
    try {
        const checkInAction = async () => {
            logger.step(`Performing ${actionName}`);
            const message = "pharos";
            const signature = await wallet.signMessage(message);
            logger.step(`Signed message: ${signature.substring(0, 20)}...`);

            const loginUrl = `https://api.pharosnetwork.xyz/user/login?address=${wallet.address}&signature=${signature}&invite_code=S6NGMzXSCDBxhnwo`;
            const headers = {
                accept: "application/json, text/plain, */*",
                "accept-language": "en-US,en;q=0.8",
                authorization: "Bearer null",
                "sec-ch-ua": '"Chromium";v="136", "Brave";v="136", "Not.A/Brand";v="99"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
                "sec-gpc": "1",
                Referer: "https://testnet.pharosnetwork.xyz/",
                "Referrer-Policy": "strict-origin-when-cross-origin",
                "User-Agent": randomUseragent.getRandom(),
            };

            const axiosConfigLogin = {
                method: 'post',
                url: loginUrl,
                headers,
                httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null,
                timeout: 20000,
            };
            
            let loginData;
            try {
                logger.loading('Sending login request...');
                const loginResponse = await axios(axiosConfigLogin);
                loginData = loginResponse.data;
            } catch (axiosError) {
                logger.error(`Login request for check-in failed: ${axiosError.message}`);
                 if (axiosError.response) {
                    logger.error(`Response data: ${JSON.stringify(axiosError.response.data)}`);
                }
                throw new Error(axiosError.message || 'Login for check-in failed');
            }


            if (loginData.code !== 0 || !loginData.data.jwt) {
                logger.error(`Login failed: ${loginData.msg || 'Unknown error'}`);
                throw new Error(loginData.msg || 'Login failed');
            }

            const jwt = loginData.data.jwt;
            logger.success(`Login successful, JWT: ${jwt.substring(0, 15)}...`);

            const checkInUrl = `https://api.pharosnetwork.xyz/sign/in?address=${wallet.address}`;
            const checkInHeaders = { ...headers, authorization: `Bearer ${jwt}` }; // Gunakan JWT

            let checkInData;
            try {
                logger.loading('Sending check-in request...');
                const checkInResponse = await axios({
                    method: 'post',
                    url: checkInUrl,
                    headers: checkInHeaders,
                    httpsAgent: proxy ? new HttpsProxyAgent(proxy) : null,
                    timeout: 20000,
                });
                checkInData = checkInResponse.data;
            } catch (axiosError) {
                logger.error(`Check-in request failed: ${axiosError.message}`);
                if (axiosError.response) {
                    logger.error(`Response data: ${JSON.stringify(axiosError.response.data)}`);
                }
                throw new Error(axiosError.message || 'Check-in request failed');
            }


            if (checkInData.code === 0) {
                logger.success(`Check-in successful for ${wallet.address}`);
                return jwt;
            } else {
                // Kode 20002 = "You have signed in today"
                if (checkInData.code === 20002) {
                    logger.warn(`Already checked in today for ${wallet.address}.`);
                } else {
                    logger.warn(`Check-in failed/already done: ${checkInData.msg || 'Unknown error'} (Code: ${checkInData.code})`);
                }
                return jwt; // Tetap kembalikan JWT jika sudah check-in atau error yang diketahui
            }
        };

        return await tryWithRetry(checkInAction, actionName, 3, 3000);

    } catch (error) {
        logger.error(`${actionName} failed (Outer Catch): ${error.message}`);
        return null;
    }
};


const addLiquidity = async (wallet, provider, index, jwt, proxy) => {
    try {
        const pair = lpOptions[Math.floor(Math.random() * lpOptions.length)];
        const amount0 = pair.amount0;
        const amount1 = pair.amount1;
        const actionName = `Liquidity Add ${index + 1}: ${pair.token0}/${pair.token1}`;
        logger.step(`Preparing ${actionName} (${amount0} ${pair.token0}, ${amount1} ${pair.token1})`);

        const decimals0 = tokenDecimals[pair.token0];
        if (!(await checkBalanceAndApproval(wallet, tokens[pair.token0], amount0, decimals0, tokens.POSITION_MANAGER))) {
            return;
        }

        const decimals1 = tokenDecimals[pair.token1];
        if (!(await checkBalanceAndApproval(wallet, tokens[pair.token1], amount1, decimals1, tokens.POSITION_MANAGER))) {
            return;
        }
        
        const amount0Wei = ethers.parseUnits(amount0.toString(), decimals0); // Pindahkan setelah approval
        const amount1Wei = ethers.parseUnits(amount1.toString(), decimals1); // Pindahkan setelah approval

        const positionManager = new ethers.Contract(tokens.POSITION_MANAGER, positionManagerAbi, wallet);
        const deadline = Math.floor(Date.now() / 1000) + 600; // 10 menit deadline
        const tickLower = -60000; // Rentang tick yang sangat lebar, umum untuk testnet farming
        const tickUpper = 60000;

        const mintParams = {
            token0: tokens[pair.token0],
            token1: tokens[pair.token1],
            fee: pair.fee, // Pastikan fee ini valid untuk pair tersebut
            tickLower,
            tickUpper,
            amount0Desired: amount0Wei,
            amount1Desired: amount1Wei,
            amount0Min: 0, // Slippage tolerance 0, bahaya di mainnet
            amount1Min: 0, // Slippage tolerance 0, bahaya di mainnet
            recipient: wallet.address,
            deadline,
        };

        const action = async () => {
            let estimatedGas;
            try {
                estimatedGas = await positionManager.mint.estimateGas(mintParams, { from: wallet.address });
            } catch (error) {
                logger.error(`Gas estimation failed for LP ${index + 1}: ${error.message}`);
                throw error;
            }

            const txOptions = await getTxOptions(provider, estimatedGas);
            const tx = await positionManager.mint(mintParams, txOptions);

            logger.loading(`Liquidity Add ${index + 1} sent, waiting for confirmation...`);
            const receipt = await tx.wait();
            if (!receipt || receipt.status === 0) {
                 logger.error(`Add Liquidity ${index + 1} transaction failed on-chain. Hash: ${receipt ? receipt.hash : 'N/A'}`);
                 throw new Error(`Add Liquidity transaction failed on-chain. Status: ${receipt ? receipt.status : 'unknown'}`);
            }
            logger.success(`Liquidity Add ${index + 1} completed: ${receipt.hash}`);
            logger.step(`Explorer: https://testnet.pharosscan.xyz/tx/${receipt.hash}`);

            await verifyTask(wallet, proxy, jwt, receipt.hash);
        };

        await tryWithRetry(action, actionName);

    } catch (error) {
        logger.error(`Liquidity Add ${index + 1} failed (Outer Catch): ${error.message}`);
    }
};

const getUserDelay = () => {
  let delayMinutes = process.env.DELAY_MINUTES;
  if (!delayMinutes) {
    delayMinutes = prompt('Enter delay between cycles in minutes (e.g., 30): ');
  }
  const minutes = parseInt(delayMinutes, 10);
  if (isNaN(minutes) || minutes <= 0) {
    logger.warn('Invalid delay input, using default 30 minutes');
    return 30;
  }
  return minutes;
};

const countdown = async (minutes) => {
  const totalSeconds = minutes * 60;
  logger.info(`Starting ${minutes}-minute countdown...`);

  for (let seconds = totalSeconds; seconds >= 0; seconds--) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    process.stdout.write(`\r${colors.cyan}Time remaining: ${mins}m ${secs}s${colors.reset} `);
    await sleep(1000);
  }
  process.stdout.write('\rCountdown complete! Restarting process...\n\n');
};

// --- Fungsi Main (Modifikasi Jeda) ---
const main = async () => {
    logger.banner();

    const delayMinutes = getUserDelay();
    logger.info(`Delay between cycles set to ${delayMinutes} minutes`);

    const proxies = loadProxies();
    const privateKeys = [process.env.PRIVATE_KEY_1, process.env.PRIVATE_KEY_2].filter(pk => pk && pk.trim() !== '');
    if (!privateKeys.length) {
        logger.error('No private keys found in .env. Please check your .env file (e.g., PRIVATE_KEY_1=your_key).');
        return;
    }
    logger.info(`Loaded ${privateKeys.length} private key(s).`);


    // Kurangi jumlahnya untuk mengurangi beban RPC & testing awal
    const numTransfers = parseInt(process.env.NUM_TRANSFERS) || 5;
    const numWraps = parseInt(process.env.NUM_WRAPS) || 5;
    const numSwaps = parseInt(process.env.NUM_SWAPS) || 5;
    const numLPs = parseInt(process.env.NUM_LPS) || 3;

    logger.info(`Actions per wallet: Transfers=${numTransfers}, Wraps=${numWraps}, Swaps=${numSwaps}, LPs=${numLPs}`);

    const delayBetweenActionsMin = parseInt(process.env.DELAY_ACTIONS_MIN_MS) || 5000; // Jeda minimal 5 detik antar aksi
    const delayBetweenActionsMax = parseInt(process.env.DELAY_ACTIONS_MAX_MS) || 10000; // Jeda maksimal 10 detik antar aksi
    const delayBetweenWallets = parseInt(process.env.DELAY_WALLETS_MS) || 15000; // Jeda 15 detik antar wallet

    while (true) {
        for (let pkIndex = 0; pkIndex < privateKeys.length; pkIndex++) {
            const privateKey = privateKeys[pkIndex];
            const proxy = proxies.length ? getRandomProxy(proxies) : null;
            const provider = setupProvider(proxy); // Provider baru untuk setiap wallet/proxy
            const wallet = new ethers.Wallet(privateKey, provider);

            logger.wallet(`[Wallet ${pkIndex + 1}/${privateKeys.length}] Using wallet: ${wallet.address}`);

            try {
                await claimFaucet(wallet, proxy);
                await sleep(Math.random() * (delayBetweenActionsMax - delayBetweenActionsMin) + delayBetweenActionsMin);

                const jwt = await performCheckIn(wallet, proxy);
                await sleep(Math.random() * (delayBetweenActionsMax - delayBetweenActionsMin) + delayBetweenActionsMin);

                if (jwt) {
                    await getUserInfo(wallet, proxy, jwt);
                } else {
                    logger.warn('Skipping user info fetch due to failed check-in/JWT');
                }
                await sleep(Math.random() * (delayBetweenActionsMax - delayBetweenActionsMin) + delayBetweenActionsMin);

                // --- Transfers ---
                if (numTransfers > 0) {
                    console.log(`\n${colors.cyan}--- TRANSFERS ---${colors.reset}`);
                    for (let i = 0; i < numTransfers; i++) {
                        await transferPHRS(wallet, provider, i, jwt, proxy);
                        await sleep(Math.random() * (delayBetweenActionsMax - delayBetweenActionsMin) + delayBetweenActionsMin);
                    }
                }

                // --- Wraps ---
                if (numWraps > 0) {
                    console.log(`\n${colors.cyan}--- WRAP PHRS ---${colors.reset}`);
                    for (let i = 0; i < numWraps; i++) {
                        await wrapPHRS(wallet, provider, i, jwt, proxy);
                        await sleep(Math.random() * (delayBetweenActionsMax - delayBetweenActionsMin) + delayBetweenActionsMin);
                    }
                }
                
                // --- Swaps ---
                if (numSwaps > 0) {
                    console.log(`\n${colors.cyan}--- SWAPS ---${colors.reset}`);
                    for (let i = 0; i < numSwaps; i++) {
                        await performSwap(wallet, provider, i, jwt, proxy);
                        await sleep(Math.random() * (delayBetweenActionsMax - delayBetweenActionsMin) + delayBetweenActionsMin);
                    }
                }

                // --- Add Liquidity ---
                if (numLPs > 0) {
                    console.log(`\n${colors.cyan}--- ADD LIQUIDITY ---${colors.reset}`);
                    for (let i = 0; i < numLPs; i++) {
                        await addLiquidity(wallet, provider, i, jwt, proxy);
                        await sleep(Math.random() * (delayBetweenActionsMax - delayBetweenActionsMin) + delayBetweenActionsMin);
                    }
                }

                logger.success(`All actions completed for wallet: ${wallet.address}`);

            } catch (walletError) {
                // Error yang tidak tertangani oleh tryWithRetry di dalam fungsi aksi
                logger.error(`An unrecoverable error occurred for wallet ${wallet.address}: ${walletError.message}. Moving to next wallet.`);
            }
            
            if (pkIndex < privateKeys.length - 1) {
                 logger.info(`Waiting ${delayBetweenWallets / 1000}s before next wallet...`);
                 await sleep(delayBetweenWallets);
            }
        }

        logger.success('All actions completed for all wallets for this cycle!');
        await countdown(delayMinutes);
    }
};

main().catch(error => {
    logger.error(`Bot failed critically: ${error.message}`);
    console.error(error.stack); // Cetak stack trace untuk debug yang lebih baik
    process.exit(1);
});
