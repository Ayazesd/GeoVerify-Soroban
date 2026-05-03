# GeoVerify Soroban

GeoVerify is a decentralized Location-of-Proof (PoL) and Point-of-Interest (POI) verification platform built on the **Stellar Soroban** blockchain. It leverages a decentralized consensus mechanism to ensure the accuracy of physical location data, providing a trust layer for DePIN (Decentralized Physical Infrastructure Networks) projects.

## 🚀 Core Principle: 3-Vote Consensus

The platform operates on a robust verification logic where every reported location or error must be validated by the community.

- **POI Submission:** Users submit a Point of Interest (POI) by staking a batch deposit.
- **Verification Threshold:** For a POI to transition from `Pending` to `Confirmed` status, it must receive **3 unique votes** from different wallet addresses.
- **Visual Feedback:** Confirmed locations are highlighted in **bright green** on the HexGrid, while pending reports remain yellow.
- **Trustless Execution:** Once the 3-vote threshold is met, the POI status is automatically updated on-chain, making it eligible for protocol rewards or batch finalization.

## 💰 Economic Model: Deposit & Refund

GeoVerify ensures data integrity through a staking mechanism that rewards honest contributors and penalizes malicious actors.

- **Batch Deposit:** To submit a batch of reports, users must deposit **50 XLM** into the smart contract's vault.
- **Success Rate Threshold:** A batch is eligible for a **full refund** only if at least **80%** of the POIs within it reach the `Confirmed` status (3-vote consensus).
- **Refund Mechanism:** Upon successful verification, the user can trigger the `finalize_batch` function to withdraw their 50 XLM deposit back to their wallet.
- **Slashing:** If the batch fails to meet the verification threshold, the deposit remains locked or can be slashed to fund the protocol treasury for honest verifiers.

## 🛠 Technology Stack

- **Smart Contracts:** Rust-based Soroban contracts utilizing persistent storage for data durability.
- **Frontend:** React with TypeScript, providing a real-time interactive dashboard.
- **Mapping:** Google Maps API integrated with **Uber's H3 Hexagonal Hierarchical Spatial Indexing**.
- **Wallet Integration:** Freighter Wallet for secure on-chain transactions and identity management.

## 📂 Project Structure

- `/contracts`: Rust source code for the GeoVerify Soroban contract.
- `/src/lib/stellar`: TypeScript client implementation for Soroban RPC interaction.
- `/src/components/Map`: Hexagonal grid rendering logic using H3.
- `/src/components/Panel`: UI components for POI details, voting progress, and batch finalization.

## 🔧 Getting Started

### Prerequisites
- Node.js & npm
- Stellar CLI
- Freighter Wallet (configured for Testnet)

### Environment Setup
Create a `.env` file in the root directory:
```env
VITE_GOOGLE_MAPS_API_KEY=your_api_key
VITE_GEOVERIFY_CONTRACT_ID=your_contract_id
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK=TESTNET
```

### Installation
```bash
npm install
npm run dev
```

## 🛡 Security & Integrity

All critical actions, including `submit_poi`, `vote_poi`, and `finalize_batch`, require explicit authorization (`require_auth`) from the user's wallet, ensuring that no third party can manipulate the consensus or refund process.

---
Built with ❤️ for the Stellar DePIN Ecosystem.
