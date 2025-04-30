import client from "@/lib/client";
import { formatEther } from 'viem';
import { ethRegistrarControllerAbi } from "@/lib/abis/eth-registrar-controller.abi";
import { ETH_REGISTRAR_CONTROLLER_ADDRESS } from "@/lib/constants";
import { ResultAsync, fromPromise } from 'neverthrow';

type ContractError = {
  type: 'AvailabilityCheck' | 'PriceFetch' | 'CommitmentCreation';
  message: string;
  cause?: unknown;
}


export const checkNameAvailability = (name: string): ResultAsync<boolean, ContractError> => {
  return fromPromise(
    client.readContract({
      address: ETH_REGISTRAR_CONTROLLER_ADDRESS as `0x${string}`,
      abi: ethRegistrarControllerAbi,
      functionName: "available",
      args: [name],
    }).then(available => Boolean(available)),
    (error): ContractError => ({
      type: 'AvailabilityCheck',
      message: `Error checking if ${name}.eth is available`,
      cause: error
    })
  );
};


export const getRentPrice = (name: string, duration: number): ResultAsync<{
  base: bigint;
  premium: bigint;
  total: bigint;
  formattedTotal: string;
}, ContractError> => {
  return fromPromise(
    client.readContract({
      address: ETH_REGISTRAR_CONTROLLER_ADDRESS as `0x${string}`,
      abi: ethRegistrarControllerAbi,
      functionName: "rentPrice",
      args: [name, BigInt(duration)],
    }).then(price => {
      const priceObj = price as { base: bigint; premium: bigint };
      
      return {
        base: priceObj.base,
        premium: priceObj.premium,
        total: priceObj.base + priceObj.premium,
        formattedTotal: formatEther(priceObj.base + priceObj.premium)
      };
    }),
    (error): ContractError => ({
      type: 'PriceFetch',
      message: `Error getting rent price for ${name}.eth`,
      cause: error
    })
  );
};

export const makeCommitmentHash = (
  name: string,
  owner: string,
  duration: number,
  secret: string,
  resolver: string,
  data: any[],
  reverseRecord: boolean,
  ownerControlledFuses: number
): ResultAsync<`0x${string}`, ContractError> => {
  return fromPromise(
    client.readContract({
      address: ETH_REGISTRAR_CONTROLLER_ADDRESS as `0x${string}`,
      abi: ethRegistrarControllerAbi,
      functionName: "makeCommitment",
      args: [
        name,
        owner as `0x${string}`,
        BigInt(duration),
        secret as `0x${string}`,
        resolver as `0x${string}`,
        data,
        reverseRecord,
        ownerControlledFuses
      ],
    }).then(hash => hash as `0x${string}`),
    (error): ContractError => ({
      type: 'CommitmentCreation',
      message: `Error making commitment hash for ${name}.eth`,
      cause: error
    })
  );
};
