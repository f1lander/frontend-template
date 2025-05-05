import { setup, assign } from 'xstate';

// TODO replace local storage with xstate pers
const COMMITMENT_KEY = 'ens_commitment';
const SECRET_KEY = 'ens_secret';
const NAME_KEY = 'ens_name';
const COMMIT_TIMESTAMP_KEY = 'ens_commit_timestamp';
const RENT_PRICE_KEY = 'ens_rent_price';
const DURATION_KEY = 'ens_duration';
const COMMIT_TX_HASH_KEY = 'ens_commit_tx_hash';
const REGISTER_TX_HASH_KEY = 'ens_register_tx_hash';

export enum RegistrationStep {
  InputName,
  CheckingAvailability,
  MakeCommitment,
  WaitForCommitment,
  Register,
  Success
}

interface RegistrarContext {
  name: string;
  duration: number;
  isAvailable: boolean | null;
  error: string;
  secret: string;
  commitment: string;
  commitTimestamp: number;
  remainingTime: number;
  rentPriceWei: bigint;
  commitTxHash: string;
  registerTxHash: string;
}

type RegistrarEvent =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DURATION'; duration: number }
  | { type: 'CHECK_AVAILABILITY' }
  | { type: 'AVAILABILITY_RESULT'; isAvailable: boolean; rentPriceWei?: bigint }
  | { type: 'MAKE_COMMITMENT' }
  | { type: 'COMMITMENT_RESULT'; commitment: string; secret: string; timestamp: number; txHash: string }
  | { type: 'TIMER_TICK'; remainingTime: number }
  | { type: 'TIMER_COMPLETE' }
  | { type: 'REGISTER' }
  | { type: 'REGISTRATION_RESULT'; txHash: string }
  | { type: 'RESET' }
  | { type: 'ERROR'; message: string };

const isBrowser = typeof window !== 'undefined';


const loadSavedData = () => {
  const defaultData = {
    commitment: '',
    secret: '',
    name: '',
    commitTimestamp: 0,
    rentPriceWei: BigInt(0),
    duration: 31536000, // 1 year in seconds
    commitTxHash: '',
    registerTxHash: ''
  };
  
  let initialState = 'idle';
  
  if (isBrowser) {
    try {
      const savedCommitment = localStorage.getItem(COMMITMENT_KEY);
      const savedSecret = localStorage.getItem(SECRET_KEY);
      const savedName = localStorage.getItem(NAME_KEY);
      const savedTimestamp = localStorage.getItem(COMMIT_TIMESTAMP_KEY);
      const savedRentPrice = localStorage.getItem(RENT_PRICE_KEY);
      const savedDuration = localStorage.getItem(DURATION_KEY);
      const savedCommitTxHash = localStorage.getItem(COMMIT_TX_HASH_KEY);
      const savedRegisterTxHash = localStorage.getItem(REGISTER_TX_HASH_KEY);

      if (savedCommitment) defaultData.commitment = savedCommitment;
      if (savedSecret) defaultData.secret = savedSecret;
      if (savedName) defaultData.name = savedName;
      if (savedTimestamp) defaultData.commitTimestamp = parseInt(savedTimestamp);
      if (savedRentPrice) defaultData.rentPriceWei = BigInt(savedRentPrice);
      if (savedDuration) defaultData.duration = parseInt(savedDuration);
      if (savedCommitTxHash) defaultData.commitTxHash = savedCommitTxHash;
      if (savedRegisterTxHash) defaultData.registerTxHash = savedRegisterTxHash;
      
      if (savedCommitment && savedSecret && savedName && savedTimestamp) {
        const now = Date.now();
        const commitTime = parseInt(savedTimestamp);
        
        if (savedRegisterTxHash) {
          initialState = 'registered';
        }
        else if (now - commitTime < 24 * 60 * 60 * 1000) {
          if (now - commitTime >= 60 * 1000) {
            initialState = 'readyToRegister';
          } else {
            initialState = 'waitingForCommitment';
          }
        }
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
    }
  }

  return { data: defaultData, initialState };
};

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    if (isBrowser) {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        console.error(`Error getting ${key} from localStorage:`, error);
      }
    }
    return null;
  },
  
  setItem: (key: string, value: string): void => {
    if (isBrowser) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.error(`Error setting ${key} in localStorage:`, error);
      }
    }
  },
  
  removeItem: (key: string): void => {
    if (isBrowser) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`Error removing ${key} from localStorage:`, error);
      }
    }
  }
};

