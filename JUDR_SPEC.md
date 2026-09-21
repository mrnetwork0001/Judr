# Judr: The Autonomous Arbitration Protocol for Real World Assets

## Overview
Judr acts as a decentralized judge for smart contracts managing Real World Assets (RWAs). It replaces expensive real-world legal arbitration by utilizing the SERV Reasoning API to ingest unstructured evidence (e.g., PDF contracts, invoices, photographs) and outputting a logical, legally sound verdict. It then automatically triggers the IXS Vault smart contract to route the disputed funds to the winning party.

## Core Architecture

### 1. The Dashboard (Frontend)
- **Framework:** Next.js (App Router), Vanilla CSS.
- **Purpose:** Allow users to connect wallets, view their active RWA vaults, raise a dispute, and upload evidence.
- **Key View:** The "Live Arbitration Feed" which streams the SERV Agent's thought process as it reads the evidence and formulates a verdict.

### 2. The Arbitration Agent (Backend)
- **Framework:** Next.js Server Actions / API Routes.
- **Role:** Handles the file processing (parsing PDFs/images) and structures the prompt for the SERV API.
- **Integration:** Calls the SERV Reasoning API. 
  - *Input:* Contract terms, Plaintiff Evidence, Defendant Evidence.
  - *Output:* JSON payload containing the `winner`, `confidence_score`, and `legal_reasoning`.

### 3. The IXS Vault Mock (Smart Contract Layer)
- **Role:** Simulates the IXS Finance Vaults for hackathon purposes.
- **Logic:** Holds deposited stablecoins in escrow. Exposes a `resolveDispute(address winner)` function that is called by the Judr agent (acting as an Oracle) to release the funds.

## Hackathon Demo Flow
1. **Setup:** Show a mock IXS Vault where Alice and Bob have $10,000 locked for a freelance contract.
2. **Dispute:** Bob claims the work was not delivered. Alice claims it was. They both upload evidence via the Judr dashboard.
3. **Execution:** The Judr agent is triggered. The UI splits, showing the agent reasoning through the evidence in real-time.
4. **Resolution:** Judr rules in favor of Alice, citing specific clauses in the contract. The smart contract automatically transfers the $10,000 to Alice's wallet.

## Next Steps for Development
- Build the UI layout (Dispute Dashboard & Arbitration Feed).
- Implement the evidence upload handler.
- Integrate the SERV Reasoning API.
- (Optional) Deploy a simple Solidity contract to Sepolia testnet to act as the IXS Vault.
