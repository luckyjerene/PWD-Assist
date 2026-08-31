import { Contract, rpc, TransactionBuilder, xdr, Networks, Address } from '@stellar/stellar-sdk';

const server = new rpc.Server(import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org');
const networkPassphrase = import.meta.env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET;
const contractId = import.meta.env.VITE_CONTRACT_ID;

export async function checkBeneficiaryStatus(beneficiaryId: number) {
  if (!contractId) throw new Error("Contract ID not configured");
  
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(await server.getAccount("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"), { fee: "100", networkPassphrase })
    .addOperation(contract.call("get_record", xdr.ScVal.scvU32(beneficiaryId)))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error((sim as any).error);
  return sim;
}