export const registrarMachine = setup({
  types: {} as {
    context: RegistrarContext;
    events: RegistrarEvent;
  },
  actions: {
    // Actions to update context
    setName: assign({
      name: ({ event }) => {
        if (event.type === 'SET_NAME') {
          return event.name;
        }
        return '';
      },
      error: ({ context, event }) => {
        if (event.type === 'SET_NAME') {
          if (context.error && context.error.includes('not available')) {
            return '';
          }
          return context.error;
        }
        return context.error;
      }
    }),
    
    setDuration: assign({
      duration: ({ event }) => {
        if (event.type === 'SET_DURATION') {
          return event.duration;
        }
        return 31536000; // Default to 1 year
      }
    }),
    
    setError: assign({
      error: ({ event }) => {
        if (event.type === 'ERROR') {
          return event.message;
        }
        return '';
      }
    }),
    
    clearError: assign({
      error: () => ''
    }),
    
    setAvailabilityResult: assign({
      isAvailable: ({ event }) => {
        if (event.type === 'AVAILABILITY_RESULT') {
          return event.isAvailable;
        }
        return null;
      },
      rentPriceWei: ({ event }) => {
        if (event.type === 'AVAILABILITY_RESULT' && event.rentPriceWei) {
          return event.rentPriceWei;
        }
        return BigInt(0);
      },
      error: ({ event, context }) => {
        if (event.type === 'AVAILABILITY_RESULT' && !event.isAvailable) {
          return `${context.name}.eth is not available`;
        }
        return '';
      }
    }),
    
    setCommitmentResult: assign({
      commitment: ({ event }) => {
        if (event.type === 'COMMITMENT_RESULT') {
          return event.commitment;
        }
        return '';
      },
      secret: ({ event }) => {
        if (event.type === 'COMMITMENT_RESULT') {
          return event.secret;
        }
        return '';
      },
      commitTimestamp: ({ event }) => {
        if (event.type === 'COMMITMENT_RESULT') {
          return event.timestamp;
        }
        return 0;
      },
      commitTxHash: ({ event }) => {
        if (event.type === 'COMMITMENT_RESULT') {
          return event.txHash;
        }
        return '';
      }
    }),
    
    updateRemainingTime: assign({
      remainingTime: ({ event }) => {
        if (event.type === 'TIMER_TICK') {
          return event.remainingTime;
        }
        return 0;
      }
    }),
    
    setRegistrationResult: assign({
      registerTxHash: ({ event }) => {
        if (event.type === 'REGISTRATION_RESULT') {
          return event.txHash;
        }
        return '';
      }
    }),
    
    resetRegistration: assign({
      name: () => '',
      duration: () => 31536000,
      isAvailable: () => null,
      error: () => '',
      secret: () => '',
      commitment: () => '',
      commitTimestamp: () => 0,
      remainingTime: () => 0,
      rentPriceWei: () => BigInt(0),
      commitTxHash: () => '',
      registerTxHash: () => ''
    }),
    
    clearStorage: () => {
      safeLocalStorage.removeItem(COMMITMENT_KEY);
      safeLocalStorage.removeItem(SECRET_KEY);
      safeLocalStorage.removeItem(NAME_KEY);
      safeLocalStorage.removeItem(COMMIT_TIMESTAMP_KEY);
      safeLocalStorage.removeItem(RENT_PRICE_KEY);
      safeLocalStorage.removeItem(DURATION_KEY);
      safeLocalStorage.removeItem(COMMIT_TX_HASH_KEY);
      safeLocalStorage.removeItem(REGISTER_TX_HASH_KEY);
    },
    
    saveCommitmentData: ({ context }) => {
      safeLocalStorage.setItem(COMMITMENT_KEY, context.commitment);
      safeLocalStorage.setItem(SECRET_KEY, context.secret);
      safeLocalStorage.setItem(NAME_KEY, context.name);
      safeLocalStorage.setItem(COMMIT_TIMESTAMP_KEY, context.commitTimestamp.toString());
      safeLocalStorage.setItem(RENT_PRICE_KEY, context.rentPriceWei.toString());
      safeLocalStorage.setItem(DURATION_KEY, context.duration.toString());
      safeLocalStorage.setItem(COMMIT_TX_HASH_KEY, context.commitTxHash);
    },
    
    clearCommitmentData: () => {
      safeLocalStorage.removeItem(COMMITMENT_KEY);
      safeLocalStorage.removeItem(SECRET_KEY);
      safeLocalStorage.removeItem(NAME_KEY);
      safeLocalStorage.removeItem(COMMIT_TIMESTAMP_KEY);
      safeLocalStorage.removeItem(RENT_PRICE_KEY);
      safeLocalStorage.removeItem(DURATION_KEY);
    },
    
    saveRegistrationTxHash: ({ context }) => {
      safeLocalStorage.setItem(REGISTER_TX_HASH_KEY, context.registerTxHash);
    }
  },
  guards: {
    hasName: ({ context }) => !!context.name && context.name.length > 0,
    hasCommitmentData: ({ context }) => !!context.commitment && !!context.secret
  }
}).createMachine({
  id: 'registrar',
  context: () => {
    const { data } = loadSavedData();
    return {
      name: data.name,
      duration: data.duration,
      isAvailable: null,
      error: '',
      secret: data.secret,
      commitment: data.commitment,
      commitTimestamp: data.commitTimestamp,
      remainingTime: 60,
      rentPriceWei: data.rentPriceWei,
      commitTxHash: data.commitTxHash,
      registerTxHash: data.registerTxHash
    };
  },
  initial: loadSavedData().initialState,
  states: {
    idle: {
      meta: {
        step: RegistrationStep.InputName
      },
      on: {
        SET_NAME: {
          actions: 'setName'
        },
        SET_DURATION: {
          actions: 'setDuration'
        },
        CHECK_AVAILABILITY: {
          guard: 'hasName',
          target: 'checkingAvailability',
          actions: 'clearError'
        }
      }
    },
    
    checkingAvailability: {
      meta: {
        step: RegistrationStep.CheckingAvailability
      },
      on: {
        AVAILABILITY_RESULT: [
          {
            guard: ({ event }) => event.isAvailable,
            target: 'available',
            actions: 'setAvailabilityResult'
          },
          {
            target: 'idle',
            actions: 'setAvailabilityResult'
          }
        ],
        ERROR: {
          target: 'idle',
          actions: 'setError'
        },
        SET_NAME: {
          actions: 'setName'
        }
      }
    },
    
    available: {
      meta: {
        step: RegistrationStep.MakeCommitment
      },
      on: {
        MAKE_COMMITMENT: {
          target: 'makingCommitment',
          actions: 'clearError'
        },
        RESET: {
          target: 'idle',
          actions: ['resetRegistration', 'clearStorage']
        },
        SET_NAME: {
          target: 'idle',
          actions: 'setName'
        }
      }
    },
    
    makingCommitment: {
      on: {
        COMMITMENT_RESULT: {
          target: 'waitingForCommitment',
          actions: ['setCommitmentResult', 'saveCommitmentData']
        },
        ERROR: {
          target: 'available',
          actions: 'setError'
        }
      }
    },
    
    waitingForCommitment: {
      meta: {
        step: RegistrationStep.WaitForCommitment
      },
      on: {
        TIMER_TICK: {
          actions: 'updateRemainingTime'
        },
        TIMER_COMPLETE: {
          target: 'readyToRegister'
        },
        RESET: {
          target: 'idle',
          actions: ['resetRegistration', 'clearStorage']
        }
      }
    },
    
    readyToRegister: {
      meta: {
        step: RegistrationStep.Register
      },
      on: {
        REGISTER: {
          guard: 'hasCommitmentData',
          target: 'registering',
          actions: 'clearError'
        },
        RESET: {
          target: 'idle',
          actions: ['resetRegistration', 'clearStorage']
        }
      }
    },
    
    registering: {
      on: {
        REGISTRATION_RESULT: {
          target: 'registered',
          actions: ['setRegistrationResult', 'clearCommitmentData', 'saveRegistrationTxHash']
        },
        ERROR: {
          target: 'readyToRegister',
          actions: 'setError'
        }
      }
    },
    
    registered: {
      meta: {
        step: RegistrationStep.Success
      },
      on: {
        RESET: {
          target: 'idle',
          actions: ['resetRegistration', 'clearStorage']
        }
      }
    }
  },
  on: {
    RESET: {
      target: '.idle',
      actions: ['resetRegistration', 'clearStorage']
    },
    ERROR: {
      actions: 'setError'
    }
  }
});