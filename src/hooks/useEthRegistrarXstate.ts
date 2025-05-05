import { useCallback, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useMachine } from '@xstate/react';
import { registrarMachine, RegistrationStep } from '@/machines/registrarMachine';
import {
  checkNameAvailability,
  getRentPrice,
  makeCommitmentHash
} from '@/lib/contract-functions';
import { ETH_REGISTRAR_CONTROLLER_ADDRESS, BURN_ADDRESS } from '@/lib/constants';
import { ethRegistrarControllerAbi } from '@/lib/abis/eth-registrar-controller.abi';

export { RegistrationStep } from '@/machines/registrarMachine';

export function useEthRegistrar() {
  const { address, isConnected } = useAccount();

  const {
    writeContract,
    isPending: isWritePending,
    data: writeData,
    error: writeError,
    reset: resetWrite
  } = useWriteContract();

  const { isLoading: isWaitingForTx, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
    hash: writeData,
  });

  const [state, send] = useMachine(registrarMachine);

  useEffect(() => {
    if (isTxConfirmed && writeData && state.matches('registering')) {
      send({
        type: 'REGISTRATION_RESULT',
        txHash: writeData
      });
    }

    if (writeError) {
      send({
        type: 'ERROR',
        message: writeError.message || 'Transaction failed'
      });
    }
  }, [isTxConfirmed, writeData, state.value, writeError, send]);

  const generateSecret = useCallback((): string => {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return '0x' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  useEffect(() => {
    if (state.matches('waitingForCommitment') && state.context.commitTimestamp > 0) {
      const startTimestamp = state.context.commitTimestamp;
      const waitTime = 60; // 60 seconds

      const now = Date.now();
      const elapsedTime = now - startTimestamp;

      if (elapsedTime >= waitTime * 1000) {
        send({ type: 'TIMER_COMPLETE' });
        return;
      }

      const initialRemainingTime = waitTime - Math.floor(elapsedTime / 1000);
      send({ type: 'TIMER_TICK', remainingTime: initialRemainingTime });

      const intervalId = setInterval(() => {
        const currentTime = Date.now();
        const elapsed = currentTime - startTimestamp;

        if (elapsed >= waitTime * 1000) {
          clearInterval(intervalId);
          send({ type: 'TIMER_COMPLETE' });
        } else {
          const remaining = waitTime - Math.floor(elapsed / 1000);
          send({ type: 'TIMER_TICK', remainingTime: remaining });
        }
      }, 1000);

      return () => clearInterval(intervalId);
    }
  }, [state.matches('waitingForCommitment'), state.context.commitTimestamp, send]);


  const checkAvailability = useCallback(async () => {
    if (!state.context.name) {
      send({ type: 'ERROR', message: 'Please enter a name' });
      return;
    }

    try {
      send({ type: 'CHECK_AVAILABILITY' });

      const name = state.context.name;
      const duration = state.context.duration;
      const available = await checkNameAvailability(name);

      if (!available.isOk() || !available.value) {
        send({ type: 'AVAILABILITY_RESULT', isAvailable: false });
        return;
      }

      const price = await getRentPrice(name, duration);
      if (!price.isOk()) {
        throw new Error('Failed to get rent price');
      }

      const priceWithBuffer = (price.value.base + price.value.premium) * BigInt(110) / BigInt(100);

      send({
        type: 'AVAILABILITY_RESULT',
        isAvailable: true,
        rentPriceWei: priceWithBuffer
      });
    } catch (error) {
      console.error('Error checking availability:', error);
      send({ type: 'ERROR', message: 'Error checking availability' });
    }
  }, [state.context.name, state.context.duration, send]);

  const makeCommitment = useCallback(async () => {
    if (!state.context.name || !isConnected || !address) {
      send({ type: 'ERROR', message: 'Please connect your wallet first' });
      return;
    }

    try {
      send({ type: 'MAKE_COMMITMENT' });

      const newSecret = generateSecret();

      const commitmentHash = await makeCommitmentHash(
        state.context.name,
        address,
        state.context.duration,
        newSecret,
        BURN_ADDRESS,
        [],
        false,
        0
      );

      if (!commitmentHash.isOk()) {
        throw new Error('Failed to create commitment hash');
      }

      writeContract({
        address: ETH_REGISTRAR_CONTROLLER_ADDRESS as `0x${string}`,
        abi: ethRegistrarControllerAbi,
        functionName: 'commit',
        args: [commitmentHash.value as `0x${string}`],
      }, {
        onSuccess(hash) {
          send({
            type: 'COMMITMENT_RESULT',
            commitment: commitmentHash.value,
            secret: newSecret,
            timestamp: Date.now(),
            txHash: hash
          });
        },
        onError(error) {
          send({
            type: 'ERROR',
            message: error.message || 'Error making commitment'
          });
        }
      });
    } catch (error) {
      console.error('Error making commitment:', error);
      send({ type: 'ERROR', message: 'Error making commitment' });
    }
  }, [state.context.name, state.context.duration, address, isConnected, writeContract, generateSecret, send]);

  const registerName = useCallback(async () => {
    if (!state.context.name || !isConnected || !address || !state.context.secret) {
      send({ type: 'ERROR', message: 'Missing required information' });
      return;
    }

    try {
      writeContract({
        address: ETH_REGISTRAR_CONTROLLER_ADDRESS as `0x${string}`,
        abi: ethRegistrarControllerAbi,
        functionName: 'register',
        args: [
          state.context.name,
          address,
          BigInt(state.context.duration),
          state.context.secret as `0x${string}`,
          BURN_ADDRESS as `0x${string}`,
          [],
          false,
          0
        ],
        value: state.context.rentPriceWei
      }, {
        onSuccess(hash) {
          send({ type: 'REGISTRATION_RESULT', txHash: hash });
        },
        onError(error) {
          send({
            type: 'ERROR',
            message: error.message || 'Error registering name'
          });
        }
      });
    } catch (error) {
      console.error('Error registering name:', error);
      send({ type: 'ERROR', message: 'Error registering name' });
    }
  }, [
    state.context.name,
    state.context.duration,
    state.context.secret,
    state.context.rentPriceWei,
    address,
    isConnected,
    writeContract,
    send
  ]);

  const resetForm = useCallback(() => {
    resetWrite();
    send({ type: 'RESET' });
  }, [resetWrite, send]);

  const setName = useCallback((name: string) => {
    send({ type: 'SET_NAME', name });
  }, [send]);

  const setDuration = useCallback((duration: number) => {
    send({ type: 'SET_DURATION', duration });
  }, [send]);

  const currentStep = (() => {
    if (state.matches('idle')) return RegistrationStep.InputName;
    if (state.matches('checkingAvailability')) return RegistrationStep.CheckingAvailability;
    if (state.matches('available')) return RegistrationStep.MakeCommitment;
    if (state.matches('makingCommitment')) return RegistrationStep.MakeCommitment;
    if (state.matches('waitingForCommitment')) return RegistrationStep.WaitForCommitment;
    if (state.matches('readyToRegister')) return RegistrationStep.Register;
    if (state.matches('registering')) return RegistrationStep.Register;
    if (state.matches('registered')) return RegistrationStep.Success;
    return RegistrationStep.InputName;
  })();

  const isLoading =
    state.matches('checkingAvailability') ||
    isWritePending ||
    isWaitingForTx;


  return {
    // State
    name: state.context.name,
    duration: state.context.duration,
    isAvailable: state.context.isAvailable,
    isLoading,
    error: state.context.error,
    currentStep,
    remainingTime: state.context.remainingTime,
    rentPriceWei: state.context.rentPriceWei,
    isConnected,
    commitment: state.context.commitment,
    commitTxHash: state.context.commitTxHash,
    registerTxHash: state.context.registerTxHash,

    // Actions
    setName,
    setDuration,
    checkAvailability,
    makeCommitment,
    registerName,
    resetForm,

    // For debugging
    state,
    send
  };
}