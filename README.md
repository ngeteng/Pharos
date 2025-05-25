# 🤖 Pharos Testnet Auto Bot 🤖

Bot Node.js ini dirancang untuk mengotomatiskan interaksi di **Pharos Testnet**. Bot ini melakukan berbagai tugas mulai dari check-in harian, klaim faucet, hingga transaksi DeFi seperti *swap* dan penambahan likuiditas. Tujuannya adalah untuk membantu pengguna berpartisipasi aktif dalam kegiatan testnet dan mengumpulkan poin.

Recode dengan ❤️ oleh **0x062**.

---

## ✨ Fitur Utama

* **Manajemen Multi-Wallet:** Memproses banyak *private key* dari file `privateKeys.txt`.
* **Dukungan Proxy:** Menggunakan proxy dari file `proxies.txt` untuk menyembunyikan IP (mendukung format `http://user:pass@host:port` atau `http://host:port`).
* **Interaksi API Pharos:**
    * Login otomatis menggunakan *signature*.
    * Check-in harian.
    * Klaim faucet testnet.
    * Verifikasi tugas interaksi (Swap/LP).
    * Mengambil dan menampilkan poin pengguna.
* **Aksi Blockchain (Pharos Testnet):**
    * Mengirim (transfer) token PHRS.
    * Membungkus (wrap) PHRS menjadi WPHRS.
    * Melakukan *swap* antar token (WPHRS, USDC, USDT) menggunakan *multicall*.
    * Menambah likuiditas ke *pool* (WPHRS/USDC, WPHRS/USDT).
    * Melakukan *swap* kembali (USDC/USDT ke WPHRS).
* **Konfigurasi Fleksibel:** Menggunakan file `.env` dan *prompt* interaktif untuk mengatur jumlah aksi dan jeda waktu.
* **Logging Berwarna:** Memberikan *output* konsol yang jelas dan berwarna untuk setiap langkah, keberhasilan, dan kesalahan.
* **Penanganan Kesalahan & Percobaan Ulang:** Mencoba kembali operasi yang gagal (API & Transaksi).
* **(Opsional) Laporan Telegram:** Mengirim ringkasan poin ke chat Telegram (membutuhkan `telegramReporter.js`).

---

## ⚠️ Penafian (Disclaimer)

**Gunakan dengan Risiko Anda Sendiri.** Skrip ini berinteraksi dengan *private key* Anda. Meskipun skrip ini hanya berjalan di *local machine* Anda dan tidak mengirim *private key* ke mana pun, sangat penting untuk memahami kodenya dan memastikan keamanan *private key* Anda. **Jangan pernah membagikan *private key* Anda.** Penulis tidak bertanggung jawab atas kehilangan dana atau masalah keamanan apa pun. Bot ini ditujukan untuk **Testnet**.

---

## 🛠️ Persiapan & Instalasi

### Prasyarat

* [Node.js](https://nodejs.org/) (versi 16 atau lebih tinggi direkomendasikan).
* npm (biasanya terinstal bersama Node.js).

### Langkah-langkah Instalasi

1.  **Clone Repositori (atau Unduh Kode):**
    ```bash
    git clone [https://github.com/USERNAME/REPO_NAME.git](https://github.com/USERNAME/REPO_NAME.git)
    cd REPO_NAME
    ```
    *Ganti `USERNAME` dan `REPO_NAME` dengan nama pengguna dan repositori Anda.*

2.  **Instal Dependensi:**
    ```bash
    npm install
    ```

3.  **Buat File `privateKeys.txt`:**
    Buat file bernama `privateKeys.txt` di direktori utama proyek. Isi dengan *private key* wallet Anda, **satu *private key* per baris**.
    ```
    0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
    ```

4.  **(Opsional) Buat File `proxies.txt`:**
    Jika Anda ingin menggunakan proxy, buat file `proxies.txt`. Isi dengan daftar proxy Anda, **satu proxy per baris**. Format: `http://user:pass@host:port` atau `http://host:port`.
    ```
    [http://user1:pass1@192.168.1.1:8080](http://user1:pass1@192.168.1.1:8080)
    [http://192.168.1.2:8888](http://192.168.1.2:8888)
    ```
    Jika file ini kosong atau tidak ada, bot akan berjalan tanpa proxy.

5.  **Buat dan Konfigurasi File `.env`:**
    Buat file bernama `.env` di direktori utama. Isi dengan konfigurasi berikut:
    ```env
    # Kode Undangan (Invite Code) Pharos Anda
    INVITE_CODE=KODE_UNDANGAN_ANDA

    # (Opsional) URL RPC Pharos Testnet (jika ingin mengganti default)
    # RPC_URL=[https://testnet.dplabs-internal.com](https://testnet.dplabs-internal.com)

    # (Opsional) Konfigurasi Bot Telegram (jika menggunakan telegramReporter.js)
    # TELEGRAM_BOT_TOKEN=TOKEN_BOT_ANDA
    # TELEGRAM_CHAT_ID=ID_CHAT_ANDA

    # (Opsional) Konfigurasi Jumlah Aksi & Jeda (jika tidak mau ditanya)
    # DELAY_MINUTES=60
    # NUM_TRANSFERS=2
    # NUM_WRAPS=1
    # NUM_SWAPS=2
    # NUM_LPS=1
    # ACTION_DELAY_MS=15000
    # WALLET_DELAY_MS=30000
    ```
    * Ganti `KODE_UNDANGAN_ANDA` dengan kode undangan Pharos Anda.
    * Jika Anda tidak mengatur variabel jumlah aksi dan jeda di `.env`, skrip akan menanyakannya saat dijalankan.

---

## ⚙️ Konfigurasi

Anda dapat mengonfigurasi perilaku bot melalui file `.env` atau melalui *prompt* interaktif saat skrip dijalankan:

* **`INVITE_CODE`** (Wajib): Kode undangan Anda untuk Pharos.
* **`RPC_URL`**: URL RPC untuk Pharos Testnet. Default ke `https://testnet.dplabs-internal.com`.
* **`DELAY_MINUTES`**: Jeda waktu (dalam menit) antara siklus penuh (tidak digunakan dalam mode *single cycle* saat ini). Default: 60.
* **`NUM_TRANSFERS`**: Jumlah transfer PHRS yang akan dilakukan per wallet. Default: 2.
* **`NUM_WRAPS`**: Jumlah wrap PHRS ke WPHRS yang akan dilakukan per wallet. Default: 1.
* **`NUM_SWAPS`**: Jumlah *swap* token yang akan dilakukan per wallet. Default: 2.
* **`NUM_LPS`**: Jumlah penambahan likuiditas yang akan dilakukan per wallet. Default: 1.
* **`ACTION_DELAY_MS`**: Jeda waktu (dalam milidetik) antara setiap aksi (transfer, wrap, swap, lp). Default: 15000 (15 detik).
* **`WALLET_DELAY_MS`**: Jeda waktu (dalam milidetik) antara pemrosesan setiap wallet. Default: 30000 (30 detik).

---

## 🚀 Menjalankan Bot

Setelah semua persiapan selesai, jalankan bot dengan perintah:

```bash
node nama_file_skrip_anda.js
